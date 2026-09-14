import { FilmRenderer } from '../gl/renderer'
import type { FilmSim } from '../sims/simulations'
import type { Params } from '../state/params'
import type { LoadedImage } from './loadImage'
import { decodeForExport } from './loadImage'

const JPEG_QUALITY = 0.95

/**
 * Renders the image at full resolution and hands the browser a file to save.
 *
 * Uses a throwaway renderer on an offscreen canvas rather than resizing the
 * visible one: same shader and same uniforms, so the download matches the
 * preview, but the viewport never flickers to full resolution mid-export.
 */
export async function exportImage(
  image: LoadedImage,
  sim: FilmSim,
  params: Params,
  maxTextureSize: number,
): Promise<void> {
  // Decoded here rather than held open since load: see LoadedImage.file.
  const source = await decodeForExport(image, maxTextureSize)

  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height

  let renderer: FilmRenderer | null = null
  try {
    renderer = new FilmRenderer(canvas, { readback: true, releaseContext: true })
    renderer.setImage(source, source.width, source.height)
    renderer.render(sim, params)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    })
    if (!blob) throw new Error('The browser could not encode the image.')

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${image.baseName}-${sim.id}.jpg`
    link.click()
    // Revoke on the next turn: revoking synchronously can cancel the download
    // in some browsers before it has actually started reading the blob.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } finally {
    renderer?.dispose()
    source.close()
    // Zero the canvas so the backing store is released promptly.
    canvas.width = 0
    canvas.height = 0
  }
}
