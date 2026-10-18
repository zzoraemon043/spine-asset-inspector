import { distance, normalize, segmentDistance } from './affine'
import type { BonePose, GizmoHandle, GizmoMode, Vec } from './types'

export const GIZMO_METRICS = { arm: 72, tip: 7, center: 8, ring: 62, pick: 7 } as const

export interface GizmoLayout {
  readonly bone: string
  readonly mode: GizmoMode
  readonly origin: Vec
  readonly tip: Vec
  readonly unit: number
  readonly axisX: Vec
  readonly axisY: Vec
  readonly arm: number
  readonly ring: number
  readonly box: number
}

const UNIT_X: Vec = { x: 1, y: 0 }
const UNIT_Y: Vec = { x: 0, y: 1 }

export function gizmoLayout(pose: BonePose, mode: GizmoMode, unit: number): GizmoLayout {
  const frame = mode === 'translate' ? pose.parent : pose.world
  const axisX = normalize(frame.a, frame.c, UNIT_X)
  const axisY = normalize(frame.b, frame.d, UNIT_Y)
  const origin = { x: pose.world.x, y: pose.world.y }
  const boneAxis = normalize(pose.world.a, pose.world.c, UNIT_X)
  const length = Math.max(pose.length * Math.hypot(pose.world.a, pose.world.c), 0)
  return {
    bone: pose.name,
    mode,
    origin,
    tip: { x: origin.x + boneAxis.x * length, y: origin.y + boneAxis.y * length },
    unit,
    axisX,
    axisY,
    arm: GIZMO_METRICS.arm * unit,
    ring: GIZMO_METRICS.ring * unit,
    box: GIZMO_METRICS.tip * unit,
  }
}

function along(layout: GizmoLayout, axis: Vec, length: number): Vec {
  return { x: layout.origin.x + axis.x * length, y: layout.origin.y + axis.y * length }
}

export function handlePoints(layout: GizmoLayout): Partial<Record<GizmoHandle, Vec>> {
  if (layout.mode === 'rotate') return { rotate: along(layout, layout.axisX, layout.ring) }
  if (layout.mode === 'translate') return { move: layout.origin, 'move-x': along(layout, layout.axisX, layout.arm), 'move-y': along(layout, layout.axisY, layout.arm) }
  return { scale: layout.origin, 'scale-x': along(layout, layout.axisX, layout.arm), 'scale-y': along(layout, layout.axisY, layout.arm) }
}

function insideBox(point: Vec, center: Vec, half: number): boolean {
  return Math.abs(point.x - center.x) <= half && Math.abs(point.y - center.y) <= half
}

export function hitGizmo(layout: GizmoLayout, point: Vec): GizmoHandle | null {
  const tolerance = GIZMO_METRICS.pick * layout.unit
  if (layout.mode === 'rotate') return Math.abs(distance(point, layout.origin) - layout.ring) <= tolerance ? 'rotate' : null
  const prefix = layout.mode === 'translate' ? 'move' : 'scale'
  if (insideBox(point, layout.origin, GIZMO_METRICS.center * layout.unit)) return prefix
  const tipX = along(layout, layout.axisX, layout.arm)
  const tipY = along(layout, layout.axisY, layout.arm)
  const toX = segmentDistance(point, layout.origin, tipX)
  const toY = segmentDistance(point, layout.origin, tipY)
  const best = Math.min(toX, toY)
  if (best > Math.max(tolerance, layout.box)) return null
  return toX <= toY ? (`${prefix}-x` as GizmoHandle) : (`${prefix}-y` as GizmoHandle)
}
