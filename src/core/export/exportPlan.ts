import type { Bounds } from '../types'
import type { SpineInstance } from '../spine/SpineInstance'
import { padBounds, unionBounds } from '../render/camera'
import { sampleTimes } from '../playback/timeMath'
import type { ExportAlign } from './placement'

export const EXPORT_LIMITS = {
  maxDimension: 4096,
  maxFrames: 600,
  minScale: 0.1,
  maxScale: 8,
} as const

export interface FrameSize {
  readonly width: number
  readonly height: number
  readonly scale: number
}

export function frameSize(bounds: Bounds, scale: number): FrameSize {
  const requested = Math.min(EXPORT_LIMITS.maxScale, Math.max(EXPORT_LIMITS.minScale, scale))
  const longest = Math.max(bounds.width, bounds.height) * requested
  const effective = longest > EXPORT_LIMITS.maxDimension ? (requested * EXPORT_LIMITS.maxDimension) / longest : requested
  return {
    width: Math.max(1, Math.ceil(bounds.width * effective)),
    height: Math.max(1, Math.ceil(bounds.height * effective)),
    scale: effective,
  }
}

export type SizeMode = 'scale' | 'fixed' | 'crop'

export interface OutputOptions {
  readonly sizeMode: SizeMode
  readonly scale: number
  readonly width: number
  readonly height: number
  readonly padding: number
  readonly background: string | null
  readonly align?: ExportAlign
  readonly offsetX?: number
  readonly offsetY?: number
  readonly crop?: Bounds | null
}

export function clampDimension(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(EXPORT_LIMITS.maxDimension, Math.max(1, Math.round(value)))
}

export function fixedFrameSize(bounds: Bounds, width: number, height: number): FrameSize {
  const w = clampDimension(width)
  const h = clampDimension(height)
  const scale = Math.min(w / Math.max(1, bounds.width), h / Math.max(1, bounds.height))
  return { width: w, height: h, scale: Number.isFinite(scale) && scale > 0 ? scale : 1 }
}

export function resolveFrameSize(bounds: Bounds, options: OutputOptions): FrameSize {
  if (options.sizeMode === 'crop' && options.crop) return frameSize(options.crop, options.scale)
  return options.sizeMode === 'fixed' ? fixedFrameSize(bounds, options.width, options.height) : frameSize(bounds, options.scale)
}

export function parseBackground(value: string | null): [number, number, number, number] | null {
  if (!value) return null
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim())
  if (!match) return null
  const hex = Number.parseInt(match[1], 16)
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255, 1]
}

export interface FrameSelection {
  readonly times: number[]
  readonly first: number
  readonly last: number
}

export function selectFrames(times: readonly number[], start: number, end: number | null): FrameSelection {
  if (times.length === 0) return { times: [], first: 0, last: -1 }
  const lastIndex = times.length - 1
  const first = Math.min(lastIndex, Math.max(0, Math.round(Number.isFinite(start) ? start : 0)))
  const last = Math.min(lastIndex, Math.max(first, Math.round(end === null || !Number.isFinite(end) ? lastIndex : end)))
  return { times: times.slice(first, last + 1), first, last }
}

export function sequenceTimes(duration: number, fps: number): number[] {
  return sampleTimes(duration, fps).slice(0, EXPORT_LIMITS.maxFrames)
}

export function measureSequence(instance: SpineInstance, animation: string, times: readonly number[], padding: number): Bounds {
  instance.setTrack(0, animation, { loop: false, resetPose: true })
  let bounds: Bounds | null = null
  for (const time of times) {
    instance.seek(time)
    bounds = unionBounds(bounds, instance.bounds())
  }
  return padBounds(bounds ?? instance.bounds(), padding)
}

export function frameFileName(prefix: string, index: number, total: number): string {
  const digits = Math.max(4, String(Math.max(0, total - 1)).length)
  return `${prefix}_${String(index).padStart(digits, '0')}.png`
}

export function sanitizeFileStem(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned.length > 0 ? cleaned.slice(0, 80) : 'export'
}

export interface SequenceManifest {
  readonly generator: string
  readonly skeleton: string
  readonly animation: string
  readonly skins: readonly string[]
  readonly fps: number
  readonly frameCount: number
  readonly duration: number
  readonly width: number
  readonly height: number
  readonly scale: number
  readonly origin: { readonly x: number; readonly y: number }
  readonly frames: readonly { readonly file: string; readonly time: number }[]
}

