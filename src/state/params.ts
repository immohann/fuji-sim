import type { SimId } from '../sims/simulations'
import { DEFAULT_SIM } from '../sims/simulations'

export interface Params {
  /** How much of the film look to apply. 0 = untouched original. */
  intensity: number
  /** 0..1, scaled into actual pixel deviation by the renderer. */
  grainAmount: number
  /** Grain cell size in IMAGE pixels, so preview and export match. */
  grainSize: number
  /** Stops. */
  exposure: number
  /** -1..1. */
  contrast: number
  /** 0..1 corner darkening. */
  vignette: number
}

export const DEFAULT_PARAMS: Params = {
  intensity: 0.85,
  grainAmount: 0.3,
  grainSize: 1.6,
  exposure: 0,
  contrast: 0,
  vignette: 0,
}

export interface SliderSpec {
  key: keyof Params
  label: string
  min: number
  max: number
  step: number
  /** Renders the value for display next to the label. */
  format: (v: number) => string
}

const pct = (v: number) => `${Math.round(v * 100)}`
const signedPct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`

/** Always visible -- the two controls the brief asks for. */
export const PRIMARY_SLIDERS: readonly SliderSpec[] = [
  { key: 'intensity', label: 'Intensity', min: 0, max: 1, step: 0.01, format: pct },
  { key: 'grainAmount', label: 'Grain', min: 0, max: 1, step: 0.01, format: pct },
]

/** Tucked behind "Adjust" so the default view stays photo-first. */
export const SECONDARY_SLIDERS: readonly SliderSpec[] = [
  {
    key: 'exposure',
    label: 'Exposure',
    min: -1.5,
    max: 1.5,
    step: 0.05,
    format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} EV`,
  },
  { key: 'contrast', label: 'Contrast', min: -1, max: 1, step: 0.01, format: signedPct },
  {
    key: 'grainSize',
    // Unitless on purpose: grain is sized against the frame, not the pixel
    // grid, so "px" would be a lie at any resolution but the reference one.
    label: 'Grain size',
    min: 1,
    max: 4,
    step: 0.1,
    format: (v) => v.toFixed(1),
  },
  { key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01, format: pct },
]

export interface EditorState {
  sim: SimId
  params: Params
}

export const INITIAL_STATE: EditorState = {
  sim: DEFAULT_SIM,
  params: DEFAULT_PARAMS,
}
