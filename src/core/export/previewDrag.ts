import type { Bounds } from '../types'

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export const CROP_LIMIT = 100000

const MIN_CROP = 1

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function limit(value: number): number {
  return Math.min(CROP_LIMIT, Math.max(-CROP_LIMIT, value))
}

export function sanitizeCrop(crop: Bounds | null | undefined): Bounds | null {
  if (!crop) return null
  const x = Math.round(limit(finite(crop.x, 0))) + 0
  const y = Math.round(limit(finite(crop.y, 0))) + 0
  const right = Math.round(finite(crop.x, 0) + finite(crop.width, MIN_CROP))
  const top = Math.round(finite(crop.y, 0) + finite(crop.height, MIN_CROP))
  return {
    x,
    y,
    width: Math.min(CROP_LIMIT, Math.max(MIN_CROP, right - x)),
    height: Math.min(CROP_LIMIT, Math.max(MIN_CROP, top - y)),
  }
}

export function enclosingCrop(bounds: Bounds): Bounds {
  const x = Math.floor(bounds.x)
  const y = Math.floor(bounds.y)
  return { x, y, width: Math.max(MIN_CROP, Math.ceil(bounds.x + bounds.width) - x), height: Math.max(MIN_CROP, Math.ceil(bounds.y + bounds.height) - y) }
}

export function resizeCrop(start: Bounds, handle: ResizeHandle, dx: number, dy: number): Bounds {
  let left = start.x
  let right = start.x + start.width
  let bottom = start.y
  let top = start.y + start.height
  if (handle.includes('w')) left = Math.min(left + dx, right - MIN_CROP)
  if (handle.includes('e')) right = Math.max(right + dx, left + MIN_CROP)
  if (handle.includes('s')) bottom = Math.min(bottom + dy, top - MIN_CROP)
  if (handle.includes('n')) top = Math.max(top + dy, bottom + MIN_CROP)
  return { x: left, y: bottom, width: right - left, height: top - bottom }
}

export function moveCrop(start: Bounds, dx: number, dy: number): Bounds {
  return { ...start, x: start.x + dx, y: start.y + dy }
}

export function screenToWorld(dx: number, dy: number, viewScale: number): { dx: number; dy: number } {
  const scale = viewScale > 0 && Number.isFinite(viewScale) ? viewScale : 1
  return { dx: dx / scale, dy: -dy / scale }
}

export function handleCursor(handle: ResizeHandle): string {
  if (handle === 'n' || handle === 's') return 'ns-resize'
  if (handle === 'e' || handle === 'w') return 'ew-resize'
  return handle === 'ne' || handle === 'sw' ? 'nesw-resize' : 'nwse-resize'
}
