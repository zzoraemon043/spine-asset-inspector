import { angleOf, determinant, distance, invert, normalize, wrapDegrees } from './affine'
import { HANDLE_FIELDS, type BonePose, type GizmoHandle, type SetupField, type SetupPatch, type SetupValues, type Vec } from './types'

export const ROTATE_SNAP = 15
export const SCALE_SNAP = 0.1
export const MIN_SCALE = 0.001

const PRECISION: Record<SetupField, number> = { x: 100, y: 100, rotation: 100, scaleX: 1000, scaleY: 1000 }

export function roundField(field: SetupField, value: number): number {
  const factor = PRECISION[field]
  const rounded = Math.round(value * factor) / factor
  return Object.is(rounded, -0) ? 0 : rounded
}

function snapTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

function guardScale(value: number): number {
  if (Math.abs(value) >= MIN_SCALE) return value
  return value < 0 ? -MIN_SCALE : MIN_SCALE
}

export function rotationSign(pose: BonePose): number {
  const world = Math.sign(determinant(pose.world)) || 1
  const local = Math.sign(pose.setup.scaleX * pose.setup.scaleY) || 1
  return world * local
}

export class GizmoDrag {
  readonly handle: GizmoHandle
  readonly pose: BonePose
  readonly start: Vec
  private lastAngle: number
  private turned = 0

  constructor(handle: GizmoHandle, pose: BonePose, start: Vec) {
    this.handle = handle
    this.pose = pose
    this.start = start
    this.lastAngle = angleOf(this.origin, start)
  }

  get origin(): Vec {
    return { x: this.pose.world.x, y: this.pose.world.y }
  }

  get fields(): readonly SetupField[] {
    return HANDLE_FIELDS[this.handle]
  }

  update(pointer: Vec, snap: boolean): SetupPatch {
    const raw = this.compute(pointer, snap)
    const result: Partial<Record<SetupField, number>> = {}
    for (const field of this.fields) result[field] = roundField(field, raw[field] ?? this.pose.setup[field])
    return result
  }

  changed(patch: SetupPatch): boolean {
    return this.fields.some((field) => patch[field] !== undefined && patch[field] !== this.pose.setup[field])
  }

  private compute(pointer: Vec, snap: boolean): SetupPatch {
    const setup: SetupValues = this.pose.setup
    if (this.handle === 'move' || this.handle === 'move-x' || this.handle === 'move-y') {
      const from = invert(this.pose.parent, this.start)
      const to = invert(this.pose.parent, pointer)
      let x = setup.x + (to.x - from.x)
      let y = setup.y + (to.y - from.y)
      if (snap) {
        x = Math.round(x)
        y = Math.round(y)
      }
      return this.handle === 'move-x' ? { x } : this.handle === 'move-y' ? { y } : { x, y }
    }
    if (this.handle === 'rotate') {
      const angle = angleOf(this.origin, pointer)
      this.turned += wrapDegrees(angle - this.lastAngle)
      this.lastAngle = angle
      const rotation = setup.rotation + this.turned * rotationSign(this.pose)
      return { rotation: snap ? snapTo(rotation, ROTATE_SNAP) : rotation }
    }
    const origin = this.origin
    if (this.handle === 'scale') {
      const base = distance(this.start, origin)
      const factor = base < 1e-6 ? 1 : distance(pointer, origin) / base
      const scaleX = guardScale(snap ? snapTo(setup.scaleX * factor, SCALE_SNAP) : setup.scaleX * factor)
      const scaleY = guardScale(snap ? snapTo(setup.scaleY * factor, SCALE_SNAP) : setup.scaleY * factor)
      return { scaleX, scaleY }
    }
    const world = this.pose.world
    const axis = this.handle === 'scale-x' ? normalize(world.a, world.c, { x: 1, y: 0 }) : normalize(world.b, world.d, { x: 0, y: 1 })
    const base = (this.start.x - origin.x) * axis.x + (this.start.y - origin.y) * axis.y
    const now = (pointer.x - origin.x) * axis.x + (pointer.y - origin.y) * axis.y
    const factor = Math.abs(base) < 1e-6 ? 1 : now / base
    const field: SetupField = this.handle === 'scale-x' ? 'scaleX' : 'scaleY'
    const value = setup[field] * factor
    return { [field]: guardScale(snap ? snapTo(value, SCALE_SNAP) : value) }
  }
}
