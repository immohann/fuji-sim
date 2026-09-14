import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Controls } from './components/Controls'
import { Dropzone } from './components/Dropzone'
import { FilmStrip } from './components/FilmStrip'
import { Landing } from './components/Landing'
import { Viewport } from './components/Viewport'
import { probeWebGL } from './gl/renderer'
import { exportImage } from './image/exportImage'
import type { LoadedImage } from './image/loadImage'
import { ImageLoadError, loadImage, releaseImage } from './image/loadImage'
import type { SimId } from './sims/simulations'
import { getSim, SIMULATIONS } from './sims/simulations'
import type { EditorState, Params } from './state/params'
import { DEFAULT_PARAMS, INITIAL_STATE } from './state/params'
import { useThumbnails } from './state/useThumbnails'

type Action =
  { type: 'sim'; id: SimId } | { type: 'params'; patch: Partial<Params> } | { type: 'reset' }

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'sim':
      return { ...state, sim: action.id }
    case 'params':
      return { ...state, params: { ...state.params, ...action.patch } }
    case 'reset':
      return { ...state, params: DEFAULT_PARAMS }
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [comparing, setComparing] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)

  // Probed once: the loader needs the texture limit before the first decode.
  const support = useMemo(() => probeWebGL(), [])
  const thumbSource = useMemo(
    () =>
      image
        ? {
            bitmap: image.preview,
            width: image.previewWidth,
            height: image.previewHeight,
          }
        : null,
    [image],
  )
  const thumbnails = useThumbnails(thumbSource)
  const sim = getSim(state.sim)

  // Free the previous bitmaps when a new photo replaces them, and on unmount.
  const imageRef = useRef<LoadedImage | null>(null)
  useEffect(() => {
    imageRef.current = image
  }, [image])
  useEffect(
    () => () => {
      if (imageRef.current) releaseImage(imageRef.current)
    },
    [],
  )

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      setLoading(true)
      try {
        const next = await loadImage(file, support.maxTextureSize)
        setImage((previous) => {
          if (previous) releaseImage(previous)
          return next
        })
      } catch (err) {
        setError(
          err instanceof ImageLoadError
            ? err.message
            : 'Something went wrong reading that file.',
        )
      } finally {
        setLoading(false)
      }
    },
    [support.maxTextureSize],
  )

  const handleDownload = useCallback(async () => {
    if (!image) return
    setExporting(true)
    setError(null)
    try {
      await exportImage(image, sim, state.params)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the image.')
    } finally {
      setExporting(false)
    }
  }, [image, sim, state.params])

  // Keyboard shortcuts. Held keys use keydown/keyup so B is momentary, matching
  // how a photographer flicks between versions.
  useEffect(() => {
    if (!image) return

    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      const index = Number(e.key)
      if (index >= 1 && index <= SIMULATIONS.length) {
        dispatch({ type: 'sim', id: SIMULATIONS[index - 1].id })
      } else if (e.key === 'b' || e.key === 'B') {
        if (!e.repeat) setShowOriginal(true)
      } else if (e.key === 'c' || e.key === 'C') {
        setComparing((v) => !v)
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
  }, [image])

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
    <Shell>
      {error && (
        <div
          role="alert"
          className="mx-4 mt-3 flex items-start gap-3 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-[13px] text-red-200"
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-300/70 transition-colors hover:text-red-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <Dropzone
        onFile={handleFile}
        overlayLabel={image ? 'Drop to replace the frame' : 'Drop to load the frame'}
      >
        {(openPicker) =>
          !image ? (
            <Landing onBrowse={openPicker} />
          ) : (
            <main className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
              <div className="flex flex-1 flex-col gap-3 p-3 lg:min-h-0 lg:p-5">
                <Viewport
                  image={image}
                  sim={sim}
                  params={state.params}
                  comparing={comparing}
                  showOriginal={showOriginal}
                  onError={setError}
                />

                {/* The contact sheet sits under the photo rather than in the rail:
                  five thumbnails need the width to be big enough to judge. */}
                <FilmStrip
                  selected={state.sim}
                  thumbnails={thumbnails}
                  onSelect={(id) => dispatch({ type: 'sim', id })}
                />

                <div className="flex shrink-0 items-center justify-center gap-3 text-[11px] text-ink-400">
                  <button
                    type="button"
                    onClick={() => setComparing((v) => !v)}
                    aria-pressed={comparing}
                    className={`rounded px-2 py-1 font-medium tracking-wide uppercase transition-colors ${
                      comparing ? 'bg-ink-800 text-ink-100' : 'hover:text-ink-200'
                    }`}
                  >
                    Compare
                  </button>
                  <span className="hidden sm:inline">
                    Hold <Key>B</Key> for the original · <Key>1</Key>–<Key>5</Key> to switch
                    film
                  </span>
                </div>
              </div>

              <aside className="flex shrink-0 flex-col gap-5 border-t border-ink-800 bg-ink-900/50 p-4 lg:w-[18rem] lg:border-t-0 lg:border-l lg:p-5">
                <Controls
                  sim={sim}
                  params={state.params}
                  onChange={(patch) => dispatch({ type: 'params', patch })}
                  onReset={() => dispatch({ type: 'reset' })}
                />

                <div className="mt-auto flex flex-col gap-2 border-t border-ink-800 pt-4">
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={exporting || loading}
                    className="w-full rounded-md bg-ink-100 px-4 py-2.5 text-[13px] font-semibold text-ink-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-400"
                  >
                    {exporting ? 'Rendering…' : 'Download JPEG'}
                  </button>
                  <p className="text-center font-mono text-[10.5px] text-ink-400 tabular-nums">
                    {image.fullWidth} × {image.fullHeight}
                  </p>
                </div>
              </aside>
            </main>
          )
        }
      </Dropzone>

      {loading && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-ink-950/60">
          <span className="text-sm text-ink-200">Reading photo…</span>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      {/* Styled as a camera's status LCD, which is the language the rest of the
          app speaks -- and it doubles as the privacy notice. */}
      <header className="flex shrink-0 items-center gap-5 border-b border-ink-800 px-4 py-2.5 font-mono text-[10px] tracking-[0.16em] uppercase lg:gap-7 lg:px-6">
        <h1 className="font-semibold tracking-[0.22em] text-ink-100">Fuji&nbsp;Sim</h1>
        <span className="hidden text-ink-400 sm:inline">5 simulations</span>
        <span className="hidden text-ink-400 md:inline">Real-time GPU</span>
        <p className="ml-auto flex items-center gap-2 text-ink-300">
          <span className="h-1.5 w-1.5 rounded-full bg-lcd" aria-hidden="true" />
          Local — no upload
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
