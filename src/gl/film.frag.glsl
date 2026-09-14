#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uImage;
/** 256x1 RGBA: the three per-channel tone curves, baked on the CPU. */
uniform sampler2D uCurve;

/** Source resolution in pixels. Grain is sized against this, never the screen. */
uniform vec2 uImageSize;

// --- film simulation character -------------------------------------------
uniform mat3 uMatrix;
uniform float uHueGains[6];
uniform float uGlobalSat;
uniform vec3 uShadowTint;
uniform float uShadowStrength;
uniform vec3 uHighlightTint;
uniform float uHighlightStrength;
uniform bool uMono;
uniform vec3 uPanchromatic;

// --- user controls --------------------------------------------------------
uniform float uIntensity;
uniform float uExposure;
uniform float uContrast;
uniform float uGrainAmount;
uniform float uGrainSize;
uniform float uVignette;
uniform float uGrainSeed;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

/**
 * Grain is sized against a frame of this many pixels on the long edge, then
 * scaled to whatever the actual resolution is.
 *
 * Sizing grain in raw pixels instead is subtly wrong: the full-resolution export
 * would carry the same grain in *pixel* terms as the preview, and therefore much
 * finer grain relative to the photo -- so the file would not match the preview it
 * was judged on. Real grain belongs to the negative, not to the resolution it
 * happened to be scanned at.
 */
const float GRAIN_REFERENCE = 1500.0;

// -------------------------------------------------------------------------
// sRGB transfer functions. The real piecewise curve, not pow(x, 2.2) -- the
// linear segment near black is exactly where shadow-lifting film looks live,
// and the approximation is worst there.
// -------------------------------------------------------------------------

vec3 srgbToLinear(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  vec3 lo = c / 12.92;
  return mix(lo, hi, step(0.04045, c));
}

vec3 linearToSrgb(vec3 c) {
  c = max(c, 0.0);
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  vec3 lo = c * 12.92;
  return mix(lo, hi, step(0.0031308, c));
}

// -------------------------------------------------------------------------
// Grading stages
// -------------------------------------------------------------------------

/** Samples the baked curve LUT at texel centres so LINEAR filtering interpolates
    between entries instead of smearing past the ends. */
vec3 applyCurves(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  float u = 1.0 / 256.0;
  return vec3(
    texture(uCurve, vec2(c.r * 255.0 * u + 0.5 * u, 0.5)).r,
    texture(uCurve, vec2(c.g * 255.0 * u + 0.5 * u, 0.5)).g,
    texture(uCurve, vec2(c.b * 255.0 * u + 0.5 * u, 0.5)).b
  );
}

/** Hue in 0..1. Returns 0 for neutrals, where hue is meaningless anyway. */
float hueOf(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float d = mx - mn;
  if (d < 1e-5) return 0.0;

  float h;
  if (mx == c.r) {
    h = mod((c.g - c.b) / d, 6.0);
  } else if (mx == c.g) {
    h = (c.b - c.r) / d + 2.0;
  } else {
    h = (c.r - c.g) / d + 4.0;
  }
  return h / 6.0;
}

/** Interpolates the six hue-band gains into a continuous function of hue. */
float hueGain(float h) {
  float x = fract(h) * 6.0;
  int i0 = int(floor(x));
  int i1 = int(mod(float(i0 + 1), 6.0));
  float f = smoothstep(0.0, 1.0, fract(x));
  return mix(uHueGains[i0], uHueGains[i1], f);
}

/** Saturation around luminance. Amount 0 = grey, 1 = unchanged, >1 = boosted. */
vec3 saturation(vec3 c, float amount) {
  return mix(vec3(dot(c, LUMA)), c, amount);
}

/**
 * Pulls chroma back toward luminance, but only as far as needed to bring every
 * channel into range.
 *
 * Without this, a saturation boost drives channels past 0 or 1 and the final
 * clamp flattens them: a deep red goes to pure 255,0,0 and every bit of detail
 * in the flower petal is gone. Scaling chroma instead keeps hue and luminance
 * intact and simply lets the colour be as saturated as it can actually be.
 */
vec3 gamutCompress(vec3 c) {
  float l = clamp(dot(c, LUMA), 0.0, 1.0);
  float mx = max(max(c.r, c.g), c.b);
  float mn = min(min(c.r, c.g), c.b);

  float scale = 1.0;
  if (mx > 1.0) scale = min(scale, (1.0 - l) / max(mx - l, 1e-5));
  if (mn < 0.0) scale = min(scale, -l / min(mn - l, -1e-5));

  return l + (c - l) * clamp(scale, 0.0, 1.0);
}

