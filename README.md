# Fuji Sim

A photo filter that recreates five Fujifilm X100V/X100VI film simulation looks —
**Classic Negative**, **Classic Chrome**, **Acros**, **Velvia** and **Provia** — on any
photo you give it.

Everything runs on your own machine. The photo is decoded, graded and encoded in the
browser; it is never uploaded, and the page makes no network requests at all once it has
loaded.

## The landing

The empty state is a camera viewfinder that is never actually empty: a sample frame cycles
through all five simulations, with frame corners, rule-of-thirds guides and a status readout,
and the film list drives it. You can play with the looks before committing a photo — the app
demonstrates itself instead of showing you a box and waiting.

The status bar doubles as the privacy notice. Typography is a system monospace stack rather
than a web font, on purpose: a page that promises nothing leaves your device shouldn't open
by calling a font CDN.

## Using it

1. Drop a photo in — or click, or paste from the clipboard.
2. Pick a film. The five thumbnails are rendered from *your* photo, so you are choosing a
   look rather than reading a label.
3. Set intensity and grain. Exposure, contrast, grain size and vignette live under
   **Adjust**.
4. Hit **Compare** to drag a before/after divider, or hold <kbd>B</kbd> for the original.
5. Download a full-resolution JPEG.

Keyboard: <kbd>1</kbd>–<kbd>5</kbd> switch film, <kbd>C</kbd> toggles compare,
<kbd>B</kbd> (held) shows the original.

## How the looks are built

Each simulation is a stack of stages, not a single filter, and the order is the whole
trick. `src/gl/film.frag.glsl` runs them in this sequence:

| # | Stage | Space | Why there |
|---|-------|-------|-----------|
| 1 | sRGB decode | — | Real piecewise transfer function, not `pow(x, 2.2)` |
| 2 | Exposure | linear | Where scaling light is physically correct |
| 3 | Channel matrix | linear | Dye-layer cross-talk is a linear-light effect |
| 4 | Tone curves | display | Where a control point at 0.5 means middle grey |
| 5 | Hue-targeted saturation | display | Per-hue-band gains, smoothly interpolated |
| 6 | Split toning | display | Luminance-weighted shadow and highlight tints |
| 7 | Gamut compression | display | Keeps boosted colour from clipping into a flat blob |
| 8 | Contrast | display | Soft S about middle grey |
| 9 | Intensity crossfade | display | Blends the graded result against the plain photo |
| 10 | Grain | display | Frame-relative, luminance-weighted |
| 11 | Vignette | display | Aspect-aware corner falloff |

Every number that defines a look lives in [`src/sims/simulations.ts`](src/sims/simulations.ts)
as readable data — curve control points, a 3×3 matrix, six hue gains, two tints. Curves are
interpolated with a **monotone cubic** (Fritsch–Carlson) so a curve can never overshoot and
run backwards, then baked into a 256×1 texture the shader samples.

Two details worth knowing, because both are easy to get wrong:

- **Intensity 0 is bit-exact.** The shader short-circuits when every control is neutral and
  returns the original sample, so the before/after comparison is exact rather than nearly
  exact.
- **Grain is sized against the frame, not the pixel grid.** Sizing grain in raw pixels would
  make a 6000px export finer-grained *relative to the photo* than the 2560px preview it was
  judged on. Grain belongs to the negative, not to the resolution you scanned it at.

## Running it

```bash
npm install
npm run dev
```

```bash
npm test        # curve and simulation invariants
npm run lint    # oxlint
npm run format  # prettier
npm run build   # typecheck + production bundle
```

The tests cover what can be checked on the CPU: curve monotonicity, matrix rows summing to
1 so neutrals keep no cast, and the Classic Negative signature. Colour response is verified
against the GPU in the browser, since the grading only exists as a shader.

## Limitations

- Needs **WebGL2**. The page says so plainly rather than rendering something broken.
- **HEIC** decodes in Safari but not Chrome or Firefox — iPhone photos may need exporting
  as JPEG first. The app detects this and says which.
- Very large photos are downscaled to the GPU's maximum texture size before export.

## Credits

The sample frame on the landing page is a personal photograph, included with the owner's
permission.

## Licence and trademarks

An independent homage. Not affiliated with, endorsed by, or connected to Fujifilm.
Classic Negative, Classic Chrome, Acros, Velvia and Provia are trademarks of FUJIFILM
Corporation, used here only to say which look is which.
