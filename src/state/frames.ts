import type { LoadedImage } from '../image/loadImage'
import type { SimId } from '../sims/simulations'
import { DEFAULT_SIM } from '../sims/simulations'
import type { Params } from './params'
import { DEFAULT_PARAMS } from './params'

/**
 * One loaded photo together with its own film and its own settings.
 *
 * Edits are per-frame on purpose: switching between photos should feel like
 * picking up a different print, not like carrying one set of sliders around.
 */
export interface Frame {
  id: string
  image: LoadedImage
  sim: SimId
  params: Params
}

/**
 * Upper bound on loaded photos. Each frame holds a preview bitmap of up to
 * 2560px on the long edge -- roughly 17MB resident -- so this is the difference
 * between a full tray and a dead tab.
 */
export const MAX_FRAMES = 12

export interface EditorState {
  frames: Frame[]
  activeId: string | null
}

export const INITIAL_STATE: EditorState = { frames: [], activeId: null }

export type Action =
  | { type: 'add'; images: LoadedImage[] }
  | { type: 'select'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'sim'; sim: SimId }
  | { type: 'params'; patch: Partial<Params> }
  | { type: 'resetParams' }
  | { type: 'clear' }

let counter = 0
const nextId = () => `frame-${++counter}`

/** Applies a change to the active frame only, leaving the others untouched. */
function mapActive(state: EditorState, fn: (frame: Frame) => Frame): EditorState {
  if (!state.activeId) return state
  return {
    ...state,
    frames: state.frames.map((f) => (f.id === state.activeId ? fn(f) : f)),
  }
}

export function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'add': {
      const room = MAX_FRAMES - state.frames.length
      const added = action.images.slice(0, Math.max(0, room)).map((image) => ({
        id: nextId(),
        image,
        sim: DEFAULT_SIM,
        params: DEFAULT_PARAMS,
      }))
      if (added.length === 0) return state
      return {
        frames: [...state.frames, ...added],
        // Jump to the first newly added photo: the user just chose it, so that
        // is what they expect to be looking at.
        activeId: added[0].id,
      }
    }

    case 'select':
      return state.frames.some((f) => f.id === action.id)
        ? { ...state, activeId: action.id }
        : state

    case 'remove': {
      const index = state.frames.findIndex((f) => f.id === action.id)
      if (index === -1) return state
      const frames = state.frames.filter((f) => f.id !== action.id)
      if (state.activeId !== action.id) return { ...state, frames }
      // Selection falls to the neighbour that took its place, or the one before.
      const next = frames[index] ?? frames[index - 1] ?? null
      return { frames, activeId: next ? next.id : null }
    }

    case 'sim':
      return mapActive(state, (f) => ({ ...f, sim: action.sim }))

    case 'params':
      return mapActive(state, (f) => ({ ...f, params: { ...f.params, ...action.patch } }))

    case 'resetParams':
      return mapActive(state, (f) => ({ ...f, params: DEFAULT_PARAMS }))

    case 'clear':
      return INITIAL_STATE
  }
}

export function activeFrame(state: EditorState): Frame | null {
  return state.frames.find((f) => f.id === state.activeId) ?? null
}