vec3 splitTone(vec3 c) {
  float l = clamp(dot(c, LUMA), 0.0, 1.0);
  // Squared weights keep the tint out of the midtones, so it colours the
  // extremes without casting the whole frame.
  float shadowW = (1.0 - l) * (1.0 - l);
  float highW = l * l;
  c += uShadowTint * uShadowStrength * shadowW;
  c += uHighlightTint * uHighlightStrength * highW;
  return c;
}

/** Contrast about middle grey. Positive rolls into an S; negative flattens. */
vec3 applyContrast(vec3 c, float amount) {
  vec3 x = clamp(c, 0.0, 1.0);
  if (amount > 0.0) {
    // smoothstep is a gentle S that lands on 0 and 1 with zero slope, so it
    // compresses toward the ends rather than clipping at them.
    return mix(x, smoothstep(0.0, 1.0, x), amount);
  }
  return mix(x, 0.5 + (x - 0.5) * 0.55, -amount);
}

// -------------------------------------------------------------------------
// Grain
// -------------------------------------------------------------------------

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

/**
 * Frame-relative grain coordinates: the same point on the photo lands on the
 * same grain regardless of how many pixels the photo is made of.
 */
vec2 grainCoord(vec2 uv) {
  float longEdge = max(max(uImageSize.x, uImageSize.y), 1.0);
  return uv * (uImageSize / longEdge) * GRAIN_REFERENCE;
}

/** Smooth value noise on a grid of `cell` reference-pixels. */
float valueNoise(vec2 p0, float cell) {
  vec2 p = p0 / max(cell, 0.5) + uGrainSeed;
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 applyGrain(vec3 c, vec2 uv) {
  if (uGrainAmount <= 0.0) return c;

  vec2 p = grainCoord(uv);
  // Two octaves: the coarse one gives grain clumps, the fine one keeps it from
  // looking like blurred blobs. One octave alone reads as either static or soup.
  float n = 0.65 * valueNoise(p, uGrainSize)
          + 0.35 * valueNoise(p * 2.17, uGrainSize);
  n -= 0.5;

  // Silver halide is densest in the midtones: grain all but vanishes in a solid
  // black and in a blown highlight. A flat overlay is the tell of fake grain.
  float l = clamp(dot(c, LUMA), 0.0, 1.0);
  float weight = mix(0.3, 1.0, 4.0 * l * (1.0 - l));

  return c + n * uGrainAmount * weight;
}

vec3 applyVignette(vec3 c, vec2 uv) {
  if (uVignette <= 0.0) return c;
  // Normalised so d reaches ~1 in the corners: the falloff tracks the frame,
  // which is what a lens actually does.
  float d = length(uv - 0.5) * 1.4142136;
  return c * (1.0 - uVignette * smoothstep(0.3, 1.05, d));
}

// -------------------------------------------------------------------------

/** The film look itself. Input is linear light, output is display-referred. */
vec3 filmLook(vec3 lin) {
  // Channel cross-talk belongs in linear light -- it is a dye-layer effect.
  vec3 mixed = uMatrix * lin;

  if (uMono) {
    // A panchromatic emulsion integrates linear light, so the black-and-white
    // conversion happens here rather than after encoding.
    float l = dot(max(mixed, 0.0), uPanchromatic);
    return applyCurves(linearToSrgb(vec3(l)));
  }

  // Everything below is display-referred: that is where curve control points
  // and saturation numbers mean what a person expects them to mean.
  vec3 col = applyCurves(linearToSrgb(mixed));
  col = saturation(col, uGlobalSat * hueGain(hueOf(col)));
  // Compress after toning too: a tint can push a channel out of range just as
  // easily as a saturation boost can.
  return gamutCompress(splitTone(col));
}

void main() {
  vec3 texel = texture(uImage, vUv).rgb;

  // With every control neutral, hand back the original sample untouched. Makes
  // the before/after comparison exact rather than merely close.
  if (uIntensity <= 0.0 && uExposure == 0.0 && uContrast == 0.0
      && uGrainAmount <= 0.0 && uVignette <= 0.0) {
    fragColor = vec4(texel, 1.0);
    return;
  }

  vec3 lin = srgbToLinear(texel) * exp2(uExposure);

  // Two paths: the photo with only the user's corrections, and the same photo
  // with the film look on top. Intensity crossfades between them, which is why
  // exposure and contrast survive at intensity 0.
  vec3 base = applyContrast(linearToSrgb(lin), uContrast);
  vec3 graded = applyContrast(filmLook(lin), uContrast);

  vec3 col = mix(base, graded, uIntensity);

  // Grain and vignette sit outside the crossfade: they have their own sliders
  // and are not part of "how much film look".
  col = applyGrain(col, vUv);
  col = applyVignette(col, vUv);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
