import { useEffect, useState } from 'react'
import { FilmRenderer } from '../gl/renderer'
import type { SimId } from '../sims/simulations'
import { SIMULATIONS } from '../sims/simulations'
import { DEFAULT_PARAMS } from './params'

const THUMB_EDGE = 200

export type Thumbnails = Partial<Record<SimId, string>>

/** Any decoded image, whether the user's photo or the bundled demo frame. */
export interface ThumbnailSource {
  bitmap: ImageBitmap
  width: number
  height: number
}

/**
 * Renders the user's own photo through all five simulations for the picker.
 *
 * Shown at full intensity with no grain: these chips exist to identify a look,
 * so they should show the look itself rather than the current slider settings.
 */
export function useThumbnails(image: ThumbnailSource | null): Thumbnails {
  const [thumbnails, setThumbnails] = useState<Thumbnails>({})

  useEffect(() => {
    if (!image) {
      // Clearing GPU-derived state when its source goes away; there is no
      // render-time value to derive it from.
      // oxlint-disable-next-line react/set-state-in-effect
      setThumbnails({})
      return
    }

    let cancelled = false
    let renderer: FilmRenderer | null = null
    let source: ImageBitmap | null = null
    const canvas = document.createElement('canvas')

    const run = async () => {
      const scale = THUMB_EDGE / Math.max(image.width, image.height)
      const width = Math.max(1, Math.round(image.width * Math.min(1, scale)))
      const height = Math.max(1, Math.round(image.height * Math.min(1, scale)))

      // Downsample on the CPU first. Sampling a 2560px texture into a 200px
      // viewport without mipmaps would alias the thumbnails badly.
      source = await createImageBitmap(image.bitmap, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: 'high',
      })
      if (cancelled) return

      canvas.width = width
      canvas.height = height
      renderer = new FilmRenderer(canvas, { readback: true, releaseContext: true })
      renderer.setImage(source, width, height)

      const params = { ...DEFAULT_PARAMS, intensity: 1, grainAmount: 0, vignette: 0 }
      const next: Thumbnails = {}
      for (const sim of SIMULATIONS) {
        renderer.render(sim, params)
        next[sim.id] = canvas.toDataURL('image/jpeg', 0.8)
      }
      if (!cancelled) setThumbnails(next)
    }

    run().catch(() => {
      // Thumbnails are a nicety; the picker falls back to plain labels.
      if (!cancelled) setThumbnails({})
    })

    return () => {
      cancelled = true
      renderer?.dispose()
      source?.close()
      canvas.width = 0
      canvas.height = 0
    }
  }, [image])

  return thumbnails
}
