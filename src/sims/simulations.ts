import type { CurvePoint } from '../gl/curves'

export type SimId = 'provia' | 'velvia' | 'classic-chrome' | 'classic-negative' | 'acros'

/**
 * Hue-targeted saturation gains, sampled at six evenly spaced hues and
 * interpolated smoothly in the shader.
 *
 * Index: 0 red (0deg), 1 yellow (60), 2 green (120), 3 cyan (180), 4 blue (240),
 * 5 magenta (300).
 */
export type HueGains = readonly [number, number, number, number, number, number]

export interface FilmSim {
  readonly id: SimId
  readonly name: string
  /** One line of UI copy: what this stock is for. */
  readonly blurb: string

  /**
   * 3x3 channel-mix matrix, row-major, applied in LINEAR light where dye
   * cross-talk actually lives. Every row sums to 1.0 so neutral greys survive
   * untinted -- if you edit these, keep that true or the whole image casts.
   */
  readonly matrix: readonly number[]

  /** Per-channel tone curves, authored in DISPLAY space (0.5 = middle grey). */
  readonly curves: {
    readonly r: readonly CurvePoint[]
    readonly g: readonly CurvePoint[]
    readonly b: readonly CurvePoint[]
  }

  readonly globalSat: number
  readonly hueGains: HueGains

  /** Split toning. Tints are signed RGB offsets, strength scales them. */
  readonly shadowTint: readonly [number, number, number]
  readonly shadowStrength: number
  readonly highlightTint: readonly [number, number, number]
  readonly highlightStrength: number

  readonly monochrome: boolean
  /** Panchromatic luminance weights, used only when `monochrome`. */
  readonly panchromatic: readonly [number, number, number]

  /** Multiplier on the user's grain slider -- some stocks are grainier. */
  readonly grainBias: number
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1]
const NO_TINT = [0, 0, 0] as const
const REC709 = [0.2126, 0.7152, 0.0722] as const

