/** Long edge used for the interactive preview. Keeps slider drags at 60fps. */
const PREVIEW_MAX_EDGE = 2560

/** Long edge of the tray thumbnail. */
const THUMB_MAX_EDGE = 180

export interface LoadedImage {
  /**
   * The original file. The full-resolution bitmap is decoded from this on
   * demand at export time rather than kept resident: a single 12MP photo costs
   * roughly 48MB as an ImageBitmap, so holding several open at once is how you
   * run a tab out of memory.
   */
  file: File
  /** Downscaled for interactive rendering. */
  preview: ImageBitmap
  /** The preview drawn to a 2D canvas -- the "before" layer of the comparison. */
  previewCanvas: HTMLCanvasElement
  /** Small JPEG data URL for the photo tray. */
  thumbUrl: string
  /** Dimensions the export will be produced at. */
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

function toCanvas(
  source: ImageBitmap | HTMLCanvasElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImageLoadError('Could not get a 2D canvas context')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  // Styled here rather than by the component that mounts it: this canvas is
  // handed around as data, and a consumer should not have to mutate it.
  canvas.className = 'block h-full w-full'
  return canvas
}

/**
 * Decodes a user-selected file into a preview bitmap plus the measurements the
 * rest of the app needs.
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
        `${file.name}: this browser can’t read HEIC files. Export it as JPEG and try again.`,
      )
    }
    throw new ImageLoadError(`${file.name}: not an image this browser can read.`)
  }

  try {
    // Clamp the export resolution to what the GPU can actually hold.
    const exportCap = Math.min(maxTextureSize, 8192)
    const [fullWidth, fullHeight] = fit(full.width, full.height, exportCap)
    const [previewWidth, previewHeight] = fit(
      fullWidth,
      fullHeight,
      Math.min(PREVIEW_MAX_EDGE, exportCap),
    )

    const preview = await createImageBitmap(full, {
      resizeWidth: previewWidth,
      resizeHeight: previewHeight,
      resizeQuality: 'high',
    })

    const previewCanvas = toCanvas(preview, previewWidth, previewHeight)
    const [thumbWidth, thumbHeight] = fit(previewWidth, previewHeight, THUMB_MAX_EDGE)
    const thumbUrl = toCanvas(previewCanvas, thumbWidth, thumbHeight).toDataURL(
      'image/jpeg',
      0.72,
    )

    return {
      file,
      preview,
      previewCanvas,
      thumbUrl,
      fullWidth,
      fullHeight,
      previewWidth,
      previewHeight,
      baseName: baseNameOf(file.name),
    }
  } finally {
    // The full-resolution bitmap has done its job; export re-decodes the file.
    full.close()
  }
}

/** Re-decodes the original file at export resolution. */
export async function decodeForExport(
  image: LoadedImage,
  maxTextureSize: number,
): Promise<ImageBitmap> {
  const full = await createImageBitmap(image.file, { imageOrientation: 'from-image' })
  const cap = Math.min(maxTextureSize, 8192)
  const [width, height] = fit(full.width, full.height, cap)
  if (width === full.width && height === full.height) return full

  try {
    return await createImageBitmap(full, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: 'high',
    })
  } finally {
    full.close()
  }
}

export function releaseImage(image: LoadedImage): void {
  image.preview.close()
  // Drop the backing store rather than waiting for GC to notice the canvas.
  image.previewCanvas.width = 0
  image.previewCanvas.height = 0
}
