import type { TexturePixels } from '../types'

let shared: { canvas: HTMLCanvasElement; gl: WebGLRenderingContext } | null = null

function context(): WebGLRenderingContext {
  if (shared && !shared.gl.isContextLost()) return shared.gl
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: false })
  if (!gl) throw new Error('無法建立像素讀取用 WebGL 環境')
  shared = { canvas, gl }
  return gl
}

export function readImagePixels(image: TexImageSource & { width: number; height: number }): TexturePixels {
  const gl = context()
  const { width, height } = image
  const texture = gl.createTexture()
  const framebuffer = gl.createFramebuffer()
  try {
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('像素讀取失敗：Framebuffer 不完整')
    const pixels = new Uint8ClampedArray(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    return { width, height, pixels }
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteFramebuffer(framebuffer)
    gl.deleteTexture(texture)
  }
}
