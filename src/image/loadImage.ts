/** Long edge used for the interactive preview. Keeps slider drags at 60fps. */
const PREVIEW_MAX_EDGE = 2560

export interface LoadedImage {
  /** Full resolution, used only for export. */
  full: ImageBitmap
  /** Downscaled for interactive rendering. May be the same object as `full`. */
  preview: ImageBitmap
  /** The preview drawn to a 2D canvas -- the "before" layer of the comparison. */
  previewCanvas: HTMLCanvasElement
  fullWidth: number
  fullHeight: number
  previewWidth: number
  previewHeight: number
  /** Filename without extension, for naming the download. */
  baseName: string
}

export class ImageLoadError extends Error {}

const HEIC_PATTERN = /\.(heic|heif)$/i

function baseNameOf(fileName: string): string {
  const withoutPath = fileName.split(/[/\\]/).pop() ?? fileName
  const dot = withoutPath.lastIndexOf('.')
  const stem = dot > 0 ? withoutPath.slice(0, dot) : withoutPath
  return stem.trim() || 'photo'
}

function fit(width: number, height: number, maxEdge: number): [number, number] {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxEdge) return [width, height]
  const scale = maxEdge / longEdge
  // Never round down to zero on a pathologically thin image.
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))]
}

function toCanvas(bitmap: ImageBitmap, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImageLoadError('Could not get a 2D canvas context')
  ctx.drawImage(bitmap, 0, 0, width, height)
  // Styled here rather than by the component that mounts it: this canvas is
  // handed around as data, and a consumer should not have to mutate it.
  canvas.className = 'block h-full w-full'
  return canvas
}

/**
 * Decodes a user-selected file into full-resolution and preview bitmaps.
 *
 * `imageOrientation: 'from-image'` is the important flag: without it, photos
 * straight off a phone arrive rotated, because the pixels are landscape and only
 * the EXIF tag says otherwise. Applying it here means every downstream stage --
 * shader, export, comparison -- sees already-upright pixels.
 *
 * @param maxTextureSize The GPU's texture limit, so we never hand GL something
 *   it will silently refuse to sample.
 */
export async function loadImage(file: File, maxTextureSize: number): Promise<LoadedImage> {
  if (file.size === 0) {
    throw new ImageLoadError('That file is empty.')
  }

  let full: ImageBitmap
  try {
    full = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Chrome and Firefox cannot decode HEIC; Safari can. Worth saying so
    // plainly, because iPhone photos are HEIC by default.
    if (HEIC_PATTERN.test(file.name) || /heic|heif/i.test(file.type)) {
      throw new ImageLoadError(
        'This browser can’t read HEIC files. Export the photo as JPEG and try again.',
      )
    }
    throw new ImageLoadError('That doesn’t look like an image this browser can read.')
  }

  // Clamp the "full" resolution to what the GPU can actually hold.
  const exportCap = Math.min(maxTextureSize, 8192)
  let fullBitmap = full
  let [fullWidth, fullHeight] = fit(full.width, full.height, exportCap)
  if (fullWidth !== full.width || fullHeight !== full.height) {
    fullBitmap = await createImageBitmap(full, {
      resizeWidth: fullWidth,
      resizeHeight: fullHeight,
      resizeQuality: 'high',
    })
    full.close()
  }

  const [previewWidth, previewHeight] = fit(
    fullWidth,
    fullHeight,
    Math.min(PREVIEW_MAX_EDGE, exportCap),
  )

  const preview =
    previewWidth === fullWidth && previewHeight === fullHeight
      ? fullBitmap
      : await createImageBitmap(fullBitmap, {
          resizeWidth: previewWidth,
          resizeHeight: previewHeight,
          resizeQuality: 'high',
        })

  return {
    full: fullBitmap,
    preview,
    previewCanvas: toCanvas(preview, previewWidth, previewHeight),
    fullWidth,
    fullHeight,
    previewWidth,
    previewHeight,
    baseName: baseNameOf(file.name),
  }
}

export function releaseImage(image: LoadedImage): void {
  if (image.preview !== image.full) image.preview.close()
  image.full.close()
}
