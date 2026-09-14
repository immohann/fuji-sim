import fragSource from './film.frag.glsl?raw'
import vertSource from './quad.vert.glsl?raw'
import { bakeCurve, packCurveTexture, LUT_SIZE } from './curves'
import type { Params } from '../state/params'
import type { FilmSim, SimId } from '../sims/simulations'
import { SIMULATIONS } from '../sims/simulations'

/**
 * Grain slider 0..1 maps to this much deviation in 0..1 colour. Full-tilt film
 * grain is a surprisingly small number; past ~0.2 it stops reading as emulsion
 * and starts reading as sensor noise.
 */
const GRAIN_SCALE = 0.14

/** Contrast slider is +/-1; this keeps the extremes usable rather than cartoonish. */
const CONTRAST_SCALE = 0.7

export class ShaderError extends Error {}

export interface RendererOptions {
  /**
   * Keep the drawing buffer after a frame so toBlob/toDataURL can read it.
   * Needed for export and thumbnails; wasted bandwidth for the live preview,
   * which is redrawn on every change anyway.
   */
  readback?: boolean
  /**
   * Force the GL context to be released on dispose.
   *
   * Only ever set this for a canvas that is itself about to be thrown away.
   * getContext() returns the *same* context object for a given canvas forever,
   * so losing the context on a canvas that gets reused hands the next renderer
   * a dead context -- which fails to compile shaders and reports a null info
   * log, giving no hint as to why.
   */
  releaseContext?: boolean
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new ShaderError('Could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new ShaderError(`Shader compile failed: ${log}`)
  }
  return shader
}

function link(gl: WebGL2RenderingContext): WebGLProgram {
  const vert = compile(gl, gl.VERTEX_SHADER, vertSource)
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragSource)
  const program = gl.createProgram()
  if (!program) throw new ShaderError('Could not create program')
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)
  // Shaders are reference-counted by the program; detach and drop our handles.
  gl.detachShader(program, vert)
  gl.detachShader(program, frag)
  gl.deleteShader(vert)
  gl.deleteShader(frag)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new ShaderError(`Program link failed: ${log}`)
  }
  return program
}

/**
 * Renders one image through one film simulation into one canvas.
 *
 * Deliberately owns a single canvas: the preview keeps a long-lived instance at
 * screen resolution, and export spins up a throwaway instance at full
 * resolution. Same shader, same uniforms, so what you download is what you saw.
 */
export class FilmRenderer {
  readonly gl: WebGL2RenderingContext
  readonly maxTextureSize: number

  private program: WebGLProgram
  private uniforms = new Map<string, WebGLUniformLocation | null>()
  private imageTexture: WebGLTexture | null = null
  private curveTextures = new Map<SimId, WebGLTexture>()
  private imageWidth = 0
  private imageHeight = 0
  private disposed = false
  readonly canvas: HTMLCanvasElement

