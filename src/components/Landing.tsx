import { useCallback, useEffect, useMemo, useState } from 'react'
import demoUrl from '../assets/demo.jpg'
import { FilmRenderer } from '../gl/renderer'
import type { SimId } from '../sims/simulations'
import { DEFAULT_SIM, SIMULATIONS, getSim } from '../sims/simulations'
import { DEFAULT_PARAMS } from '../state/params'
import { useThumbnails } from '../state/useThumbnails'

/** How long each film holds before the demo advances to the next one. */
const CYCLE_MS = 2600

/** The demo is shown at full strength -- it is an advertisement for the look. */
const DEMO_PARAMS = { ...DEFAULT_PARAMS, intensity: 1, grainAmount: 0.3 }

const STEPS = [
  {
    n: '01',
    title: 'Drop a photo',
    body: 'Straight from your camera roll. Nothing uploads.',
  },
  {
    n: '02',
    title: 'Pick a film',
    body: 'Five looks, previewed on your own photo.',
  },
  {
    n: '03',
    title: 'Dial it in',
    body: 'Intensity, grain, exposure. Compare before and after.',
  },
  {
    n: '04',
    title: 'Save the frame',
    body: 'Full-resolution JPEG, straight back to you.',
  },
]

interface LandingProps {
  onBrowse: () => void
}

/**
 * The empty state, built as a camera viewfinder that is never actually empty:
 * a sample frame cycles through all five simulations, and the film list drives
 * it. The point is that the app demonstrates itself before you commit a photo
 * to it, rather than showing you a box and waiting.
 */
