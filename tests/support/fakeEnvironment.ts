import type { Texture } from '@esotericsoftware/spine-core'
import type { AudioBackend, AudioPlayOptions, ControllerEnvironment, ExportBackend, ImagingBackend, StageAdapter, StageFrameInput } from '../../src/controller/types'
import { decodePng } from './pngDecode'
import { decodeWav } from './wav'
import type { AssetSource, TexturePixels, VirtualFile } from '../../src/core/types'
import { DEFAULT_VIEW, type ViewState } from '../../src/core/render/camera'
import { InspectorController } from '../../src/controller/InspectorController'
import { resetInspectorStore } from '../../src/store/inspectorStore'
import { useLiveStore, EMPTY_SNAPSHOT } from '../../src/store/liveStore'
import { demoSource, FakeTexture } from './fakeTexture'
import { previewGeometry } from '../../src/core/export/placement'

export class FakeStage implements StageAdapter<TexturePixels> {
  view: ViewState = DEFAULT_VIEW
  frames: StageFrameInput[] = []
  textures: FakeTexture[] = []
  disposed = false
  readonly viewport = { width: 800, height: 600 }
  createTexture(image: TexturePixels): Texture {
    const texture = new FakeTexture(image.width, image.height)
    this.textures.push(texture)
    return texture
  }
  render(frame: StageFrameInput): void {
    this.frames.push(frame)
  }
  getView(): ViewState {
    return this.view
  }
  setView(view: ViewState): void {
    this.view = view
  }
  dispose(): void {
    this.disposed = true
  }
}

export class FakeAudio implements AudioBackend {
  plays: Array<{ handle: string; options: AudioPlayOptions }> = []
  stops = 0
  released: string[] = []
  private counter = 0
  supported(): boolean {
    return true
  }
  async decode(bytes: Uint8Array) {
    const wav = decodeWav(bytes)
    this.counter += 1
    return { handle: `clip-${this.counter}`, samples: wav.samples, sampleRate: wav.sampleRate, duration: wav.samples.length / wav.sampleRate, channels: wav.channels }
  }
  play(handle: string, options: AudioPlayOptions): () => void {
    this.plays.push({ handle, options })
    return () => {
      this.stops += 1
    }
  }
  stopAll(): void {
    this.stops += 1
  }
  release(handle: string): void {
    this.released.push(handle)
  }
}

export const fakeImaging: ImagingBackend<TexturePixels> = {
  readPixels: (image) => image,
  decode: async (file) => {
    const png = decodePng(file.bytes)
    return { width: png.width, height: png.height, pixels: new Uint8ClampedArray(png.pixels) }
  },
  size: (image) => ({ width: image.width, height: image.height }),
}

export interface FakeHarness {
  controller: InspectorController<TexturePixels>
  stage: FakeStage
  env: ControllerEnvironment<TexturePixels>
  saved: Array<{ blob: Blob; fileName: string }>
  audio: FakeAudio
  runFrames(count: number, delta?: number): void
}

export const FAKE_CONTENT = { x: -50, y: 0, width: 100, height: 200 }
export const previewDisposals = { count: 0 }

export function createExporter(saved: Array<{ blob: Blob; fileName: string }>): ExportBackend<TexturePixels> {
  return {
    screenshot: async () => ({ blob: new Blob(['png']), fileName: 'shot.png', width: 10, height: 20, frames: 1 }),
    sequence: async (_context, job, onProgress) => {
      onProgress(0.5)
      return { blob: new Blob(['zip']), fileName: `${job.animation}.zip`, width: 10, height: 20, frames: 3 }
    },
    webm: async (_context, job) => ({ blob: new Blob(['webm']), fileName: `${job.animation}.webm`, width: 10, height: 20, frames: 3 }),
    sheet: async (_context, job) => ({ blob: new Blob(['sheet']), fileName: `${job.animation}_sheet.zip`, width: 40, height: 20, frames: 3 }),
    supportsWebm: () => true,
    save: (blob, fileName) => saved.push({ blob, fileName }),
    preview: async (_context, request) => {
      const options = request.options
      const sequence = 'animation' in options
      const frameCount = sequence ? 10 : 1
      const frame = Math.min(frameCount - 1, Math.max(0, request.frame))
      const geometry = previewGeometry(FAKE_CONTENT, { x: -50 + frame * 4, y: 0, width: 60, height: 200 }, options, request.maxWidth, request.maxHeight, request.view ?? null)
      const { width, height } = geometry.small
      return {
        image: { width, height, pixels: new Uint8ClampedArray(width * height * 4).fill(frame) },
        frameWidth: geometry.size.width,
        frameHeight: geometry.size.height,
        previewScale: geometry.previewScale,
        frame,
        firstFrame: sequence ? (options as { startFrame: number }).startFrame : 0,
        frameCount,
        view: geometry.view,
        viewScale: geometry.viewScale,
        frameWorld: geometry.frameWorld,
        contentWorld: FAKE_CONTENT,
        frameRect: geometry.frame,
        content: geometry.content,
        padded: geometry.paddedRect,
        pose: geometry.pose,
        contentOverflow: geometry.contentOverflow,
        poseOverflow: geometry.poseOverflow,
      }
    },
    disposePreview: () => {
      previewDisposals.count += 1
    },
  }
}

export function createHarness(overrides: Partial<ControllerEnvironment<TexturePixels>> = {}): FakeHarness {
  resetInspectorStore()
  useLiveStore.setState({ snapshot: EMPTY_SNAPSHOT, attachments: {}, pointer: null, zoom: 1, renderFps: 0 })
  const saved: Array<{ blob: Blob; fileName: string }> = []
  let clock = 0
  const audio = new FakeAudio()
  const env: ControllerEnvironment<TexturePixels> = {
    now: () => clock,
    requestFrame: () => 1,
    cancelFrame: () => undefined,
    createDemoSource: async () => demoSource(),
    createLocalSource: async (_files: readonly VirtualFile[]): Promise<AssetSource<TexturePixels>> => {
      throw new Error('local source unavailable')
    },
    exporter: createExporter(saved),
    imaging: fakeImaging,
    audio,
    ...overrides,
  }
  const controller = new InspectorController(env)
  const stage = new FakeStage()
  controller.attachStage(stage)
  return {
    controller,
    stage,
    env,
    saved,
    audio,
    runFrames(count: number, delta = 1 / 60) {
      for (let i = 0; i < count; i++) {
        clock += delta * 1000
        controller.tick(delta)
      }
    },
  }
}
