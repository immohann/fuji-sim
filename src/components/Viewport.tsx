import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FilmRenderer } from '../gl/renderer'
import type { LoadedImage } from '../image/loadImage'
import type { FilmSim } from '../sims/simulations'
import type { Params } from '../state/params'

interface ViewportProps {
  image: LoadedImage
  sim: FilmSim
  params: Params
  comparing: boolean
  /** True while the user holds the before key -- shows the original full-frame. */
  showOriginal: boolean
  onError: (message: string) => void
}

interface Box {
  width: number
  height: number
}

export function Viewport({
  image,
  sim,
  params,
  comparing,
  showOriginal,
  onError,
}: ViewportProps) {
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const beforeHostRef = useRef<HTMLDivElement | null>(null)
  const areaRef = useRef<HTMLDivElement | null>(null)
  const frameHostRef = useRef<HTMLDivElement | null>(null)
  // Renderer lives in state, not a ref: the upload and draw effects below must
  // re-run when it is recreated, or a new context would sit there with no image.
  const [renderer, setRenderer] = useState<FilmRenderer | null>(null)
  const [frame, setFrame] = useState<Box | null>(null)
  const rafRef = useRef(0)
  const [dividerPos, setDividerPos] = useState(0.5)
  const [dragging, setDragging] = useState(false)

  // Held in a ref so the setup effect below can have empty deps: a fresh
  // callback identity from the parent must not tear down the GL context.
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  })

  // --- renderer lifecycle -------------------------------------------------
  useEffect(() => {
    const canvas = glCanvasRef.current
    if (!canvas) return

    let instance: FilmRenderer
    try {
      instance = new FilmRenderer(canvas)
    } catch (err) {
      onErrorRef.current(err instanceof Error ? err.message : 'Could not start WebGL.')
      return
    }
    instance.warmUp()
    // The GL context is an external resource that can only exist once the canvas
    // is mounted, which is exactly the case this rule exempts.
    // oxlint-disable-next-line react/set-state-in-effect
    setRenderer(instance)

    const onLost = (e: Event) => {
      e.preventDefault()
      onErrorRef.current('The graphics context was lost. Reload the page to continue.')
    }
    canvas.addEventListener('webglcontextlost', onLost)

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      cancelAnimationFrame(rafRef.current)
      setRenderer(null)
      instance.dispose()
    }
  }, [])

  // --- fit the photo to the available area --------------------------------
  // Measured rather than left to CSS aspect-ratio: the frame drives the drawing
  // buffer size, the before-layer size and the divider maths, so all three stay
  // consistent only if one number decides it.
  useLayoutEffect(() => {
    const area = areaRef.current
    if (!area) return

    const measure = () => {
      const { width, height } = area.getBoundingClientRect()
      if (width < 1 || height < 1) return
      const scale = Math.min(width / image.previewWidth, height / image.previewHeight)
      setFrame({
        width: Math.max(1, Math.round(image.previewWidth * scale)),
        height: Math.max(1, Math.round(image.previewHeight * scale)),
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(area)
    return () => observer.disconnect()
  }, [image])

  // --- image upload -------------------------------------------------------
  useEffect(() => {
    const canvas = glCanvasRef.current
    if (!renderer || !canvas) return

    // Draw at the preview bitmap's own resolution and let CSS scale it down.
    // Drawing at on-screen size instead would point-sample the grain, turning
    // fine emulsion into aliased speckle.
    canvas.width = image.previewWidth
    canvas.height = image.previewHeight
    renderer.setImage(image.preview, image.previewWidth, image.previewHeight)
  }, [renderer, image])

  // The "before" layer is the decoded preview itself, so the two layers are
  // pixel-aligned by construction rather than by getting CSS exactly right.
  useEffect(() => {
    const host = beforeHostRef.current
    if (!host) return
    host.replaceChildren(image.previewCanvas)
    return () => host.replaceChildren()
  }, [image])

  // --- draw on any change -------------------------------------------------
  useEffect(() => {
    if (!renderer) return
    // Coalesce to one draw per frame: a slider drag fires far more often.
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => renderer.render(sim, params))
  }, [renderer, sim, params, image])

  // --- divider drag -------------------------------------------------------
  const updateFromPointer = useCallback((clientX: number) => {
    const host = frameHostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    if (rect.width === 0) return
    setDividerPos(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)))
  }, [])

  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => {
      e.preventDefault()
      updateFromPointer(e.clientX)
    }
    const up = () => setDragging(false)
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [dragging, updateFromPointer])

  // showOriginal wins over the divider: holding the key is a momentary override.
  const clipLeft = showOriginal ? 100 : comparing ? dividerPos * 100 : 0

  return (
    // min-h on small screens stops the stacked layout from squeezing the photo
    // down to a thumbnail once the contact sheet and controls take their share.
    <div
      ref={areaRef}
      className="relative flex min-h-[42vh] flex-1 items-center justify-center lg:min-h-0"
    >
      <div
        ref={frameHostRef}
        className="relative touch-none overflow-hidden bg-ink-900 shadow-2xl shadow-black/60"
        style={frame ? { width: frame.width, height: frame.height } : { visibility: 'hidden' }}
      >
        <div ref={beforeHostRef} className="absolute inset-0 z-0" aria-hidden="true" />
        <canvas
          ref={glCanvasRef}
          className="absolute inset-0 z-10 block h-full w-full"
          style={{ clipPath: `inset(0 0 0 ${clipLeft}%)` }}
          aria-label={`Photo with the ${sim.name} film simulation applied`}
        />

        {comparing && !showOriginal && (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 z-20 w-px bg-white/85 shadow-[0_0_10px_rgba(0,0,0,0.7)]"
              style={{ left: `${dividerPos * 100}%` }}
            />
            <div
              role="slider"
              tabIndex={0}
              aria-label="Before and after comparison position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(dividerPos * 100)}
              onPointerDown={(e) => {
                e.preventDefault()
                setDragging(true)
                updateFromPointer(e.clientX)
              }}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.1 : 0.02
                if (e.key === 'ArrowLeft') {
                  setDividerPos((p) => Math.max(0, p - step))
                } else if (e.key === 'ArrowRight') {
                  setDividerPos((p) => Math.min(1, p + step))
                } else if (e.key === 'Home') {
                  setDividerPos(0)
                } else if (e.key === 'End') {
                  setDividerPos(1)
                } else {
                  return
                }
                e.preventDefault()
              }}
              className="absolute inset-y-0 z-30 flex w-10 -translate-x-1/2 cursor-ew-resize items-center justify-center"
              style={{ left: `${dividerPos * 100}%` }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/55 backdrop-blur-sm">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" aria-hidden="true">
                  <path
                    d="M10 7 6 12l4 5M14 7l4 5-4 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </div>
            <Corner label="Before" side="left" />
            <Corner label="After" side="right" />
          </>
        )}

        {showOriginal && <Corner label="Original" side="left" />}
      </div>
    </div>
  )
}

function Corner({ label, side }: { label: string; side: 'left' | 'right' }) {
  return (
    <span
      className={`pointer-events-none absolute bottom-3 z-20 rounded bg-black/55 px-2 py-1 text-[10px] font-medium tracking-widest text-white/90 uppercase backdrop-blur-sm ${
        side === 'left' ? 'left-3' : 'right-3'
      }`}
    >
      {label}
    </span>
  )
}
