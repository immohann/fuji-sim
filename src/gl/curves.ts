/**
 * Turns hand-authored curve control points into a 256-entry lookup table.
 *
 * Interpolation is monotone cubic (Fritsch-Carlson). Plain Catmull-Rom would
 * overshoot between unevenly spaced points, which on a tone curve shows up as a
 * curve that briefly runs *backwards* -- highlights getting darker as the input
 * gets brighter. Monotone tangents make that impossible, so a curve can only
 * ever be as weird as the points you actually wrote.
 */

export type CurvePoint = readonly [input: number, output: number]

const LUT_SIZE = 256

/** Fritsch-Carlson tangents: slopes that guarantee no overshoot. */
function monotoneTangents(xs: number[], ys: number[]): number[] {
  const n = xs.length
  const secants = new Array<number>(n - 1)
  for (let i = 0; i < n - 1; i++) {
    secants[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i])
  }

  const tangents = new Array<number>(n)
  tangents[0] = secants[0]
  tangents[n - 1] = secants[n - 2]

  for (let i = 1; i < n - 1; i++) {
    // A sign change (or a flat run) means this point is a local extremum:
    // pin the tangent flat so the curve cannot bulge past it.
    if (secants[i - 1] * secants[i] <= 0) {
      tangents[i] = 0
    } else {
      tangents[i] = (secants[i - 1] + secants[i]) / 2
    }
  }

  // Clamp tangents into the Fritsch-Carlson monotonicity region.
  for (let i = 0; i < n - 1; i++) {
    const s = secants[i]
    if (s === 0) {
      tangents[i] = 0
      tangents[i + 1] = 0
      continue
    }
    const a = tangents[i] / s
    const b = tangents[i + 1] / s
    const h = Math.hypot(a, b)
    if (h > 3) {
      const t = 3 / h
      tangents[i] = t * a * s
      tangents[i + 1] = t * b * s
    }
  }

  return tangents
}

/** Samples a curve defined by control points into `LUT_SIZE` values in 0..1. */
export function bakeCurve(points: readonly CurvePoint[]): Float32Array {
  const sorted = [...points].sort((a, b) => a[0] - b[0])
  const xs = sorted.map((p) => p[0])
  const ys = sorted.map((p) => p[1])

  const out = new Float32Array(LUT_SIZE)

  if (xs.length === 1) {
    out.fill(ys[0])
    return out
  }

  const tangents = monotoneTangents(xs, ys)
  let seg = 0

  for (let i = 0; i < LUT_SIZE; i++) {
    const x = i / (LUT_SIZE - 1)

    if (x <= xs[0]) {
      out[i] = ys[0]
      continue
    }
    if (x >= xs[xs.length - 1]) {
      out[i] = ys[ys.length - 1]
      continue
    }

    while (seg < xs.length - 2 && x > xs[seg + 1]) seg++

    const h = xs[seg + 1] - xs[seg]
    const t = (x - xs[seg]) / h
    const t2 = t * t
    const t3 = t2 * t

    // Hermite basis.
    const h00 = 2 * t3 - 3 * t2 + 1
    const h10 = t3 - 2 * t2 + t
    const h01 = -2 * t3 + 3 * t2
    const h11 = t3 - t2

    out[i] =
      h00 * ys[seg] + h10 * h * tangents[seg] + h01 * ys[seg + 1] + h11 * h * tangents[seg + 1]
  }

  // Control points are authored in 0..1; clamp so a typo can't emit NaN territory.
  for (let i = 0; i < LUT_SIZE; i++) {
    out[i] = Math.min(1, Math.max(0, out[i]))
  }

  return out
}

/**
 * Packs three baked channel curves into one RGBA8 row, ready to upload as a
 * 256x1 texture. Alpha is unused but RGBA keeps the upload on a 4-byte stride,
 * which every driver is happy with.
 */
export function packCurveTexture(
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
): Uint8Array {
  const data = new Uint8Array(LUT_SIZE * 4)
  for (let i = 0; i < LUT_SIZE; i++) {
    data[i * 4 + 0] = Math.round(r[i] * 255)
    data[i * 4 + 1] = Math.round(g[i] * 255)
    data[i * 4 + 2] = Math.round(b[i] * 255)
    data[i * 4 + 3] = 255
  }
  return data
}

export { LUT_SIZE }
