import { describe, expect, it } from 'vitest'
import { apply, angleOf, determinant, invert, normalize, segmentDistance, wrapDegrees } from '../../src/core/gizmo/affine'
import { GIZMO_METRICS, gizmoLayout, handlePoints, hitGizmo } from '../../src/core/gizmo/layout'
import { GizmoDrag, roundField, rotationSign } from '../../src/core/gizmo/drag'
import { pickBone } from '../../src/core/gizmo/pick'
import type { Affine, BonePose, SetupValues } from '../../src/core/gizmo/types'

const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, x: 0, y: 0 }

function rotated(degrees: number, scale = 1, x = 0, y = 0): Affine {
  const r = (degrees * Math.PI) / 180
  return { a: Math.cos(r) * scale, b: -Math.sin(r) * scale, c: Math.sin(r) * scale, d: Math.cos(r) * scale, x, y }
}

function pose(overrides: Partial<BonePose> = {}, setup: Partial<SetupValues> = {}): BonePose {
  return {
    name: 'arm',
    world: rotated(0, 1, 100, 50),
    parent: IDENTITY,
    length: 40,
    setup: { x: 100, y: 50, rotation: 0, scaleX: 1, scaleY: 1, ...setup },
    ...overrides,
  }
}

describe('gizmo affine math', () => {
  it('applies and inverts frames', () => {
    const frame = rotated(30, 2, 10, -5)
    const local = { x: 3, y: -7 }
    const world = apply(frame, local)
    const back = invert(frame, world)
    expect(back.x).toBeCloseTo(3, 9)
    expect(back.y).toBeCloseTo(-7, 9)
    expect(determinant(frame)).toBeCloseTo(4, 9)
    expect(invert({ a: 0, b: 0, c: 0, d: 0, x: 1, y: 2 }, { x: 4, y: 6 })).toEqual({ x: 3, y: 4 })
  })

  it('measures angles, segments and wraps degrees', () => {
    expect(angleOf({ x: 0, y: 0 }, { x: 0, y: 5 })).toBeCloseTo(90)
    expect(wrapDegrees(270)).toBe(-90)
    expect(wrapDegrees(-190)).toBe(170)
    expect(wrapDegrees(180)).toBe(180)
    expect(segmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3)
    expect(segmentDistance({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5)
    expect(segmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5)
    expect(normalize(0, 0, { x: 1, y: 0 })).toEqual({ x: 1, y: 0 })
  })
})

describe('gizmo layout and hit testing', () => {
  it('sizes handles in screen pixels and orients axes per mode', () => {
    const bone = pose({ world: rotated(90, 1, 100, 50), parent: rotated(45) })
    const translate = gizmoLayout(bone, 'translate', 0.5)
    expect(translate.arm).toBe(GIZMO_METRICS.arm * 0.5)
    expect(translate.axisX.x).toBeCloseTo(Math.SQRT1_2)
    expect(translate.axisX.y).toBeCloseTo(Math.SQRT1_2)
    expect(translate.tip.x).toBeCloseTo(100)
    expect(translate.tip.y).toBeCloseTo(90)
    const scale = gizmoLayout(bone, 'scale', 1)
    expect(scale.axisX.x).toBeCloseTo(0)
    expect(scale.axisX.y).toBeCloseTo(1)
    const rotate = gizmoLayout(bone, 'rotate', 1)
    expect(handlePoints(rotate).rotate!.y).toBeCloseTo(50 + GIZMO_METRICS.ring)
    expect(Object.keys(handlePoints(translate))).toEqual(['move', 'move-x', 'move-y'])
    expect(Object.keys(handlePoints(scale))).toEqual(['scale', 'scale-x', 'scale-y'])
  })

  it('hits every handle and misses empty space', () => {
    const bone = pose()
    const translate = gizmoLayout(bone, 'translate', 1)
    expect(hitGizmo(translate, { x: 102, y: 51 })).toBe('move')
    expect(hitGizmo(translate, { x: 160, y: 52 })).toBe('move-x')
    expect(hitGizmo(translate, { x: 99, y: 110 })).toBe('move-y')
    expect(hitGizmo(translate, { x: 160, y: 100 })).toBeNull()
    const scale = gizmoLayout(bone, 'scale', 1)
    expect(hitGizmo(scale, { x: 100, y: 50 })).toBe('scale')
    expect(hitGizmo(scale, { x: 172, y: 50 })).toBe('scale-x')
    expect(hitGizmo(scale, { x: 100, y: 122 })).toBe('scale-y')
    const rotate = gizmoLayout(bone, 'rotate', 1)
    expect(hitGizmo(rotate, { x: 100, y: 50 + GIZMO_METRICS.ring + 3 })).toBe('rotate')
    expect(hitGizmo(rotate, { x: 100, y: 50 })).toBeNull()
    const zoomed = gizmoLayout(bone, 'rotate', 0.25)
    expect(hitGizmo(zoomed, { x: 100 + GIZMO_METRICS.ring * 0.25, y: 50 })).toBe('rotate')
  })
})

describe('gizmo drag', () => {
  it('translates freely and along one parent axis in parent space', () => {
    const bone = pose({ parent: rotated(90, 2) })
    const free = new GizmoDrag('move', bone, { x: 100, y: 50 })
    expect(free.update({ x: 100, y: 70 }, false)).toEqual({ x: 110, y: 50 })
    expect(free.update({ x: 90, y: 50 }, false)).toEqual({ x: 100, y: 55 })
    const axis = new GizmoDrag('move-x', bone, { x: 100, y: 50 })
    expect(axis.update({ x: 90, y: 70 }, false)).toEqual({ x: 110 })
    const other = new GizmoDrag('move-y', bone, { x: 100, y: 50 })
    expect(other.update({ x: 90, y: 70 }, false)).toEqual({ y: 55 })
    expect(free.update({ x: 100.3, y: 70.7 }, true)).toEqual({ x: 110, y: 50 })
    expect(free.fields).toEqual(['x', 'y'])
  })

  it('rotates continuously past 180 degrees and snaps to 15 degrees', () => {
    const bone = pose({}, { rotation: 10 })
    const drag = new GizmoDrag('rotate', bone, { x: 160, y: 50 })
    expect(drag.update({ x: 100, y: 110 }, false)).toEqual({ rotation: 100 })
    expect(drag.update({ x: 40, y: 50 }, false)).toEqual({ rotation: 190 })
    expect(drag.update({ x: 100, y: -10 }, false)).toEqual({ rotation: 280 })
    expect(drag.update({ x: 160, y: 49 }, false).rotation).toBeCloseTo(369.05, 1)
    const snapped = new GizmoDrag('rotate', bone, { x: 160, y: 50 })
    expect(snapped.update({ x: 160, y: 72 }, true)).toEqual({ rotation: 30 })
  })

  it('reverses rotation direction under a mirrored parent', () => {
    const mirrored = pose({ world: { a: -1, b: 0, c: 0, d: 1, x: 100, y: 50 } })
    expect(rotationSign(mirrored)).toBe(-1)
    const drag = new GizmoDrag('rotate', mirrored, { x: 160, y: 50 })
    expect(drag.update({ x: 100, y: 110 }, false)).toEqual({ rotation: -90 })
    expect(rotationSign(pose({}, { scaleX: -1 }))).toBe(-1)
  })

  it('scales uniformly and per bone axis with snapping and a minimum', () => {
    const bone = pose({ world: rotated(90, 1, 100, 50) }, { scaleX: 1.5, scaleY: 0.5 })
    const uniform = new GizmoDrag('scale', bone, { x: 120, y: 50 })
    expect(uniform.update({ x: 140, y: 50 }, false)).toEqual({ scaleX: 3, scaleY: 1 })
    expect(uniform.update({ x: 100, y: 50 }, false)).toEqual({ scaleX: 0.001, scaleY: 0.001 })
    const axisX = new GizmoDrag('scale-x', bone, { x: 100, y: 70 })
    expect(axisX.update({ x: 130, y: 80 }, false)).toEqual({ scaleX: 2.25 })
    expect(axisX.update({ x: 100, y: 30 }, false)).toEqual({ scaleX: -1.5 })
    const axisY = new GizmoDrag('scale-y', bone, { x: 80, y: 50 })
    expect(axisY.update({ x: 60, y: 50 }, false)).toEqual({ scaleY: 1 })
    expect(axisY.update({ x: 67, y: 50 }, true)).toEqual({ scaleY: 0.8 })
    const degenerate = new GizmoDrag('scale', bone, { x: 100, y: 50 })
    expect(degenerate.update({ x: 140, y: 50 }, false)).toEqual({ scaleX: 1.5, scaleY: 0.5 })
  })

  it('reports whether a patch changes the setup and rounds values', () => {
    const drag = new GizmoDrag('move', pose(), { x: 100, y: 50 })
    expect(drag.changed({ x: 100, y: 50 })).toBe(false)
    expect(drag.changed({ x: 100.5, y: 50 })).toBe(true)
    expect(roundField('x', 1.23456)).toBe(1.23)
    expect(roundField('scaleX', 1.23456)).toBe(1.235)
    expect(Object.is(roundField('rotation', -0.001), 0)).toBe(true)
    expect(drag.origin).toEqual({ x: 100, y: 50 })
  })
})

describe('bone picking', () => {
  const segments = [
    { name: 'root', origin: { x: 0, y: 0 }, tip: { x: 0, y: 0 } },
    { name: 'hip', origin: { x: 0, y: 100 }, tip: { x: 0, y: 100 } },
    { name: 'torso', origin: { x: 0, y: 100 }, tip: { x: 0, y: 200 } },
    { name: 'arm', origin: { x: 50, y: 150 }, tip: { x: 120, y: 150 } },
  ]

  it('picks the nearest bone segment within tolerance, preferring later bones on ties', () => {
    expect(pickBone(segments, { x: 2, y: 160 }, 6)).toBe('torso')
    expect(pickBone(segments, { x: 0, y: 100 }, 6)).toBe('torso')
    expect(pickBone(segments, { x: 90, y: 153 }, 6)).toBe('arm')
    expect(pickBone(segments, { x: 1, y: 2 }, 6)).toBe('root')
    expect(pickBone(segments, { x: 300, y: 300 }, 6)).toBeNull()
  })
})