export function Landing({ onBrowse }: LandingProps) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [demo, setDemo] = useState<ImageBitmap | null>(null)
  const [demoRenderer, setDemoRenderer] = useState<FilmRenderer | null>(null)
  const [simId, setSimId] = useState<SimId>(DEFAULT_SIM)
  const [auto, setAuto] = useState(true)
  const sim = getSim(simId)

  const thumbSource = useMemo(
    () => (demo ? { bitmap: demo, width: demo.width, height: demo.height } : null),
    [demo],
  )
  const thumbnails = useThumbnails(thumbSource)

  const choose = useCallback((id: SimId) => {
    setSimId(id)
    // Any deliberate choice ends the carousel: it would be maddening to have the
    // thing you just picked slide away on a timer.
    setAuto(false)
  }, [])

  // --- load the bundled sample frame --------------------------------------
  useEffect(() => {
    let cancelled = false
    let bitmap: ImageBitmap | null = null

    void (async () => {
      try {
        const blob = await (await fetch(demoUrl)).blob()
        bitmap = await createImageBitmap(blob)
        if (cancelled) {
          bitmap.close()
          return
        }
        setDemo(bitmap)
      } catch {
        // The landing is still usable without the demo; the copy and the drop
        // target don't depend on it.
      }
    })()

    return () => {
      cancelled = true
      bitmap?.close()
    }
  }, [])

  // --- renderer for the viewfinder ----------------------------------------
  useEffect(() => {
    if (!canvas || !demo) return

    canvas.width = demo.width
    canvas.height = demo.height

    let renderer: FilmRenderer
    try {
      renderer = new FilmRenderer(canvas)
    } catch {
      return
    }
    renderer.warmUp()
    renderer.setImage(demo, demo.width, demo.height)

    // Draw immediately so the first paint is a photograph, not a black box.
    renderer.render(getSim(simId), DEMO_PARAMS)
    setDemoRenderer(renderer)

    return () => {
      setDemoRenderer(null)
      renderer.dispose()
    }
    // simId is deliberately read once here and not tracked: re-running this
    // would rebuild the GL context on every film change. The draw effect below
    // handles updates.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, demo])

  useEffect(() => {
    demoRenderer?.render(sim, DEMO_PARAMS)
  }, [demoRenderer, sim])

  // --- auto-advance --------------------------------------------------------
  useEffect(() => {
    if (!auto || !demoRenderer) return
    // Someone who has asked for less motion should not get a carousel.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const id = window.setInterval(() => {
      setSimId((prev) => {
        const i = SIMULATIONS.findIndex((s) => s.id === prev)
        return SIMULATIONS[(i + 1) % SIMULATIONS.length].id
      })
    }, CYCLE_MS)
    return () => window.clearInterval(id)
  }, [auto, demoRenderer])

  // --- number keys pick a film, matching the labels on the dial ------------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const index = Number(e.key)
      if (index >= 1 && index <= SIMULATIONS.length) {
        e.preventDefault()
        choose(SIMULATIONS[index - 1].id)
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [choose])

  return (
    <div className="flex flex-1 flex-col justify-center overflow-y-auto">
      <div className="mx-auto w-full max-w-[78rem] px-4 py-4 lg:px-7 lg:py-6">
        <div className="grid gap-7 lg:grid-cols-[1fr_21rem] lg:gap-10">
          {/* ---------------- viewfinder ---------------- */}
          <button
            type="button"
            onClick={onBrowse}
            aria-label="Load a photo"
            className="group relative block aspect-3/2 w-full cursor-pointer overflow-hidden border border-ink-700 bg-ink-900"
          >
            <canvas
              ref={setCanvas}
              className="absolute inset-0 h-full w-full object-cover"
              aria-hidden="true"
            />

            {/* Rule-of-thirds guides and frame corners: the furniture of a
                viewfinder, and what makes an image read as "through the camera". */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-45"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.28) 1px, transparent 1px)',
                backgroundSize: '33.333% 33.333%',
              }}
            />
            {(
              [
                'top-3 left-3 border-t-2 border-l-2',
                'top-3 right-3 border-t-2 border-r-2',
                'bottom-3 left-3 border-b-2 border-l-2',
                'bottom-3 right-3 border-b-2 border-r-2',
              ] as const
            ).map((pos) => (
              <span
                key={pos}
                aria-hidden="true"
                className={`pointer-events-none absolute h-7 w-7 border-lcd ${pos}`}
                // Without the shadow the brackets vanish into a bright frame.
                style={{ filter: 'drop-shadow(0 0 4px rgba(0,0,0,.95))' }}
              />
            ))}

            <span className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-sm bg-black/55 px-2 py-1 font-mono text-[9.5px] tracking-[0.2em] text-white/80 uppercase backdrop-blur-sm">
              Sample frame
            </span>

            {/* Status readout, like the bottom of a camera's finder. */}
            <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-4 bg-gradient-to-t from-black/80 to-transparent px-4 pt-8 pb-2.5 font-mono text-[10px] tracking-[0.1em] text-white/55 uppercase">
              <span>
                Film <b className="font-medium text-lcd">{sim.name}</b>
              </span>
              <span className="hidden sm:inline">
                Grain <b className="font-medium text-lcd">30</b>
              </span>
              <span className="hidden sm:inline">
                Int <b className="font-medium text-lcd">100</b>
              </span>
              <span className="ml-auto hidden text-white/40 sm:inline">
                {auto ? 'Cycling' : 'Held'}
              </span>
            </span>

            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink-950/0 opacity-0 transition-all group-hover:bg-ink-950/55 group-hover:opacity-100 group-focus-visible:bg-ink-950/55 group-focus-visible:opacity-100">
              <span className="rounded-sm border border-lcd/50 bg-black/60 px-4 py-2 font-mono text-[11px] tracking-[0.16em] text-lcd uppercase backdrop-blur-sm">
                Load your photo
              </span>
            </span>
          </button>

          {/* ---------------- copy, CTA and film dial ---------------- */}
          <aside className="flex flex-col">
            <h1 className="text-[1.75rem] leading-[1.14] font-bold tracking-tight text-ink-100 lg:text-[2.05rem]">
              The X100 look,
              <br />
              without the X100.
            </h1>
            <p className="mt-3.5 text-[13.5px] leading-relaxed text-ink-300">
              Five Fujifilm simulations rebuilt as a real colour pipeline — tone curves,
              hue-targeted saturation, split toning and film grain. It all renders on your own
              GPU, and your photo never leaves this device.
            </p>

            <button
              type="button"
              onClick={onBrowse}
              className="mt-5 w-full cursor-pointer rounded-md bg-ink-100 px-4 py-3 text-[13.5px] font-semibold text-ink-950 transition-colors hover:bg-white"
            >
              Load a photo
            </button>
            <p className="mt-2 text-center text-[11.5px] text-ink-400">
              or drag one anywhere · or paste with{' '}
              <kbd className="rounded border border-ink-700 bg-ink-850 px-1 py-px font-sans text-[10px] text-ink-200">
                ⌘V
              </kbd>
            </p>

            <p className="mt-6 border-b border-ink-800 pb-2.5 font-mono text-[9.5px] tracking-[0.18em] text-ink-400 uppercase">
              Film simulation
            </p>
            <div
              role="radiogroup"
              aria-label="Preview a film simulation"
              className="mt-2.5 flex flex-col gap-0.5"
            >
              {SIMULATIONS.map((entry, i) => {
                const active = entry.id === simId
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => choose(entry.id)}
                    className={`flex cursor-pointer items-center gap-3 border px-2.5 py-2 text-left transition-colors ${
                      active
                        ? 'border-accent-dim bg-ink-850'
                        : 'border-transparent hover:bg-ink-900'
                    }`}
                  >
                    <span className="h-12 w-12 shrink-0 overflow-hidden border border-ink-700 bg-ink-800">
                      {thumbnails[entry.id] && (
                        <img
                          src={thumbnails[entry.id]}
                          alt=""
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-ink-100">
                        {entry.name}
                      </span>
                      <span className="block truncate text-[11.5px] text-ink-400">
                        {entry.blurb.split('.')[0]}
                      </span>
                    </span>
                    <span
                      className={`border px-1.5 py-px font-mono text-[10px] ${
                        active ? 'border-accent-dim text-lcd' : 'border-ink-700 text-ink-400'
                      }`}
                    >
                      {i + 1}
                    </span>
                  </button>
                )
              })}
            </div>
          </aside>
        </div>

        {/* ---------------- how it works ---------------- */}
        <div className="mt-8 grid gap-x-6 gap-y-5 border-t border-ink-800 pt-6 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div key={step.n}>
              <b className="block font-mono text-[10px] tracking-[0.14em] text-lcd">{step.n}</b>
              <h2 className="mt-2 text-[13.5px] font-semibold text-ink-100">{step.title}</h2>
              <p className="mt-1 text-[12.2px] leading-relaxed text-ink-400">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
