import { GLTexture, ManagedWebGLRenderingContext, SceneRenderer, type Skeleton } from '@esotericsoftware/spine-webgl'
import type { AssetSource, Bounds, TexturePixels } from '../types'
import { buildSkeleton, type SkeletonBuild } from '../spine/skeletonFactory'
import { unpremultiplyFlip, type FrameSize } from './exportPlan'
import type { FramePlacement } from './placement'

export type ExportImage = ImageBitmap | HTMLImageElement

export class OffscreenSpineRenderer {
  readonly canvas: HTMLCanvasElement
  private readonly context: ManagedWebGLRenderingContext
  private readonly scene: SceneRenderer
  private readonly textures: GLTexture[] = []

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = 2
    this.canvas.height = 2
    this.context = new ManagedWebGLRenderingContext(this.canvas, {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    })
    if (!this.context.gl) throw new Error('無法建立匯出用 WebGL 繪圖環境')
    this.scene = new SceneRenderer(this.canvas, this.context, true)
  }

  createTexture(image: ExportImage): GLTexture {
    const texture = new GLTexture(this.context, image)
    this.textures.push(texture)
    return texture
  }

  build(source: AssetSource<ExportImage>): SkeletonBuild {
    return buildSkeleton(source, (image) => this.createTexture(image))
  }

  resize(size: FrameSize): void {
    this.canvas.width = size.width
    this.canvas.height = size.height
  }

  draw(skeleton: Skeleton, premultipliedAlpha: boolean, bounds: Bounds, size: FrameSize, background: readonly number[] | null = null, placement: FramePlacement | null = null): void {
    const gl = this.context.gl
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    if (background) gl.clearColor(background[0], background[1], background[2], 1)
    else gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const camera = this.scene.camera
    camera.setViewport(this.canvas.width, this.canvas.height)
    camera.zoom = 1 / size.scale
    camera.position.x = placement ? placement.centerX : bounds.x + bounds.width / 2
    camera.position.y = placement ? placement.centerY : bounds.y + bounds.height / 2
    camera.update()
    this.scene.begin()
    this.scene.drawSkeleton(skeleton, premultipliedAlpha)
    this.scene.end()
  }

  readPixels(): TexturePixels {
    const gl = this.context.gl
    const { width, height } = this.canvas
    const raw = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw)
    return unpremultiplyFlip(raw, width, height)
  }

  toPng(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG 編碼失敗'))), 'image/png')
    })
  }

  dispose(): void {
    for (const texture of this.textures) texture.dispose()
    this.textures.length = 0
    this.scene.dispose()
    this.context.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