  private readonly releaseContext: boolean

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    this.canvas = canvas
    this.releaseContext = options.releaseContext ?? false
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: options.readback ?? false,
      premultipliedAlpha: false,
    })
    if (!gl) throw new ShaderError('WebGL2 is not available in this browser')

    this.gl = gl
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    this.program = link(gl)
    gl.useProgram(this.program)
  }

  private loc(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) {
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name))
    }
    return this.uniforms.get(name) ?? null
  }

  /** Uploads the image to be graded. Safe to call repeatedly. */
  setImage(source: ImageBitmap | HTMLCanvasElement, width: number, height: number): void {
    const { gl } = this
    if (!this.imageTexture) this.imageTexture = gl.createTexture()

    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture)
    // No mipmaps and no wrapping: we sample 1:1 inside the image only.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)

    this.imageWidth = width
    this.imageHeight = height
  }

  /** Bakes and caches the 256x1 curve LUT for a simulation. */
  private curveTexture(sim: FilmSim): WebGLTexture {
    const cached = this.curveTextures.get(sim.id)
    if (cached) return cached

    const { gl } = this
    const texture = gl.createTexture()
    if (!texture) throw new ShaderError('Could not create curve texture')

    const data = packCurveTexture(
      bakeCurve(sim.curves.r),
      bakeCurve(sim.curves.g),
      bakeCurve(sim.curves.b),
    )

    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    // LINEAR so the 256 baked entries interpolate into a smooth curve instead
    // of 256 visible steps in a gradient.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, LUT_SIZE, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data,
    )

    this.curveTextures.set(sim.id, texture)
    return texture
  }

  /** Pre-bakes every curve LUT so the first sim switch isn't the slow one. */
  warmUp(): void {
    for (const sim of SIMULATIONS) this.curveTexture(sim)
  }

  /**
   * Draws at the canvas's current size. Caller sets canvas.width/height first;
   * for the preview that's the on-screen size, for export it's the full image.
   */
  render(sim: FilmSim, params: Params): void {
    if (this.disposed) return
    const { gl } = this
    if (!this.imageTexture) return

    gl.useProgram(this.program)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture)
    gl.uniform1i(this.loc('uImage'), 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.curveTexture(sim))
    gl.uniform1i(this.loc('uCurve'), 1)

    // Grain is sized against the frame, so it needs the source resolution to
    // work out the aspect and scale -- NOT the canvas size.
    gl.uniform2f(this.loc('uImageSize'), this.imageWidth, this.imageHeight)

    // GLSL mat3 is column-major; our matrices are written row-major for
    // readability, so transpose on the way in.
    const m = sim.matrix
    gl.uniformMatrix3fv(this.loc('uMatrix'), false, new Float32Array([
      m[0], m[3], m[6],
      m[1], m[4], m[7],
      m[2], m[5], m[8],
    ]))

    gl.uniform1fv(this.loc('uHueGains[0]'), new Float32Array(sim.hueGains))
    gl.uniform1f(this.loc('uGlobalSat'), sim.globalSat)
    gl.uniform3fv(this.loc('uShadowTint'), new Float32Array(sim.shadowTint))
    gl.uniform1f(this.loc('uShadowStrength'), sim.shadowStrength)
    gl.uniform3fv(this.loc('uHighlightTint'), new Float32Array(sim.highlightTint))
    gl.uniform1f(this.loc('uHighlightStrength'), sim.highlightStrength)
    gl.uniform1i(this.loc('uMono'), sim.monochrome ? 1 : 0)
    gl.uniform3fv(this.loc('uPanchromatic'), new Float32Array(sim.panchromatic))

    gl.uniform1f(this.loc('uIntensity'), params.intensity)
    gl.uniform1f(this.loc('uExposure'), params.exposure)
    gl.uniform1f(this.loc('uContrast'), params.contrast * CONTRAST_SCALE)
    gl.uniform1f(this.loc('uGrainAmount'), params.grainAmount * GRAIN_SCALE * sim.grainBias)
    gl.uniform1f(this.loc('uGrainSize'), params.grainSize)
    gl.uniform1f(this.loc('uVignette'), params.vignette)
    // Fixed seed: grain must not crawl when an unrelated slider moves.
    gl.uniform1f(this.loc('uGrainSeed'), 0)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const { gl } = this
    if (this.imageTexture) gl.deleteTexture(this.imageTexture)
    for (const t of this.curveTextures.values()) gl.deleteTexture(t)
    this.curveTextures.clear()
    gl.deleteProgram(this.program)
    if (this.releaseContext) {
      // Frees the drawing buffer immediately instead of waiting for GC, which
      // matters because browsers cap the number of live WebGL contexts.
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }
}

export interface WebGLSupport {
  supported: boolean
  maxTextureSize: number
}

/**
 * Checks WebGL2 availability and the texture limit before any image is loaded,
 * using a throwaway context. The loader needs the limit up front so it can
 * downscale rather than hand GL something it will refuse to sample.
 */
export function probeWebGL(): WebGLSupport {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (!gl) return { supported: false, maxTextureSize: 4096 }
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return { supported: true, maxTextureSize }
  } catch {
    return { supported: false, maxTextureSize: 4096 }
  }
}
