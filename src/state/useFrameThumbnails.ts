import { useEffect, useRef, useState } from 'react'
import { FilmRenderer } from '../gl/renderer'
import { getSim } from '../sims/simulations'
import type { Frame } from './frames'

const THUMB_EDGE = 150

/**
 * Renders each loaded photo under its own film, for the tray tiles.
 *
 * Keyed on frame id and film only, deliberately: re-rendering every tile on
 * every slider drag would burn a GL context per frame for a 68px tile nobody is
 * looking at that closely.
 */
export function useFrameThumbnails(frames: Frame[]): Record<string, string> {
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})

  // Read through a ref so the effect can key on the cheap signature below
  // without going stale on the frames themselves. Assigned in an effect that is
  // declared first, so it lands before the render effect below reads it.
  const framesRef = useRef(frames)
  useEffect(() => {
    framesRef.current = frames
  }, [frames])

  const signature = frames.map((f) => `${f.id}:${f.sim}`).join(',')

  useEffect(() => {
    const current = framesRef.current
    if (current.length === 0) {
      setThumbnails({})
      return
    }

    let cancelled = false
    const canvas = document.createElement('canvas')
    const sources: ImageBitmap[] = []
    let renderer: FilmRenderer | null = null

    const run = async () => {
      const next: Record<string, string> = {}

      for (const frame of current) {
        if (cancelled) return
        const { preview, previewWidth, previewHeight } = frame.image
        const scale = Math.min(1, THUMB_EDGE / Math.max(previewWidth, previewHeight))
        const width = Math.max(1, Math.round(previewWidth * scale))
        const height = Math.max(1, Math.round(previewHeight * scale))

        // Downsample on the CPU first: sampling a 2560px texture into a 150px
        // viewport without mipmaps aliases badly.
        const source = await createImageBitmap(preview, {
          resizeWidth: width,
          resizeHeight: height,
          resizeQuality: 'high',
        })
        if (cancelled) {
          source.close()
          return
        }
        sources.push(source)

        canvas.width = width
        canvas.height = height
        // One context for the whole pass; render() re-reads the canvas size.
        renderer ??= new FilmRenderer(canvas, { readback: true, releaseContext: true })
        renderer.setImage(source, width, height)
        renderer.render(getSim(frame.sim), frame.params)
        next[frame.id] = canvas.toDataURL('image/jpeg', 0.74)
      }

      if (!cancelled) setThumbnails(next)
    }

    run().catch(() => {
      // Tiles fall back to the ungraded thumbnail baked at load time.
    })

    return () => {
      cancelled = true
      renderer?.dispose()
      for (const source of sources) source.close()
      canvas.width = 0
      canvas.height = 0
    }
  }, [signature])

  return thumbnails
}
