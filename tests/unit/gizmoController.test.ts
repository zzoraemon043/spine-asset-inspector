import { beforeEach, describe, expect, it } from 'vitest'
import { useInspectorStore } from '../../src/store/inspectorStore'
import { useLiveStore } from '../../src/store/liveStore'
import { worldToScreen } from '../../src/core/render/camera'
import { GIZMO_METRICS } from '../../src/core/gizmo/layout'
import { createHarness, type FakeHarness } from '../support/fakeEnvironment'

let harness: FakeHarness
const state = () => useInspectorStore.getState()

function screenOf(x: number, y: number) {
  return worldToScreen(harness.stage.getView(), harness.stage.viewport, x, y)
}

function boneWorld(name: string) {
  const bone = harness.controller.instance!.skeleton.findBone(name)!
  return { x: bone.worldX, y: bone.worldY, rotation: bone.getWorldRotationX() }
}

function enterSetup(bone = 'torso') {
  harness.controller.setSetupMode(true)
  harness.controller.select({ kind: 'bone', name: bone })
  harness.runFrames(1)
}

beforeEach(async () => {
  harness = createHarness()
  await harness.controller.loadDemo()
  harness.stage.setView({ centerX: 0, centerY: 150, scale: 1 })
})

describe('setup mode', () => {
  it('stops animation, shows the setup pose and restores playback on exit', () => {
    const controller = harness.controller
    harness.runFrames(20)
    expect(controller.setSetupMode(true)).toBe(true)
    expect(controller.setSetupMode(true)).toBe(false)
    expect(state()).toMatchObject({ setupMode: true, playing: false })
    expect(controller.instance!.state.getCurrent(0)).toBeNull()
    const head = controller.instance!.skeleton.findBone('head')!
    expect(head.rotation).toBe(head.data.rotation)
    harness.runFrames(10)
    expect(head.rotation).toBe(head.data.rotation)
    expect(controller.toggleSetupMode()).toBe(true)
    expect(state()).toMatchObject({ setupMode: false, playing: true })
    expect(controller.instance!.state.getCurrent(0)?.animation?.name).toBe('idle')
  })

  it('leaves setup mode when playing or switching animations', () => {
    const controller = harness.controller
    controller.setSetupMode(true)
    controller.setPlaying(true)
    expect(state().setupMode).toBe(false)
    controller.setSetupMode(true)
    controller.selectAnimation('walk')
    expect(state()).toMatchObject({ setupMode: false, animation: 'walk' })
    expect(controller.instance!.state.getCurrent(0)?.animation?.name).toBe('walk')
  })

  it('refuses setup mode when the asset cannot be edited', () => {
    harness.controller.editor.onAssetLoaded(null, '僅供檢視')
    expect(harness.controller.setSetupMode(true)).toBe(false)
    expect(state().notices.at(-1)).toMatchObject({ level: 'warning', text: '僅供檢視' })
  })

  it('keeps the setup pose after edits are rebuilt', () => {
    const controller = harness.controller
    controller.setSetupMode(true)
    controller.editor.setBoneField('head', 'rotation', 25)
    expect(controller.instance!.state.getCurrent(0)).toBeNull()
    expect(controller.instance!.skeleton.findBone('head')!.rotation).toBe(25)
    expect(controller.instance!.paused).toBe(true)
  })
})

