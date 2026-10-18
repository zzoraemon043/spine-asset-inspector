import { GLTexture, ManagedWebGLRenderingContext, SceneRenderer, type Skeleton } from '@esotericsoftware/spine-webgl'
import type { DebugFlags } from '../types'
import { DEFAULT_VIEW, type ViewState, type Viewport } from './camera'
import { drawGizmo, drawMeshVertices, type GizmoRender, type MeshOverlay } from './gizmoOverlay'
import { configureDebugRenderer, drawAxes, drawBoneHighlight, drawHighlight, drawSlotPoints } from './debugOverlay'

export interface StageFrame {
  readonly skeleton: Skeleton | null
  readonly premultipliedAlpha: boolean
  readonly debug: DebugFlags
  readonly highlightSlot: string | null
  readonly highlightBone?: string | null
  readonly showAxes: boolean
  readonly gizmo?: GizmoRender | null
  readonly mesh?: MeshOverlay | null
}

export class WebGLUnavailableError extends Error {
  constructor() {
    super('此瀏覽器無法建立 WebGL 繪圖環境')
    this.name = 'WebGLUnavailableError'
  }
}

export class StageRenderer {
  readonly canvas: HTMLCanvasElement
  readonly context: ManagedWebGLRenderingContext
  readonly scene: SceneRenderer
  private view: ViewState = DEFAULT_VIEW
  private disposed = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const context = new ManagedWebGLRenderingContext(canvas, { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: false })
    if (!context.gl) throw new WebGLUnavailableError()
    this.context = context
    this.scene = new SceneRenderer(canvas, context, true)
  }

  createTexture(image: ImageBitmap | HTMLImageElement): GLTexture {
    return new GLTexture(this.context, image)
  }

  get viewport(): Viewport {
    return { width: this.canvas.width, height: this.canvas.height }
  }

  get pixelRatio(): number {
    return this.canvas.clientWidth > 0 ? this.canvas.width / this.canvas.clientWidth : 1
  }

  getView(): ViewState {
    return this.view
  }

  setView(view: ViewState): void {
    this.view = view
  }

  syncSize(): boolean {
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio))
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio))
    if (this.canvas.width === width && this.canvas.height === height) return false
    this.canvas.width = width
    this.canvas.height = height
    return true
  }

  render(frame: StageFrame): void {
    if (this.disposed) return
    this.syncSize()
    const gl = this.context.gl
    const { width, height } = this.viewport
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const camera = this.scene.camera
    camera.setViewport(width, height)
    camera.zoom = 1 / this.view.scale
    camera.position.x = this.view.centerX
    camera.position.y = this.view.centerY
    camera.update()
    const pixelSize = 1 / this.view.scale
    this.scene.begin()
    if (frame.showAxes) drawAxes(this.scene, pixelSize, Math.max(width, height) * pixelSize * 2 + Math.abs(this.view.centerX) + Math.abs(this.view.centerY))
    if (frame.skeleton) {
      this.scene.drawSkeleton(frame.skeleton, frame.premultipliedAlpha)
      if (configureDebugRenderer(this.scene, frame.debug, pixelSize)) this.scene.drawSkeletonDebug(frame.skeleton, frame.premultipliedAlpha)
      if (frame.debug.slots) drawSlotPoints(this.scene, frame.skeleton, pixelSize)
      if (frame.highlightSlot) drawHighlight(this.scene, frame.skeleton, frame.highlightSlot, pixelSize)
      if (frame.highlightBone && !frame.gizmo) drawBoneHighlight(this.scene, frame.skeleton, frame.highlightBone, pixelSize)
      if (frame.gizmo) drawGizmo(this.scene, frame.gizmo)
      if (frame.mesh) drawMeshVertices(this.scene, frame.mesh, pixelSize * this.pixelRatio)
    }
    this.scene.end()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.scene.dispose()
  }
}
