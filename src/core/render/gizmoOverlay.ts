import { Color, type SceneRenderer } from '@esotericsoftware/spine-webgl'
import { handlePoints, type GizmoLayout } from '../gizmo/layout'
import type { GizmoHandle, Vec } from '../gizmo/types'

export interface GizmoRender {
  readonly layout: GizmoLayout
  readonly active: GizmoHandle | null
  readonly hover: GizmoHandle | null
}

const COLOR_X = new Color(0.97, 0.36, 0.42, 1)
const COLOR_Y = new Color(0.29, 0.86, 0.5, 1)
const COLOR_CENTER = new Color(0.13, 0.83, 0.93, 1)
const COLOR_RING = new Color(0.98, 0.75, 0.14, 1)
const COLOR_ACTIVE = new Color(1, 1, 1, 1)
const COLOR_SHADOW = new Color(0.02, 0.03, 0.05, 0.55)
const COLOR_BONE = new Color(0.98, 0.35, 0.55, 1)

function tint(base: Color, handle: GizmoHandle, render: GizmoRender): Color {
  return render.active === handle || (render.active === null && render.hover === handle) ? COLOR_ACTIVE : base
}

function arrow(scene: SceneRenderer, from: Vec, to: Vec, unit: number, color: Color, square: boolean): void {
  scene.rectLine(true, from.x, from.y, to.x, to.y, unit * 4, COLOR_SHADOW)
  scene.rectLine(true, from.x, from.y, to.x, to.y, unit * 2, color)
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const size = unit * 7
  if (square) {
    scene.rect(true, to.x - size * 0.75, to.y - size * 0.75, size * 1.5, size * 1.5, color)
    return
  }
  scene.triangle(true, to.x + ux * size * 1.6, to.y + uy * size * 1.6, to.x - uy * size, to.y + ux * size, to.x + uy * size, to.y - ux * size, color)
}

export interface MeshOverlay {
  readonly vertices: readonly number[]
  readonly selected: readonly number[]
}

const COLOR_VERTEX = new Color(0.98, 0.75, 0.14, 1)

export function drawMeshVertices(scene: SceneRenderer, mesh: MeshOverlay, unit: number): void {
  const count = mesh.vertices.length / 2
  for (let index = 0; index < count; index += 1) {
    const x = mesh.vertices[index * 2]
    const y = mesh.vertices[index * 2 + 1]
    const next = (index + 1) % count
    scene.line(x, y, mesh.vertices[next * 2], mesh.vertices[next * 2 + 1], COLOR_SHADOW)
  }
  const selected = new Set(mesh.selected)
  for (let index = 0; index < count; index += 1) {
    const x = mesh.vertices[index * 2]
    const y = mesh.vertices[index * 2 + 1]
    const size = unit * (selected.has(index) ? 5 : 3.5)
    scene.rect(true, x - size - unit, y - size - unit, (size + unit) * 2, (size + unit) * 2, COLOR_SHADOW)
    scene.rect(true, x - size, y - size, size * 2, size * 2, selected.has(index) ? COLOR_ACTIVE : COLOR_VERTEX)
  }
}

export function drawGizmo(scene: SceneRenderer, render: GizmoRender): void {
  const layout = render.layout
  const unit = layout.unit
  const origin = layout.origin
  scene.rectLine(true, origin.x, origin.y, layout.tip.x, layout.tip.y, unit * 3, COLOR_BONE)
  const points = handlePoints(layout)
  if (layout.mode === 'rotate') {
    const ring = tint(COLOR_RING, 'rotate', render)
    scene.circle(false, origin.x, origin.y, layout.ring + unit, COLOR_SHADOW, 72)
    scene.circle(false, origin.x, origin.y, layout.ring, ring, 72)
    scene.circle(false, origin.x, origin.y, layout.ring - unit, ring, 72)
    const knob = points.rotate
    if (knob) {
      scene.rectLine(true, origin.x, origin.y, knob.x, knob.y, unit * 1.5, ring)
      scene.circle(true, knob.x, knob.y, unit * 6, ring, 20)
    }
    scene.circle(true, origin.x, origin.y, unit * 3, COLOR_CENTER, 16)
    return
  }
  const square = layout.mode === 'scale'
  const prefix = square ? 'scale' : 'move'
  const tipX = points[`${prefix}-x` as GizmoHandle]
  const tipY = points[`${prefix}-y` as GizmoHandle]
  if (tipX) arrow(scene, origin, tipX, unit, tint(COLOR_X, `${prefix}-x` as GizmoHandle, render), square)
  if (tipY) arrow(scene, origin, tipY, unit, tint(COLOR_Y, `${prefix}-y` as GizmoHandle, render), square)
  const half = unit * 8
  const center = tint(COLOR_CENTER, prefix as GizmoHandle, render)
  scene.rect(true, origin.x - half - unit, origin.y - half - unit, (half + unit) * 2, (half + unit) * 2, COLOR_SHADOW)
  if (square) scene.rect(true, origin.x - half, origin.y - half, half * 2, half * 2, center)
  else {
    scene.rect(false, origin.x - half, origin.y - half, half * 2, half * 2, center)
    scene.circle(true, origin.x, origin.y, unit * 3, center, 16)
  }
}