describe('gizmo interaction', () => {
  it('only shows a gizmo for a selected bone in setup mode', () => {
    const controller = harness.controller
    controller.select({ kind: 'bone', name: 'torso' })
    harness.runFrames(1)
    expect(harness.stage.frames.at(-1)?.gizmo).toBeNull()
    expect(controller.gizmo.begin(400, 300)).toBe(false)
    expect(controller.gizmo.end()).toBe(false)
    expect(controller.gizmo.cancel()).toBe(false)
    expect(controller.gizmo.move(1, 1)).toBe(false)
    enterSetup()
    const frame = harness.stage.frames.at(-1)!
    expect(frame.gizmo?.layout).toMatchObject({ bone: 'torso', mode: 'translate' })
    const screen = useLiveStore.getState().gizmo!
    const origin = screenOf(boneWorld('torso').x, boneWorld('torso').y)
    expect(screen.origin[0]).toBeCloseTo(origin.x, 0)
    expect(screen.origin[1]).toBeCloseTo(origin.y, 0)
    expect(Object.keys(screen.handles)).toEqual(['move', 'move-x', 'move-y'])
    controller.setGizmoMode('rotate')
    harness.runFrames(1)
    expect(Object.keys(useLiveStore.getState().gizmo!.handles)).toEqual(['rotate'])
    controller.select({ kind: 'slot', name: 'head' })
    harness.runFrames(1)
    expect(useLiveStore.getState().gizmo).toBeNull()
  })

  it('translates a bone with live preview, moves its children and commits one history entry', () => {
    const controller = harness.controller
    enterSetup()
    const torso = boneWorld('torso')
    const head = boneWorld('head')
    const start = screenOf(torso.x, torso.y)
    expect(controller.gizmo.hoverAt(start.x, start.y)).toBe('move')
    expect(useLiveStore.getState().gizmoHover).toBe('move')
    expect(controller.gizmo.begin(start.x, start.y)).toBe(true)
    expect(controller.gizmo.dragging).toBe(true)
    for (let step = 1; step <= 10; step += 1) controller.gizmo.move(start.x + step * 3, start.y - step * 2)
    expect(useLiveStore.getState().gizmoPreview).toMatchObject({ bone: 'torso', handle: 'move' })
    const moved = boneWorld('torso')
    expect(moved.x - torso.x).toBeCloseTo(30, 1)
    expect(moved.y - torso.y).toBeCloseTo(20, 1)
    const headMoved = boneWorld('head')
    expect(headMoved.x - head.x).toBeCloseTo(30, 1)
    expect(headMoved.y - head.y).toBeCloseTo(20, 1)
    expect(state().editor.entries).toHaveLength(0)
    expect(controller.gizmo.end()).toBe(true)
    expect(useLiveStore.getState().gizmoPreview).toBeNull()
    expect(state().editor.entries.map((entry) => entry.label)).toEqual(['移動骨骼 torso'])
    expect(boneWorld('torso').x - torso.x).toBeCloseTo(30, 1)
    expect(boneWorld('head').y - head.y).toBeCloseTo(20, 1)
    controller.editor.undo()
    expect(boneWorld('torso').x).toBeCloseTo(torso.x, 6)
    expect(boneWorld('head').y).toBeCloseTo(head.y, 6)
  })

  it('rotates around the bone origin and carries child bones along', () => {
    const controller = harness.controller
    enterSetup()
    controller.setGizmoMode('rotate')
    harness.runFrames(1)
    const torso = boneWorld('torso')
    const head = boneWorld('head')
    const radius = GIZMO_METRICS.ring
    const knob = screenOf(torso.x + Math.cos((torso.rotation * Math.PI) / 180) * radius, torso.y + Math.sin((torso.rotation * Math.PI) / 180) * radius)
    expect(controller.gizmo.begin(knob.x, knob.y)).toBe(true)
    const target = torso.rotation + 30
    const end = screenOf(torso.x + Math.cos((target * Math.PI) / 180) * radius, torso.y + Math.sin((target * Math.PI) / 180) * radius)
    controller.gizmo.move(end.x, end.y)
    expect(controller.gizmo.end()).toBe(true)
    expect(boneWorld('torso').rotation).toBeCloseTo(torso.rotation + 30, 0)
    const before = Math.atan2(head.y - torso.y, head.x - torso.x)
    const after = Math.atan2(boneWorld('head').y - torso.y, boneWorld('head').x - torso.x)
    expect(((after - before) * 180) / Math.PI).toBeCloseTo(30, 0)
    expect(state().editor.undoLabel).toBe('旋轉骨骼 torso')
  })

  it('scales along one axis and snaps when requested', () => {
    const controller = harness.controller
    enterSetup()
    controller.setGizmoMode('scale')
    controller.toggleGizmoSnap()
    harness.runFrames(1)
    const handle = useLiveStore.getState().gizmo!.handles['scale-x']!
    const origin = useLiveStore.getState().gizmo!.origin
    expect(controller.gizmo.begin(handle[0], handle[1])).toBe(true)
    controller.gizmo.move(origin[0] + (handle[0] - origin[0]) * 1.52, origin[1] + (handle[1] - origin[1]) * 1.52)
    expect(useLiveStore.getState().gizmoPreview?.values).toEqual({ scaleX: 1.5 })
    controller.gizmo.move(origin[0] + (handle[0] - origin[0]) * 1.52, origin[1] + (handle[1] - origin[1]) * 1.52, true)
    expect(useLiveStore.getState().gizmoPreview?.values.scaleX).toBeCloseTo(1.52, 1)
    controller.gizmo.end()
    expect(controller.instance!.data.findBone('torso')!.scaleX).toBeCloseTo(1.52, 1)
  })

  it('cancels a drag without history and ignores drags that change nothing', () => {
    const controller = harness.controller
    enterSetup()
    const torso = boneWorld('torso')
    const start = screenOf(torso.x, torso.y)
    controller.gizmo.begin(start.x, start.y)
    controller.gizmo.move(start.x + 50, start.y)
    expect(controller.gizmo.cancel()).toBe(true)
    expect(boneWorld('torso').x).toBeCloseTo(torso.x, 6)
    controller.gizmo.begin(start.x, start.y)
    expect(controller.gizmo.end()).toBe(false)
    expect(state().editor.entries).toHaveLength(0)
    controller.gizmo.begin(start.x, start.y)
    controller.setGizmoMode('rotate')
    expect(controller.gizmo.dragging).toBe(false)
  })

  it('picks bones on the canvas and reveals them in the tree', () => {
    const controller = harness.controller
    enterSetup('root')
    const bone = controller.instance!.skeleton.findBone('arm-front-lower')!
    const middle = screenOf(bone.worldX + bone.a * bone.data.length * 0.5, bone.worldY + bone.c * bone.data.length * 0.5)
    useInspectorStore.setState({ treeExpanded: {} })
    expect(controller.gizmo.pick(middle.x, middle.y)).toBe('arm-front-lower')
    expect(state().selection).toEqual({ kind: 'bone', name: 'arm-front-lower' })
    expect(state().treeExpanded).toMatchObject({ bones: true, 'bone:arm-front-upper': true, 'bone:root': true })
    expect(controller.gizmo.pick(5, 5)).toBeNull()
  })
})