export function buildManifest(input: {
  skeleton: string
  animation: string
  skins: readonly string[]
  fps: number
  duration: number
  bounds: Bounds
  size: FrameSize
  frames: readonly { file: string; time: number }[]
}): SequenceManifest {
  return {
    generator: 'spine-asset-inspector',
    skeleton: input.skeleton,
    animation: input.animation,
    skins: input.skins,
    fps: input.fps,
    frameCount: input.frames.length,
    duration: input.duration,
    width: input.size.width,
    height: input.size.height,
    scale: input.size.scale,
    origin: {
      x: Math.round(-input.bounds.x * input.size.scale * 100) / 100,
      y: Math.round((input.bounds.y + input.bounds.height) * input.size.scale * 100) / 100,
    },
    frames: input.frames,
  }
}

export interface SheetLayout {
  readonly columns: number
  readonly rows: number
  readonly width: number
  readonly height: number
  readonly frameWidth: number
  readonly frameHeight: number
}

export function sheetLayout(count: number, frameWidth: number, frameHeight: number, columns?: number, maxDimension = EXPORT_LIMITS.maxDimension): SheetLayout {
  if (count <= 0) throw new Error('沒有可排版的影格')
  const maxColumns = Math.max(1, Math.floor(maxDimension / frameWidth))
  const preferred = columns && columns > 0 ? Math.round(columns) : Math.ceil(Math.sqrt(count))
  const cols = Math.max(1, Math.min(count, preferred, maxColumns))
  const rows = Math.ceil(count / cols)
  const width = cols * frameWidth
  const height = rows * frameHeight
  if (width > maxDimension || height > maxDimension) {
    throw new Error(`Sprite Sheet 尺寸 ${width}x${height} 超過上限 ${maxDimension}，請降低輸出尺寸或影格數`)
  }
  return { columns: cols, rows, width, height, frameWidth, frameHeight }
}

export function framePosition(layout: SheetLayout, index: number): { x: number; y: number } {
  return { x: (index % layout.columns) * layout.frameWidth, y: Math.floor(index / layout.columns) * layout.frameHeight }
}

export function composeSheet(frames: readonly { width: number; height: number; pixels: Uint8ClampedArray }[], layout: SheetLayout): { width: number; height: number; pixels: Uint8ClampedArray } {
  const pixels = new Uint8ClampedArray(layout.width * layout.height * 4)
  frames.forEach((frame, index) => {
    const origin = framePosition(layout, index)
    const rowBytes = Math.min(frame.width, layout.frameWidth) * 4
    for (let y = 0; y < Math.min(frame.height, layout.frameHeight); y++) {
      const from = y * frame.width * 4
      const to = ((origin.y + y) * layout.width + origin.x) * 4
      pixels.set(frame.pixels.subarray(from, from + rowBytes), to)
    }
  })
  return { width: layout.width, height: layout.height, pixels }
}

export function sheetManifest(input: { image: string; animation: string; fps: number; layout: SheetLayout; names: readonly string[]; times: readonly number[] }): Record<string, unknown> {
  const frames: Record<string, unknown> = {}
  input.names.forEach((name, index) => {
    const position = framePosition(input.layout, index)
    frames[name] = {
      frame: { x: position.x, y: position.y, w: input.layout.frameWidth, h: input.layout.frameHeight },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: input.layout.frameWidth, h: input.layout.frameHeight },
      sourceSize: { w: input.layout.frameWidth, h: input.layout.frameHeight },
      duration: Math.round(1000 / Math.max(1, input.fps)),
      time: Math.round((input.times[index] ?? 0) * 1e6) / 1e6,
    }
  })
  return {
    frames,
    animations: { [input.animation]: [...input.names] },
    meta: {
      app: 'spine-asset-inspector',
      image: input.image,
      format: 'RGBA8888',
      size: { w: input.layout.width, h: input.layout.height },
      scale: '1',
      fps: input.fps,
      columns: input.layout.columns,
      rows: input.layout.rows,
    },
  }
}

export function unpremultiplyFlip(raw: Uint8Array, width: number, height: number, flip = true): { width: number; height: number; pixels: Uint8ClampedArray } {
  const pixels = new Uint8ClampedArray(width * height * 4)
  const stride = width * 4
  for (let y = 0; y < height; y++) {
    const source = (flip ? height - 1 - y : y) * stride
    const target = y * stride
    for (let x = 0; x < stride; x += 4) {
      const a = raw[source + x + 3]
      pixels[target + x + 3] = a
      if (a === 0) continue
      if (a === 255) {
        pixels[target + x] = raw[source + x]
        pixels[target + x + 1] = raw[source + x + 1]
        pixels[target + x + 2] = raw[source + x + 2]
        continue
      }
      pixels[target + x] = Math.round((raw[source + x] * 255) / a)
      pixels[target + x + 1] = Math.round((raw[source + x + 1] * 255) / a)
      pixels[target + x + 2] = Math.round((raw[source + x + 2] * 255) / a)
    }
  }
  return { width, height, pixels }
}
