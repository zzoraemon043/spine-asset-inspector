import { segmentDistance } from './affine'
import type { Vec } from './types'

export interface BoneSegment {
  readonly name: string
  readonly origin: Vec
  readonly tip: Vec
}

export function pickBone(segments: readonly BoneSegment[], point: Vec, tolerance: number): string | null {
  let best: string | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const segment of segments) {
    const value = segmentDistance(point, segment.origin, segment.tip)
    if (value > tolerance) continue
    if (value <= bestDistance + tolerance * 0.05) {
      best = segment.name
      bestDistance = Math.min(value, bestDistance)
    }
  }
  return best
}
