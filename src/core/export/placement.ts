import type { Bounds } from '../types'
import { padBounds, unionBounds } from '../render/camera'
import { resolveFrameSize, type FrameSize, type OutputOptions } from './exportPlan'

export type ExportAlign = 'center' | 'bottom'

export interface PlacementOptions {
  readonly align: ExportAlign
  readonly offsetX: number
  readonly offsetY: number
}

export const DEFAULT_PLACEMENT: PlacementOptions = { align: 'center', offsetX: 0, offsetY: 0 }

export const VIEW_MARGIN = 0.08

export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface FramePlacement {
  readonly centerX: number
  readonly centerY: number
}

export interface Framing {
  readonly bounds: Bounds
  readonly size: FrameSize
  readonly placement: FramePlacement
}

export function placeContent(bounds: Bounds, size: FrameSize, options: PlacementOptions = DEFAULT_PLACEMENT): FramePlacement {
  const worldHeight = size.height / size.scale
  const baseY = options.align === 'bottom' ? bounds.y + worldHeight / 2 : bounds.y + bounds.height / 2
  return {
    centerX: bounds.x + bounds.width / 2 - options.offsetX / size.scale,
    centerY: baseY + options.offsetY / size.scale,
  }
}

export function cropActive(options: OutputOptions): boolean {
  return options.sizeMode === 'crop' && !!options.crop && options.crop.width > 0 && options.crop.height > 0
}

export function frameFor(content: Bounds, options: OutputOptions): Framing {
  if (cropActive(options) && options.crop) {
    const crop = options.crop
    return { bounds: crop, size: resolveFrameSize(crop, options), placement: { centerX: crop.x + crop.width / 2, centerY: crop.y + crop.height / 2 } }
  }
  const fallback: OutputOptions = options.sizeMode === 'crop' ? { ...options, sizeMode: 'scale' } : options
  const bounds = padBounds(content, options.padding)
  const size = resolveFrameSize(bounds, fallback)
  return { bounds, size, placement: placeContent(bounds, size, { align: options.align ?? 'center', offsetX: options.offsetX ?? 0, offsetY: options.offsetY ?? 0 }) }
}

export function frameWorld(size: FrameSize, placement: FramePlacement): Bounds {
  const width = size.width / size.scale
  const height = size.height / size.scale
  return { x: placement.centerX - width / 2, y: placement.centerY - height / 2, width, height }
}

export function worldToFrame(rect: Bounds, size: FrameSize, placement: FramePlacement): Rect {
  const left = placement.centerX - size.width / size.scale / 2
  const top = placement.centerY + size.height / size.scale / 2
  return {
    x: (rect.x - left) * size.scale,
    y: (top - (rect.y + rect.height)) * size.scale,
    width: rect.width * size.scale,
    height: rect.height * size.scale,
  }
}

export function worldToView(rect: Bounds, view: Bounds, scale: number): Rect {
  return {
    x: (rect.x - view.x) * scale,
    y: (view.y + view.height - (rect.y + rect.height)) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  }
}

export function overflow(rect: Rect, width: number, height: number): number {
  const left = Math.max(0, -rect.x)
  const top = Math.max(0, -rect.y)
  const right = Math.max(0, rect.x + rect.width - width)
  const bottom = Math.max(0, rect.y + rect.height - height)
  return Math.round(Math.max(left, top, right, bottom) * 10) / 10
}

export function fitScale(width: number, height: number, maxWidth: number, maxHeight: number): number {
  return Math.min(maxWidth / Math.max(1e-6, width), maxHeight / Math.max(1e-6, height))
}

export function viewAround(frame: Bounds, content: Bounds, pose: Bounds): Bounds {
  const union = unionBounds(unionBounds(frame, content), pose)
  return padBounds(union, Math.max(union.width, union.height) * VIEW_MARGIN)
}

export interface PreviewGeometry {
  readonly size: FrameSize
  readonly small: FrameSize
  readonly framing: Framing
  readonly view: Bounds
  readonly viewScale: number
  readonly viewPlacement: FramePlacement
  readonly previewScale: number
  readonly frameWorld: Bounds
  readonly frame: Rect
  readonly content: Rect
  readonly paddedRect: Rect
  readonly pose: Rect
  readonly contentOverflow: number
  readonly poseOverflow: number
}

export function previewGeometry(content: Bounds, pose: Bounds, options: OutputOptions, maxWidth: number, maxHeight: number, lockedView: Bounds | null = null): PreviewGeometry {
  const framing = frameFor(content, options)
  const { size, placement } = framing
  const world = frameWorld(size, placement)
  const view = lockedView ?? viewAround(world, content, pose)
  const viewScale = fitScale(view.width, view.height, maxWidth, maxHeight)
  const small: FrameSize = { width: Math.max(1, Math.round(view.width * viewScale)), height: Math.max(1, Math.round(view.height * viewScale)), scale: viewScale }
  return {
    size,
    small,
    framing,
    view,
    viewScale,
    viewPlacement: { centerX: view.x + view.width / 2, centerY: view.y + view.height / 2 },
    previewScale: viewScale / size.scale,
    frameWorld: world,
    frame: worldToView(world, view, viewScale),
    content: worldToView(content, view, viewScale),
    paddedRect: worldToView(framing.bounds, view, viewScale),
    pose: worldToView(pose, view, viewScale),
    contentOverflow: overflow(worldToFrame(content, size, placement), size.width, size.height),
    poseOverflow: overflow(worldToFrame(pose, size, placement), size.width, size.height),
  }
}
