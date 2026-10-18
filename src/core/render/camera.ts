import type { Bounds } from '../types'

export interface ViewState {
  readonly centerX: number
  readonly centerY: number
  readonly scale: number
}

export interface Viewport {
  readonly width: number
  readonly height: number
}

export const SCALE_MIN = 0.02
export const SCALE_MAX = 40
export const DEFAULT_VIEW: ViewState = { centerX: 0, centerY: 150, scale: 1 }

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale))
}

export function fitView(bounds: Bounds, viewport: Viewport, padding = 0.15): ViewState {
  const width = Math.max(1, bounds.width)
  const height = Math.max(1, bounds.height)
  const usableWidth = Math.max(1, viewport.width * (1 - padding * 2))
  const usableHeight = Math.max(1, viewport.height * (1 - padding * 2))
  return {
    centerX: bounds.x + width / 2,
    centerY: bounds.y + height / 2,
    scale: clampScale(Math.min(usableWidth / width, usableHeight / height)),
  }
}

export function screenToWorld(view: ViewState, viewport: Viewport, screenX: number, screenY: number): { x: number; y: number } {
  return {
    x: view.centerX + (screenX - viewport.width / 2) / view.scale,
    y: view.centerY - (screenY - viewport.height / 2) / view.scale,
  }
}

export function worldToScreen(view: ViewState, viewport: Viewport, worldX: number, worldY: number): { x: number; y: number } {
  return {
    x: (worldX - view.centerX) * view.scale + viewport.width / 2,
    y: viewport.height / 2 - (worldY - view.centerY) * view.scale,
  }
}

export function zoomAt(view: ViewState, viewport: Viewport, factor: number, screenX: number, screenY: number): ViewState {
  const scale = clampScale(view.scale * factor)
  const anchor = screenToWorld(view, viewport, screenX, screenY)
  return {
    scale,
    centerX: anchor.x - (screenX - viewport.width / 2) / scale,
    centerY: anchor.y + (screenY - viewport.height / 2) / scale,
  }
}

export function panBy(view: ViewState, deltaX: number, deltaY: number): ViewState {
  return { ...view, centerX: view.centerX - deltaX / view.scale, centerY: view.centerY + deltaY / view.scale }
}

export function unionBounds(a: Bounds | null, b: Bounds): Bounds {
  if (!a) return b
  const minX = Math.min(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxX = Math.max(a.x + a.width, b.x + b.width)
  const maxY = Math.max(a.y + a.height, b.y + b.height)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function padBounds(bounds: Bounds, padding: number): Bounds {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  }
}
