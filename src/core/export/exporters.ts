import { zipSync } from 'fflate'
import type { Skeleton } from '@esotericsoftware/spine-core'
import type { AssetSource, Bounds, SlotOverride, TexturePixels } from '../types'
import { SpineInstance } from '../spine/SpineInstance'
import { transferPose } from '../spine/poseTransfer'
import { replaceRegion } from '../atlas/regionOverride'
import { encodePng } from '../image/pngEncode'
import {
  buildManifest,
  composeSheet,
  frameFileName,
  measureSequence,
  parseBackground,
  sanitizeFileStem,
  selectFrames,
  sequenceTimes,
  sheetLayout,
  sheetManifest,
  type FrameSize,
  type OutputOptions,
} from './exportPlan'
import { OffscreenSpineRenderer, type ExportImage } from './OffscreenSpineRenderer'
import { frameFor, previewGeometry, type FramePlacement, type Rect } from './placement'
import { startWebmSession } from './webm'

export interface ExportContext {
  readonly source: AssetSource<ExportImage>
  readonly skins: readonly string[]
  readonly overrides: ReadonlyMap<string, SlotOverride>
  readonly regionOverrides: ReadonlyMap<string, ExportImage>
}

export interface ExportResult {
  readonly blob: Blob
  readonly fileName: string
  readonly width: number
  readonly height: number
  readonly frames: number
}

export type ProgressHandler = (ratio: number) => void

export class ExportCancelledError extends Error {
  constructor() {
    super('匯出已取消')
    this.name = 'ExportCancelledError'
  }
}

export interface CancelToken {
  cancelled: boolean
}

export interface SequenceOptions extends OutputOptions {
  readonly animation: string
  readonly fps: number
  readonly startFrame: number
  readonly endFrame: number | null
  readonly loops: number
  readonly columns: number
}

interface Prepared {
  readonly renderer: OffscreenSpineRenderer
  readonly instance: SpineInstance
  readonly premultipliedAlpha: boolean
}

function prepare(context: ExportContext): Prepared {
  const renderer = new OffscreenSpineRenderer()
  try {
    const build = renderer.build(context.source)
    for (const [id, image] of context.regionOverrides) replaceRegion(build.data, build.atlas, id, renderer.createTexture(image), image.width, image.height)
    const instance = new SpineInstance(build.data)
    instance.setSkins(context.skins)
    for (const [slot, override] of context.overrides) instance.setSlotOverride(slot, override)
    return { renderer, instance, premultipliedAlpha: build.premultipliedAlpha }
  } catch (error) {
    renderer.dispose()
    throw error
  }
}

const nextTick = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0))
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

