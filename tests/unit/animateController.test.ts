import { beforeEach, describe, expect, it } from 'vitest'
import { useInspectorStore } from '../../src/store/inspectorStore'
import { useLiveStore } from '../../src/store/liveStore'
import { worldToScreen } from '../../src/core/render/camera'
import { GIZMO_METRICS } from '../../src/core/gizmo/layout'
import { channelKeys } from '../../src/core/animation/keyCommands'
import { createHarness, type FakeHarness } from '../support/fakeEnvironment'

let harness: FakeHarness
const state = () => useInspectorStore.getState()
const keys = (bone: string, channel: string, animation = 'walk') => channelKeys(state().editor.document!, animation, bone, channel)

function screenOf(x: number, y: number) {
  return worldToScreen(harness.stage.getView(), harness.stage.viewport, x, y)
}

function enterAnimate(frame = 10, bone = 'torso') {
  const controller = harness.controller
  controller.selectAnimation('walk')
  expect(controller.setAnimateMode(true)).toBe(true)
  controller.seekFrame(frame)
  controller.select({ kind: 'bone', name: bone })
  harness.runFrames(1)
}

function rotateBy(bone: string, degrees: number) {
  const controller = harness.controller
  controller.setGizmoMode('rotate')
  harness.runFrames(1)
  const target = controller.instance!.skeleton.findBone(bone)!
  const angle = target.getWorldRotationX()
  const point = (value: number) => screenOf(target.worldX + Math.cos((value * Math.PI) / 180) * GIZMO_METRICS.ring, target.worldY + Math.sin((value * Math.PI) / 180) * GIZMO_METRICS.ring)
  const start = point(angle)
  expect(controller.gizmo.begin(start.x, start.y)).toBe(true)
  const end = point(angle + degrees)
  controller.gizmo.move(end.x, end.y)
  return controller.gizmo.end()
}

beforeEach(async () => {
  harness = createHarness()
  await harness.controller.loadDemo()
  harness.stage.setView({ centerX: 0, centerY: 150, scale: 1 })
})