export const SIMULATIONS: readonly FilmSim[] = [
  {
    id: 'provia',
    name: 'Provia',
    blurb: 'Standard. Neutral and true — the reference the others deviate from.',
    matrix: IDENTITY,
    // Barely an S-curve. Provia's job is to look like the scene.
    curves: {
      r: [[0, 0], [0.25, 0.243], [0.5, 0.5], [0.75, 0.762], [1, 1]],
      g: [[0, 0], [0.25, 0.243], [0.5, 0.5], [0.75, 0.762], [1, 1]],
      b: [[0, 0], [0.25, 0.243], [0.5, 0.5], [0.75, 0.762], [1, 1]],
    },
    globalSat: 1.06,
    hueGains: [1, 1, 1, 1, 1, 1],
    shadowTint: NO_TINT,
    shadowStrength: 0,
    highlightTint: NO_TINT,
    highlightStrength: 0,
    monochrome: false,
    panchromatic: REC709,
    grainBias: 0.85,
  },

  {
    id: 'velvia',
    name: 'Velvia',
    blurb: 'Vivid. Landscape slide film — deep blacks, electric greens and blues.',
    // Negative off-diagonals pull each channel away from the others, which is
    // what makes slide film's colour separation feel "thick" rather than just
    // turned-up. Rows still sum to 1.
    matrix: [
      1.08, -0.05, -0.03,
      -0.045, 1.075, -0.03,
      -0.035, -0.055, 1.09,
    ],
    // Hard S: crushed toe, bright shoulder. Blue toe sits lowest so skies go rich.
    curves: {
      r: [[0, 0], [0.2, 0.152], [0.5, 0.512], [0.8, 0.868], [1, 1]],
      g: [[0, 0], [0.2, 0.148], [0.5, 0.506], [0.8, 0.862], [1, 1]],
      b: [[0, 0], [0.2, 0.142], [0.5, 0.5], [0.8, 0.856], [1, 1]],
    },
    globalSat: 1.17,
    hueGains: [1.06, 1.0, 1.045, 1.015, 1.075, 1.015],
    shadowTint: [-0.01, 0, 0.03],
    shadowStrength: 0.18,
    highlightTint: [0.02, 0.01, 0],
    highlightStrength: 0.1,
    monochrome: false,
    panchromatic: REC709,
    grainBias: 0.7,
  },

  {
    id: 'classic-chrome',
    name: 'Classic Chrome',
    blurb: 'Muted and documentary. Holds midtone contrast, drains the colour.',
    // Rows pull slightly toward each other: the opposite of Velvia, and the
    // reason this reads as reportage rather than desaturated-Provia.
    matrix: [
      0.94, 0.04, 0.02,
      0.04, 0.93, 0.03,
      0.03, 0.05, 0.92,
    ],
    // Lifted toe + clipped shoulder = the flat, printed look. Blue is lifted
    // most in shadow and pulled most in highlight: cool shadows, warm highlights.
    curves: {
      r: [[0, 0.026], [0.25, 0.226], [0.5, 0.497], [0.75, 0.757], [1, 0.976]],
      g: [[0, 0.028], [0.25, 0.224], [0.5, 0.49], [0.75, 0.75], [1, 0.968]],
      b: [[0, 0.046], [0.25, 0.244], [0.5, 0.487], [0.75, 0.733], [1, 0.947]],
    },
    globalSat: 0.8,
    // Yellows and greens take the biggest hit -- that's the Kodachrome-ish
    // signature that keeps foliage and daylight from looking cheerful.
    hueGains: [0.88, 0.67, 0.7, 0.86, 0.93, 0.85],
    shadowTint: [0, 0.01, 0.04],
    shadowStrength: 0.22,
    highlightTint: [0.04, 0.02, -0.02],
    highlightStrength: 0.16,
    monochrome: false,
    panchromatic: REC709,
    grainBias: 1.0,
  },

  {
    id: 'classic-negative',
    name: 'Classic Negative',
    blurb: 'Faded Superia. Teal shadows, warm highlights, hard tonal separation.',
    matrix: [
      1.06, -0.02, -0.04,
      -0.03, 1.04, -0.01,
      -0.02, -0.06, 1.08,
    ],
    // The whole look is in the blue channel's divergence: lifted well above red
    // and green in the toe (teal shadows), dragged well below them in the
    // shoulder (warm highlights). Red's high toe keeps the fade from going cold.
    curves: {
      r: [[0, 0.055], [0.2, 0.186], [0.5, 0.522], [0.8, 0.852], [1, 0.985]],
      g: [[0, 0.052], [0.2, 0.176], [0.5, 0.496], [0.8, 0.828], [1, 0.976]],
      b: [[0, 0.086], [0.2, 0.216], [0.5, 0.47], [0.8, 0.788], [1, 0.955]],
    },
    globalSat: 0.93,
    // Greens pushed down and cyans up: grass goes olive, skies go teal.
    hueGains: [0.95, 0.84, 0.77, 1.12, 1.06, 0.97],
    shadowTint: [-0.02, 0.06, 0.13],
    shadowStrength: 0.38,
    highlightTint: [0.07, 0.02, -0.05],
    highlightStrength: 0.17,
    monochrome: false,
    panchromatic: REC709,
    grainBias: 1.15,
  },

  {
    id: 'acros',
    name: 'Acros',
    blurb: 'Monochrome. Deep blacks that still hold detail, long smooth midtones.',
    matrix: IDENTITY,
    // Extra control points through the toe: the curve dives for a real black but
    // flattens just above it, so shadows stay readable instead of going to mud.
    curves: {
      r: [[0, 0], [0.12, 0.072], [0.3, 0.252], [0.5, 0.5], [0.75, 0.796], [0.92, 0.942], [1, 1]],
      g: [[0, 0], [0.12, 0.072], [0.3, 0.252], [0.5, 0.5], [0.75, 0.796], [0.92, 0.942], [1, 1]],
      b: [[0, 0], [0.12, 0.072], [0.3, 0.252], [0.5, 0.5], [0.75, 0.796], [0.92, 0.942], [1, 1]],
    },
    globalSat: 0,
    hueGains: [1, 1, 1, 1, 1, 1],
    shadowTint: NO_TINT,
    shadowStrength: 0,
    highlightTint: NO_TINT,
    highlightStrength: 0,
    monochrome: true,
    // Rec.601-ish rather than Rec.709: a panchromatic emulsion is far more
    // red-sensitive than the human luminance response, which is why skies go
    // dramatic and skin goes bright on real black-and-white film.
    panchromatic: [0.299, 0.587, 0.114],
    grainBias: 1.5,
  },
]

export const DEFAULT_SIM: SimId = 'classic-negative'

export function getSim(id: SimId): FilmSim {
  const found = SIMULATIONS.find((s) => s.id === id)
  if (!found) throw new Error(`Unknown film simulation: ${id}`)
  return found
}
