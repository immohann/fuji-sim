import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Controls } from './components/Controls'
import { Dropzone } from './components/Dropzone'
import { FilmStrip } from './components/FilmStrip'
import { Landing } from './components/Landing'
import { PhotoTray } from './components/PhotoTray'
import { Viewport } from './components/Viewport'
import { probeWebGL } from './gl/renderer'
import { exportImage } from './image/exportImage'
import type { LoadedImage } from './image/loadImage'
import { ImageLoadError, loadImage, releaseImage } from './image/loadImage'
import { getSim, SIMULATIONS } from './sims/simulations'
import { activeFrame, INITIAL_STATE, MAX_FRAMES, reducer } from './state/frames'
import { useFrameThumbnails } from './state/useFrameThumbnails'
import { useThumbnails } from './state/useThumbnails'

export default function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)

  // Probed once: the loader needs the texture limit before the first decode.
  const support = useMemo(() => probeWebGL(), [])

  const frame = activeFrame(state)
  const sim = frame ? getSim(frame.sim) : null
  const image = frame?.image ?? null

  const thumbSource = useMemo(
    () =>
      image
        ? { bitmap: image.preview, width: image.previewWidth, height: image.previewHeight }
        : null,
    [image],
  )
  const filmThumbnails = useThumbnails(thumbSource)
  const frameThumbnails = useFrameThumbnails(state.frames)

  // Release bitmaps on unmount. Reads through a ref so the effect stays mounted
  // for the life of the app rather than tearing down on every edit.
  const framesRef = useRef(state.frames)
  useEffect(() => {
    framesRef.current = state.frames
  }, [state.frames])
  useEffect(
    () => () => {
      for (const f of framesRef.current) releaseImage(f.image)
    },
    [],
  )

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      setError(null)
      setLoading(true)

      const room = MAX_FRAMES - framesRef.current.length
      const accepted = files.slice(0, Math.max(0, room))
      const images: LoadedImage[] = []
      const failures: string[] = []

      for (const file of accepted) {
        try {
          images.push(await loadImage(file, support.maxTextureSize))
        } catch (err) {
          failures.push(
            err instanceof ImageLoadError ? err.message : `${file.name}: could not be read.`,
          )
        }
      }

      if (images.length > 0) dispatch({ type: 'add', images })

      // One combined message: a separate alert per bad file in a multi-select
      // would bury the ones that did work.
      const notes = [...failures]
      if (files.length > accepted.length) {
        notes.push(`Only the first ${MAX_FRAMES} photos were loaded.`)
      }
      setError(notes.length > 0 ? notes.join(' ') : null)
      setLoading(false)
    },
    [support.maxTextureSize],
  )

  const handleRemove = useCallback(
    (id: string) => {
      const doomed = state.frames.find((f) => f.id === id)
      dispatch({ type: 'remove', id })
      if (doomed) releaseImage(doomed.image)
    },
    [state.frames],
  )

  const handleClear = useCallback(() => {
    for (const f of state.frames) releaseImage(f.image)
    dispatch({ type: 'clear' })
    setConfirmingClear(false)
    setComparing(false)
    setError(null)
  }, [state.frames])

  const handleDownload = useCallback(async () => {
    if (!frame || !sim) return
    setExporting(true)
    setError(null)
    try {
      await exportImage(frame.image, sim, frame.params, support.maxTextureSize)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the image.')
    } finally {
      setExporting(false)
    }
  }, [frame, sim, support.maxTextureSize])

  // Keyboard shortcuts. Held keys use keydown/keyup so B is momentary, matching
  // how a photographer flicks between versions.
  useEffect(() => {
    if (!frame) return

    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      const index = Number(e.key)
      if (index >= 1 && index <= SIMULATIONS.length) {
        dispatch({ type: 'sim', sim: SIMULATIONS[index - 1].id })
      } else if (e.key === 'b' || e.key === 'B') {
        if (!e.repeat) setShowOriginal(true)
      } else if (e.key === 'c' || e.key === 'C') {
        setComparing((v) => !v)
      } else if (e.key === '[' || e.key === ']') {
        // Step between loaded photos without reaching for the tray.
        const i = state.frames.findIndex((f) => f.id === state.activeId)
        if (i !== -1 && state.frames.length > 1) {
          const step = e.key === ']' ? 1 : -1
          const next = (i + step + state.frames.length) % state.frames.length
          dispatch({ type: 'select', id: state.frames[next].id })
        }
      } else if (e.key === 'Escape') {
        setConfirmingClear(false)
      } else {
        return
      }
      e.preventDefault()
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'b' || e.key === 'B') setShowOriginal(false)
    }
    // Releasing the key outside the window would otherwise leave it stuck.
    const blur = () => setShowOriginal(false)

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [frame, state.frames, state.activeId])

  if (!support.supported) {
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <p className="max-w-md text-sm leading-relaxed text-ink-300">
            Fuji Sim needs WebGL2, which this browser doesn’t provide. Try a recent version of
            Chrome, Safari, Firefox or Edge.
          </p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell
      onBack={frame ? () => setConfirmingClear(true) : undefined}
      confirming={confirmingClear}
      onConfirmBack={handleClear}
      onCancelBack={() => setConfirmingClear(false)}
      photoCount={state.frames.length}
    >
      {error && (
        <div
          role="alert"
          className="mx-4 mt-3 flex items-start gap-3 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-[13px] text-red-200"
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="cursor-pointer text-red-300/70 transition-colors hover:text-red-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <Dropzone
        onFiles={handleFiles}
        overlayLabel={frame ? 'Drop to add photos' : 'Drop to load photos'}
      >
        {(openPicker) =>
          !frame || !sim ? (
            <Landing onBrowse={openPicker} />
          ) : (
            <main className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
              <div className="flex flex-1 flex-col gap-3 p-3 lg:min-h-0 lg:p-5">
                <PhotoTray
                  frames={state.frames}
                  activeId={state.activeId}
                  thumbnails={frameThumbnails}
                  onSelect={(id) => dispatch({ type: 'select', id })}
                  onRemove={handleRemove}
                  onAdd={openPicker}
                />

                <Viewport
                  image={frame.image}
                  sim={sim}
                  params={frame.params}
                  comparing={comparing}
                  showOriginal={showOriginal}
                  onError={setError}
                />

                {/* The contact sheet sits under the photo rather than in the rail:
                    five thumbnails need the width to be big enough to judge. */}
                <FilmStrip
                  selected={frame.sim}
                  thumbnails={filmThumbnails}
                  onSelect={(id) => dispatch({ type: 'sim', sim: id })}
                />

                <div className="flex shrink-0 items-center justify-center gap-3 text-[11px] text-ink-400">
                  <button
                    type="button"
                    onClick={() => setComparing((v) => !v)}
                    aria-pressed={comparing}
                    className={`flex min-h-11 cursor-pointer items-center rounded px-3 font-medium tracking-wide uppercase transition-colors lg:min-h-9 ${
                      comparing ? 'bg-ink-800 text-ink-100' : 'hover:text-ink-200'
                    }`}
                  >
                    Compare
                  </button>
                  <span className="hidden sm:inline">
                    Hold <Key>B</Key> for the original · <Key>1</Key>–<Key>5</Key> for film
                    {state.frames.length > 1 && (
                      <>
                        {' '}
                        · <Key>[</Key>
                        <Key>]</Key> for photos
                      </>
                    )}
                  </span>
                </div>
              </div>

              <aside className="flex shrink-0 flex-col gap-5 border-t border-ink-800 bg-ink-900/50 p-4 lg:w-[18rem] lg:border-t-0 lg:border-l lg:p-5">
                <Controls
                  sim={sim}
                  params={frame.params}
                  onChange={(patch) => dispatch({ type: 'params', patch })}
                  onReset={() => dispatch({ type: 'resetParams' })}
                />

                <div className="mt-auto flex flex-col gap-2 border-t border-ink-800 pt-4">
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={exporting || loading}
                    className="min-h-11 w-full cursor-pointer rounded-md bg-ink-100 px-4 py-2.5 text-[13px] font-semibold text-ink-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-400"
                  >
                    {exporting ? 'Rendering…' : 'Download JPEG'}
                  </button>
                  <p className="text-center font-mono text-[10.5px] text-ink-400 tabular-nums">
                    {frame.image.fullWidth} × {frame.image.fullHeight}
                    {state.frames.length > 1 && ` · ${state.frames.length} loaded`}
                  </p>
                </div>
              </aside>
            </main>
          )
        }
      </Dropzone>

      {loading && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-ink-950/60">
          <span className="text-sm text-ink-200">Reading photos…</span>
        </div>
      )}
    </Shell>
  )
}