function pngBlob(pixels: TexturePixels): Blob {
  return new Blob([encodePng(pixels) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
}

function sizeLabel(size: FrameSize): string {
  return `${size.width}x${size.height}`
}

export async function exportScreenshot(context: ExportContext, pose: Skeleton, options: OutputOptions): Promise<ExportResult> {
  const { renderer, instance, premultipliedAlpha } = prepare(context)
  try {
    transferPose(pose, instance.skeleton)
    const { bounds, size, placement } = frameFor(instance.bounds(), options)
    renderer.resize(size)
    renderer.draw(instance.skeleton, premultipliedAlpha, bounds, size, parseBackground(options.background), placement)
    const stem = sanitizeFileStem(context.source.name)
    return { blob: pngBlob(renderer.readPixels()), fileName: `${stem}_frame_${sizeLabel(size)}.png`, width: size.width, height: size.height, frames: 1 }
  } finally {
    renderer.dispose()
  }
}

interface PlannedSequence {
  readonly prepared: Prepared
  readonly duration: number
  readonly times: number[]
  readonly first: number
  readonly bounds: Bounds
  readonly size: FrameSize
  readonly placement: FramePlacement
  readonly background: [number, number, number, number] | null
  readonly stem: string
}

function planSequence(context: ExportContext, options: SequenceOptions): PlannedSequence {
  const prepared = prepare(context)
  try {
    const { instance } = prepared
    if (!instance.hasAnimation(options.animation)) throw new Error(`找不到動作：${options.animation}`)
    const duration = instance.data.findAnimation(options.animation)?.duration ?? 0
    const selection = selectFrames(sequenceTimes(duration, options.fps), options.startFrame, options.endFrame)
    if (selection.times.length === 0) throw new Error('影格範圍內沒有可匯出的影格')
    const { bounds, size, placement } = frameFor(measureSequence(instance, options.animation, selection.times, 0), options)
    prepared.renderer.resize(size)
    return {
      prepared,
      duration,
      times: selection.times,
      first: selection.first,
      bounds,
      size,
      placement,
      background: parseBackground(options.background),
      stem: sanitizeFileStem(`${context.source.name}_${options.animation}`),
    }
  } catch (error) {
    prepared.renderer.dispose()
    throw error
  }
}

async function renderFrames(plan: PlannedSequence, onFrame: (pixels: TexturePixels, index: number) => void, onProgress: ProgressHandler, token: CancelToken): Promise<void> {
  const { renderer, instance, premultipliedAlpha } = plan.prepared
  for (let index = 0; index < plan.times.length; index++) {
    if (token.cancelled) throw new ExportCancelledError()
    instance.seek(plan.times[index])
    renderer.draw(instance.skeleton, premultipliedAlpha, plan.bounds, plan.size, plan.background, plan.placement)
    onFrame(renderer.readPixels(), index)
    onProgress((index + 1) / (plan.times.length + 1))
    if (index % 4 === 3) await nextTick()
  }
}

export async function exportPngSequence(context: ExportContext, options: SequenceOptions, onProgress: ProgressHandler, token: CancelToken): Promise<ExportResult> {
  const plan = planSequence(context, options)
  try {
    const files: Record<string, Uint8Array> = {}
    const frames: { file: string; time: number }[] = []
    const total = plan.first + plan.times.length
    await renderFrames(
      plan,
      (pixels, index) => {
        const file = frameFileName(plan.stem, plan.first + index, total)
        files[file] = encodePng(pixels)
        frames.push({ file, time: Math.round(plan.times[index] * 1e6) / 1e6 })
      },
      onProgress,
      token,
    )
    const manifest = buildManifest({ skeleton: context.source.name, animation: options.animation, skins: context.skins, fps: options.fps, duration: plan.duration, bounds: plan.bounds, size: plan.size, frames })
    files['manifest.json'] = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`)
    const zip = zipSync(files, { level: 0 })
    onProgress(1)
    return {
      blob: new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
      fileName: `${plan.stem}_${plan.times.length}f_${options.fps}fps_${sizeLabel(plan.size)}.zip`,
      width: plan.size.width,
      height: plan.size.height,
      frames: plan.times.length,
    }
  } finally {
    plan.prepared.renderer.dispose()
  }
}

export async function exportSpriteSheet(context: ExportContext, options: SequenceOptions, onProgress: ProgressHandler, token: CancelToken): Promise<ExportResult> {
  const plan = planSequence(context, options)
  try {
    const layout = sheetLayout(plan.times.length, plan.size.width, plan.size.height, options.columns)
    const frames: TexturePixels[] = []
    await renderFrames(plan, (pixels) => frames.push(pixels), onProgress, token)
    const sheet = composeSheet(frames, layout)
    const image = `${plan.stem}_sheet.png`
    const names = plan.times.map((_, index) => frameFileName(plan.stem, plan.first + index, plan.first + plan.times.length))
    const manifest = sheetManifest({ image, animation: options.animation, fps: options.fps, layout, names, times: plan.times })
    const zip = zipSync(
      {
        [image]: encodePng(sheet),
        [`${plan.stem}_sheet.json`]: new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
      },
      { level: 0 },
    )
    onProgress(1)
    return {
      blob: new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
      fileName: `${plan.stem}_sheet_${layout.columns}x${layout.rows}_${options.fps}fps.zip`,
      width: layout.width,
      height: layout.height,
      frames: plan.times.length,
    }
  } finally {
    plan.prepared.renderer.dispose()
  }
}

export async function exportWebm(context: ExportContext, options: SequenceOptions, onProgress: ProgressHandler, token: CancelToken): Promise<ExportResult> {
  const plan = planSequence(context, options)
  try {
    const { renderer, instance, premultipliedAlpha } = plan.prepared
    const times = Array.from({ length: Math.max(1, options.loops) }, () => plan.times).flat()
    const even = { ...plan.size, width: plan.size.width + (plan.size.width % 2), height: plan.size.height + (plan.size.height % 2) }
    renderer.resize(even)
    const session = await startWebmSession(renderer.canvas, Math.min(16_000_000, even.width * even.height * options.fps * 0.25))
    const interval = 1000 / options.fps
    const started = performance.now()
    for (let index = 0; index < times.length; index++) {
      if (token.cancelled) {
        await session.finish()
        throw new ExportCancelledError()
      }
      instance.seek(times[index])
      renderer.draw(instance.skeleton, premultipliedAlpha, plan.bounds, even, plan.background, plan.placement)
      session.pushFrame()
      onProgress((index + 1) / (times.length + 1))
      await wait(Math.max(0, started + (index + 1) * interval - performance.now()))
    }
    const blob = await session.finish()
    onProgress(1)
    return { blob, fileName: `${plan.stem}_${options.fps}fps_${sizeLabel(even)}.webm`, width: even.width, height: even.height, frames: times.length }
  } finally {
    plan.prepared.renderer.dispose()
  }
}

export interface PreviewRequest {
  readonly key: string
  readonly options: SequenceOptions | OutputOptions
  readonly frame: number
  readonly maxWidth: number
  readonly maxHeight: number
  readonly view?: Bounds | null
}

export interface PreviewResult {
  readonly image: TexturePixels
  readonly frameWidth: number
  readonly frameHeight: number
  readonly previewScale: number
  readonly frame: number
  readonly firstFrame: number
  readonly frameCount: number
  readonly view: Bounds
  readonly viewScale: number
  readonly frameWorld: Bounds
  readonly contentWorld: Bounds
  readonly frameRect: Rect
  readonly content: Rect
  readonly padded: Rect
  readonly pose: Rect
  readonly contentOverflow: number
  readonly poseOverflow: number
}

interface PreviewCache {
  readonly key: string
  readonly prepared: Prepared
  readonly content: Bounds
  readonly times: number[]
  readonly first: number
  readonly animation: string | null
}

function isSequence(options: SequenceOptions | OutputOptions): options is SequenceOptions {
  return typeof (options as SequenceOptions).animation === 'string'
}

export class ExportPreviewer {
  private cache: PreviewCache | null = null

  private plan(context: ExportContext, request: PreviewRequest, pose: Skeleton | null): PreviewCache {
    const options = request.options
    const key = `${request.key}|${JSON.stringify(isSequence(options) ? [options.animation, options.fps, options.startFrame, options.endFrame] : 'pose')}`
    if (this.cache && this.cache.key === key && (isSequence(options) || !pose)) return this.cache
    this.dispose()
    const prepared = prepare(context)
    const { instance } = prepared
    if (isSequence(options)) {
      if (!instance.hasAnimation(options.animation)) {
        prepared.renderer.dispose()
        throw new Error(`找不到動作：${options.animation}`)
      }
      const duration = instance.data.findAnimation(options.animation)?.duration ?? 0
      const selection = selectFrames(sequenceTimes(duration, options.fps), options.startFrame, options.endFrame)
      if (selection.times.length === 0) {
        prepared.renderer.dispose()
        throw new Error('影格範圍內沒有可匯出的影格')
      }
      const content = measureSequence(instance, options.animation, selection.times, 0)
      this.cache = { key, prepared, content, times: selection.times, first: selection.first, animation: options.animation }
    } else {
      if (pose) transferPose(pose, instance.skeleton)
      this.cache = { key, prepared, content: instance.bounds(), times: [0], first: 0, animation: null }
    }
    return this.cache
  }

  render(context: ExportContext, request: PreviewRequest, pose: Skeleton | null = null): PreviewResult {
    const plan = this.plan(context, request, pose)
    const { renderer, instance, premultipliedAlpha } = plan.prepared
    const options = request.options
    const index = Math.min(plan.times.length - 1, Math.max(0, Math.round(request.frame)))
    if (plan.animation) instance.seek(plan.times[index])
    else if (pose) transferPose(pose, instance.skeleton)
    const geometry = previewGeometry(plan.content, instance.bounds(), options, request.maxWidth, request.maxHeight, request.view ?? null)
    renderer.resize(geometry.small)
    renderer.draw(instance.skeleton, premultipliedAlpha, geometry.view, geometry.small, parseBackground(options.background), geometry.viewPlacement)
    return {
      image: renderer.readPixels(),
      frameWidth: geometry.size.width,
      frameHeight: geometry.size.height,
      previewScale: geometry.previewScale,
      frame: index,
      firstFrame: plan.first,
      frameCount: plan.times.length,
      view: geometry.view,
      viewScale: geometry.viewScale,
      frameWorld: geometry.frameWorld,
      contentWorld: plan.content,
      frameRect: geometry.frame,
      content: geometry.content,
      padded: geometry.paddedRect,
      pose: geometry.pose,
      contentOverflow: geometry.contentOverflow,
      poseOverflow: geometry.poseOverflow,
    }
  }

  dispose(): void {
    this.cache?.prepared.renderer.dispose()
    this.cache = null
  }
}
