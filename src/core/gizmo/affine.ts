import type { Affine, Vec } from './types'

export function apply(frame: Affine, local: Vec): Vec {
  return { x: frame.a * local.x + frame.b * local.y + frame.x, y: frame.c * local.x + frame.d * local.y + frame.y }
}

export function determinant(frame: Pick<Affine, 'a' | 'b' | 'c' | 'd'>): number {
  return frame.a * frame.d - frame.b * frame.c
}

export function invert(frame: Affine, world: Vec): Vec {
  const det = determinant(frame)
  if (Math.abs(det) < 1e-12) return { x: world.x - frame.x, y: world.y - frame.y }
  const dx = world.x - frame.x
  const dy = world.y - frame.y
  return { x: (frame.d * dx - frame.b * dy) / det, y: (frame.a * dy - frame.c * dx) / det }
}

export function normalize(x: number, y: number, fallback: Vec): Vec {
  const length = Math.hypot(x, y)
  return length < 1e-9 ? fallback : { x: x / length, y: y / length }
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function segmentDistance(point: Vec, start: Vec, end: Vec): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared < 1e-12) return distance(point, start)
  const t = Math.min(1, Math.max(0, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t))
}

export function angleOf(origin: Vec, point: Vec): number {
  return (Math.atan2(point.y - origin.y, point.x - origin.x) * 180) / Math.PI
}

export function wrapDegrees(value: number): number {
  let result = value % 360
  if (result > 180) result -= 360
  if (result <= -180) result += 360
  return result
}