interface ShellProps {
  children: React.ReactNode
  onBack?: () => void
  confirming?: boolean
  onConfirmBack?: () => void
  onCancelBack?: () => void
  photoCount?: number
}

function Shell({
  children,
  onBack,
  confirming,
  onConfirmBack,
  onCancelBack,
  photoCount = 0,
}: ShellProps) {
  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      {/* Styled as a camera's status LCD, which is the language the rest of the
          app speaks -- and it doubles as the privacy notice. */}
      <header className="flex shrink-0 items-center gap-4 border-b border-ink-800 px-4 py-2.5 font-mono text-[10px] tracking-[0.16em] uppercase lg:gap-6 lg:px-6">
        {/* A wordmark, not the page heading -- the landing's hero headline is the
            h1, so this stays a plain element to avoid two h1s on one page. */}
        <div className="shrink-0 font-semibold tracking-[0.22em] text-ink-100">
          Fuji&nbsp;Sim
        </div>

        {onBack ? (
          // Discarding loaded photos can't be undone -- the files never left the
          // user's disk, but re-picking them is real work -- so it asks first.
          confirming ? (
            <span className="flex items-center gap-2">
              <span className="hidden text-ink-300 normal-case sm:inline">
                Discard {photoCount} {photoCount === 1 ? 'photo' : 'photos'}?
              </span>
              <button
                type="button"
                onClick={onConfirmBack}
                className="min-h-8 cursor-pointer rounded-sm border border-red-900 px-2 tracking-[0.14em] text-red-300 transition-colors hover:bg-red-950/50 hover:text-red-100"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={onCancelBack}
                className="min-h-8 cursor-pointer px-1 tracking-[0.14em] text-ink-400 transition-colors hover:text-ink-100"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={onBack}
              className="flex min-h-8 cursor-pointer items-center gap-1.5 tracking-[0.14em] text-ink-300 transition-colors hover:text-ink-100"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true">
                <path
                  d="M15 5l-7 7 7 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Start over
            </button>
          )
        ) : (
          <>
            <span className="hidden text-ink-400 sm:inline">5 simulations</span>
            <span className="hidden text-ink-400 md:inline">Real-time GPU</span>
          </>
        )}

        <p className="ml-auto flex shrink-0 items-center gap-2 text-ink-300">
          <span className="h-1.5 w-1.5 rounded-full bg-lcd" aria-hidden="true" />
          <span className="hidden sm:inline">Local — no upload</span>
          <span className="sm:hidden">Local</span>
        </p>
      </header>

      {children}

      <footer className="shrink-0 border-t border-ink-800 px-4 py-2.5 text-[10.5px] leading-relaxed text-ink-400 lg:px-5">
        An independent homage, not affiliated with or endorsed by Fujifilm. Film simulation
        names are trademarks of FUJIFILM Corporation.
      </footer>
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-ink-700 bg-ink-850 px-1 py-px font-sans text-[10px] text-ink-200">
      {children}
    </kbd>
  )
}