describe('animate mode', () => {
  it('pauses on the current animation, clears layers and is exclusive with setup mode', () => {
    const controller = harness.controller
    controller.addLayer()
    controller.selectAnimation('walk')
    expect(controller.setAnimateMode(true)).toBe(true)
    expect(controller.setAnimateMode(true)).toBe(false)
    expect(state()).toMatchObject({ animateMode: true, playing: false, setupMode: false })
    expect(controller.instance!.state.getCurrent(0)?.animation?.name).toBe('walk')
    expect(controller.instance!.state.getCurrent(1)).toBeNull()
    controller.setSetupMode(true)
    expect(state()).toMatchObject({ animateMode: false, setupMode: true })
    controller.setAnimateMode(true)
    expect(state()).toMatchObject({ animateMode: true, setupMode: false })
    controller.selectAnimation('run')
    expect(state()).toMatchObject({ animateMode: true, animation: 'run' })
    controller.toggleAnimateMode()
    expect(state().animateMode).toBe(false)
    expect(controller.instance!.state.getCurrent(1)?.animation?.name).toBe('shoot')
  })

  it('refuses animate mode without an editable document', () => {
    harness.controller.editor.onAssetLoaded(null, '僅供檢視')
    expect(harness.controller.setAnimateMode(true)).toBe(false)
    expect(state().notices.at(-1)?.text).toBe('僅供檢視')
  })

  it('auto-keys a gizmo rotation at the current frame and undoes it', () => {
    enterAnimate(10)
    const before = harness.controller.instance!.skeleton.findBone('torso')!.rotation
    expect(rotateBy('torso', 30)).toBe(true)
    const rotate = keys('torso', 'rotate')
    const keyed = rotate.find((key) => Math.abs(key.time - 10 / 30) < 1e-4)
    expect(keyed).toBeDefined()
    expect(harness.controller.instance!.skeleton.findBone('torso')!.rotation).toBeCloseTo(before + 30, 0)
    expect(state().editor.entries.map((entry) => entry.label)).toEqual(['旋轉骨骼 torso'])
    expect(state().keySelection).toEqual([`torso::rotate::${rotate.indexOf(keyed!)}`])
    expect(state().animateMode).toBe(true)
    harness.controller.editor.undo()
    expect(keys('torso', 'rotate').some((key) => Math.abs(key.time - 10 / 30) < 1e-4)).toBe(false)
    expect(harness.controller.instance!.skeleton.findBone('torso')!.rotation).toBeCloseTo(before, 3)
  })

  it('keeps unkeyed changes pending when auto-key is off until K is pressed', () => {
    const controller = harness.controller
    enterAnimate(6, 'head')
    controller.animate.setAutoKey(false)
    const before = controller.instance!.skeleton.findBone('head')!.rotation
    expect(rotateBy('head', 20)).toBe(true)
    expect(state().pendingPose).toEqual(['head'])
    expect(state().editor.entries).toHaveLength(0)
    expect(controller.instance!.skeleton.findBone('head')!.rotation).toBeCloseTo(before + 20, 0)
    harness.runFrames(5)
    expect(controller.instance!.skeleton.findBone('head')!.rotation).toBeCloseTo(before + 20, 0)
    expect(controller.animate.keySelected()).toBe(true)
    expect(state().pendingPose).toEqual([])
    expect(state().editor.undoLabel).toBe('K 幀：head')
    for (const channel of ['translate', 'rotate', 'scale']) expect(keys('head', channel).some((key) => Math.abs(key.time - 6 / 30) < 1e-4)).toBe(true)
    expect(controller.instance!.skeleton.findBone('head')!.rotation).toBeCloseTo(before + 20, 0)
    controller.animate.applyPose('head', { x: 50 }, '移動骨骼 head')
    expect(state().pendingPose).toEqual(['head'])
    controller.seekFrame(8)
    expect(state().pendingPose).toEqual([])
    controller.select({ kind: 'skin', name: 'default' })
    expect(controller.animate.keySelected()).toBe(false)
  })

  it('keys panel values and every bone at once', () => {
    const controller = harness.controller
    enterAnimate(12, 'head')
    expect(controller.animate.applyPose('head', { scaleX: 1.4 }, '縮放骨骼 head')).toBe(true)
    const scale = keys('head', 'scale')
    expect(scale.find((key) => Math.abs(key.time - 0.4) < 1e-4)?.values[0]).toBeCloseTo(1.4, 3)
    expect(controller.instance!.skeleton.findBone('head')!.scaleX).toBeCloseTo(1.4, 3)
    expect(controller.animate.keyAll()).toBe(true)
    const count = controller.instance!.data.bones.length
    expect(state().keySelection).toHaveLength(count * 3)
    expect(state().editor.undoLabel).toBe('K 幀：全部骨骼')
  })

  it('deletes, moves, copies and pastes selected keys through the history', () => {
    const controller = harness.controller
    enterAnimate(0, 'torso')
    const original = keys('torso', 'rotate').map((key) => key.time)
    controller.animate.selectKeys(['torso::rotate::1'])
    controller.animate.selectKeys(['torso::rotate::2'], 'add')
    controller.animate.selectKeys(['torso::rotate::1'], 'toggle')
    expect(state().keySelection).toEqual(['torso::rotate::2'])
    controller.animate.selectKeys(['torso::rotate::1'], 'toggle')
    expect(controller.animate.moveSelected(2)).toBe(true)
    const moved = keys('torso', 'rotate').map((key) => key.time)
    expect(moved).not.toEqual(original)
    expect(state().keySelection).toHaveLength(2)
    expect(controller.animate.copySelected()).toBe(2)
    expect(state().keyClipboard).toBe(2)
    controller.seekFrame(30)
    expect(controller.animate.paste()).toBe(true)
    expect(keys('torso', 'rotate').length).toBeGreaterThan(moved.length)
    expect(controller.animate.deleteSelected()).toBe(true)
    expect(keys('torso', 'rotate').map((key) => key.time)).toEqual(moved)
    expect(state().keySelection).toEqual([])
    controller.editor.undo()
    controller.editor.undo()
    controller.editor.undo()
    expect(keys('torso', 'rotate').map((key) => key.time)).toEqual(original)
    controller.animate.selectKeys(['torso::rotate::99', 'nonsense'])
    controller.editor.redo()
    expect(state().keySelection).toEqual([])
    expect(controller.animate.deleteSelected()).toBe(false)
    expect(controller.animate.moveSelected(0)).toBe(false)
    controller.animate.clearSelection()
    expect(controller.animate.copySelected()).toBe(0)
  })

  it('discards pending poses when playback starts and rejects keying outside animate mode', () => {
    const controller = harness.controller
    enterAnimate(4, 'head')
    controller.animate.setAutoKey(false)
    controller.animate.applyPose('head', { rotation: 40 }, '旋轉骨骼 head')
    controller.setPlaying(true)
    expect(state().pendingPose).toEqual([])
    expect(controller.gizmo.layout()).toBeNull()
    controller.setAnimateMode(false)
    expect(controller.animate.keyAll()).toBe(false)
    expect(controller.animate.paste()).toBe(false)
    expect(state().notices.at(-1)?.text).toBe('請先進入動畫模式並選擇動畫')
    harness.runFrames(1)
    expect(useLiveStore.getState().gizmo).toBeNull()
  })
})
