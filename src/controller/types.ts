import type { GizmoRender, MeshOverlay } from '@/core/render/gizmoOverlay'
import type { Skeleton, Texture } from '@esotericsoftware/spine-core'
import type { AssetSource, DebugFlags, SlotOverride, TexturePixels, VirtualFile } from '@/core/types'
import type { ViewState, Viewport } from '@/core/render/camera'

export interface StageFrameInput {
  readonly skeleton: Skeleton | null
  readonly premultipliedAlpha: boolean
  readonly debug: DebugFlags
  readonly highlightSlot: string | null
  readonly highlightBone: string | null
  readonly showAxes: boolean
  readonly gizmo?: GizmoRender | null
  readonly mesh?: MeshOverlay | null
}

export interface StageAdapter<TImage> {
  createTexture(image: TImage): Texture
  render(frame: StageFrameInput): void
  getView(): ViewState
  setView(view: ViewState): void
  readonly viewport: Viewport
  readonly pixelRatio?: number
  dispose(): void
}

export interface ExportJobContext<TImage> {
  readonly source: AssetSource<TImage>
  readonly skins: readonly string[]
  readonly overrides: ReadonlyMap<string, SlotOverride>
  readonly regionOverrides: ReadonlyMap<string, TImage>
}

export interface ExportJobResult {
  readonly blob: Blob
  readonly fileName: string
  readonly width: number
  readonly height: number
  readonly frames: number
}

export interface OutputJob {
  readonly sizeMode: 'scale' | 'fixed' | 'crop'
  readonly scale: number
  readonly width: number
  readonly height: number
  readonly padding: number
  readonly background: string | null
  readonly align?: 'center' | 'bottom'
  readonly offsetX?: number
  readonly offsetY?: number
  readonly crop?: PreviewRect | null
}

export interface SequenceJob extends OutputJob {
  readonly animation: string
  readonly fps: number
  readonly startFrame: number
  readonly endFrame: number | null
  readonly loops: number
  readonly columns: number
}

export interface CancelSignal {
  cancelled: boolean
}

export interface ExportBackend<TImage> {
  screenshot(context: ExportJobContext<TImage>, pose: Skeleton, output: OutputJob): Promise<ExportJobResult>
  sequence(context: ExportJobContext<TImage>, job: SequenceJob, onProgress: (ratio: number) => void, signal: CancelSignal): Promise<ExportJobResult>
  sheet(context: ExportJobContext<TImage>, job: SequenceJob, onProgress: (ratio: number) => void, signal: CancelSignal): Promise<ExportJobResult>
  webm(context: ExportJobContext<TImage>, job: SequenceJob, onProgress: (ratio: number) => void, signal: CancelSignal): Promise<ExportJobResult>
  supportsWebm(): boolean
  save(blob: Blob, fileName: string): void
  preview?(context: ExportJobContext<TImage>, request: PreviewJobRequest, pose: Skeleton | null): Promise<PreviewJobResult>
  disposePreview?(): void
}

export interface PreviewJobRequest {
  readonly key: string
  readonly options: SequenceJob | OutputJob
  readonly frame: number
  readonly maxWidth: number
  readonly maxHeight: number
  readonly view?: PreviewRect | null
}

export interface PreviewRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface PreviewJobResult {
  readonly image: TexturePixels
  readonly frameWidth: number
  readonly frameHeight: number
  readonly previewScale: number
  readonly frame: number
  readonly firstFrame: number
  readonly frameCount: number
  readonly view: PreviewRect
  readonly viewScale: number
  readonly frameWorld: PreviewRect
  readonly contentWorld: PreviewRect
  readonly frameRect: PreviewRect
  readonly content: PreviewRect
  readonly padded: PreviewRect
  readonly pose: PreviewRect
  readonly contentOverflow: number
  readonly poseOverflow: number
}

export interface DecodedAudio {
  readonly handle: string
  readonly samples: Float32Array
  readonly sampleRate: number
  readonly duration: number
  readonly channels: number
}

export interface AudioPlayOptions {
  readonly offset: number
  readonly delay: number
  readonly rate: number
  readonly volume: number
}

export interface AudioBackend {
  supported(): boolean
  decode(bytes: Uint8Array): Promise<DecodedAudio>
  play(handle: string, options: AudioPlayOptions): () => void
  stopAll(): void
  release(handle: string): void
}

export interface ImagingBackend<TImage> {
  readPixels(image: TImage): TexturePixels
  decode(file: VirtualFile): Promise<TImage>
  size(image: TImage): { readonly width: number; readonly height: number }
  release?(image: TImage): void
}

export interface ControllerEnvironment<TImage> {
  now(): number
  requestFrame(callback: (time: number) => void): number
  cancelFrame(handle: number): void
  createDemoSource(): Promise<AssetSource<TImage>>
  createLocalSource(files: readonly VirtualFile[], preferredSkeleton?: string): Promise<AssetSource<TImage>>
  exporter: ExportBackend<TImage> | null
  releaseSource?(source: AssetSource<TImage>): void
  imaging: ImagingBackend<TImage>
  audio: AudioBackend | null
}
