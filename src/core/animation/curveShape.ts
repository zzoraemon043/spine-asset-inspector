import type { Curve } from './channels'
import type { Segment } from './keyOps'

export type Handles = readonly [number, number, number, number]

export type CurveSpec = { readonly kind: 'linear' } | { readonly kind: 'stepped' } | { readonly kind: 'bezier'; readonly handles: Handles }

export interface CurvePreset {
  readonly id: string
  readonly label: string
  readonly spec: CurveSpec
}

export const LINEAR_HANDLES: Handles = [1 / 3, 1 / 3, 2 / 3, 2 / 3]

export const CURVE_PRESETS: readonly CurvePreset[] = [
  { id: 'linear', label: '線性', spec: { kind: 'linear' } },
  { id: 'stepped', label: '步進', spec: { kind: 'stepped' } },
  { id: 'ease-in', label: '緩入', spec: { kind: 'bezier', handles: [0.42, 0, 1, 1] } },
  { id: 'ease-out', label: '緩出', spec: { kind: 'bezier', handles: [0, 0, 0.58, 1] } },
  { id: 'ease-in-out', label: '緩入緩出', spec: { kind: 'bezier', handles: [0.42, 0, 0.58, 1] } },
  { id: 'back-out', label: '回彈', spec: { kind: 'bezier', handles: [0.34, 1.56, 0.64, 1] } },
  { id: 'back-in', label: '預備', spec: { kind: 'bezier', handles: [0.36, 0, 0.66, -0.56] } },
  { id: 'snap', label: '急停', spec: { kind: 'bezier', handles: [0, 0.8, 0.2, 1] } },
]

export const HANDLE_LIMIT = { min: -1, max: 2 } as const

export function clampHandles(handles: readonly number[]): Handles {
  const clampX = (value: number) => Math.min(1, Math.max(0, value))
  const clampY = (value: number) => Math.min(HANDLE_LIMIT.max, Math.max(HANDLE_LIMIT.min, value))
  const round = (value: number) => Math.round(value * 1e4) / 1e4
  return [round(clampX(handles[0])), round(clampY(handles[1])), round(clampX(handles[2])), round(clampY(handles[3]))]
}

export function normalizedHandles(curve: Curve, segment: Segment | null): Handles | null {
  if (typeof curve === 'string' || !segment) return null
  const span = segment.t1 - segment.t0
  if (Math.abs(span) < 1e-9) return null
  const channels = Math.floor(curve.length / 4)
  let channel = 0
  for (let index = 0; index < channels; index += 1) {
    if (Math.abs((segment.v1[index] ?? 0) - (segment.v0[index] ?? 0)) > 1e-9) {
      channel = index
      break
    }
  }
  const v0 = segment.v0[channel] ?? 0
  const valueSpan = (segment.v1[channel] ?? 0) - v0
  const offset = channel * 4
  const u = (x: number) => (x - segment.t0) / span
  const w = (y: number, fallback: number) => (Math.abs(valueSpan) < 1e-9 ? fallback : (y - v0) / valueSpan)
  return clampHandles([u(curve[offset]), w(curve[offset + 1], 1 / 3), u(curve[offset + 2]), w(curve[offset + 3], 2 / 3)])
}

export function absoluteCurve(handles: Handles, segment: Segment, channels: number): number[] {
  const result: number[] = []
  const span = segment.t1 - segment.t0
  for (let index = 0; index < channels; index += 1) {
    const v0 = segment.v0[index] ?? 0
    const valueSpan = (segment.v1[index] ?? 0) - v0
    result.push(
      Math.round((segment.t0 + handles[0] * span) * 1e6) / 1e6,
      Math.round((v0 + handles[1] * valueSpan) * 1e4) / 1e4,
      Math.round((segment.t0 + handles[2] * span) * 1e6) / 1e6,
      Math.round((v0 + handles[3] * valueSpan) * 1e4) / 1e4,
    )
  }
  return result
}

export function bezierPoint(handles: Handles, t: number): { x: number; y: number } {
  const inverse = 1 - t
  const a = 3 * inverse * inverse * t
  const b = 3 * inverse * t * t
  const c = t * t * t
  return { x: a * handles[0] + b * handles[2] + c, y: a * handles[1] + b * handles[3] + c }
}

export function sampleCurve(spec: CurveSpec, steps = 32): Array<{ x: number; y: number }> {
  if (spec.kind === 'linear') return [{ x: 0, y: 0 }, { x: 1, y: 1 }]
  if (spec.kind === 'stepped') return [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
  return Array.from({ length: steps + 1 }, (_, index) => bezierPoint(spec.handles, index / steps))
}

export function specOf(curve: Curve, segment: Segment | null): CurveSpec {
  if (curve === 'linear') return { kind: 'linear' }
  if (curve === 'stepped') return { kind: 'stepped' }
  return { kind: 'bezier', handles: normalizedHandles(curve, segment) ?? LINEAR_HANDLES }
}
