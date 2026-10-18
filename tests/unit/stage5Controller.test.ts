import { beforeEach, describe, expect, it } from 'vitest'
import type { MeshAttachment } from '@esotericsoftware/spine-core'
import { useInspectorStore } from '../../src/store/inspectorStore'
import { useLiveStore } from '../../src/store/liveStore'
import { worldToScreen } from '../../src/core/render/camera'
import { channelKeys } from '../../src/core/animation/keyCommands'
import { worldVertices } from '../../src/core/animation/meshDeform'
import { createHarness, type FakeHarness } from '../support/fakeEnvironment'
import { ikFixtureSource } from '../support/ikFixture'

let harness: FakeHarness
const state = () => useInspectorStore.getState()
const keys = (target: string, channel: string, animation = 'walk') => channelKeys(state().editor.document!, animation, target, channel)

function screenOf(x: number, y: number) {
  return worldToScreen(harness.stage.getView(), harness.stage.viewport, x, y)
}

beforeEach(async () => {
  harness = createHarness()
  await harness.controller.loadDemo()
  harness.controller.applySource(ikFixtureSource())
  harness.stage.setView({ centerX: 0, centerY: 150, scale: 1 })
})

describe('constraints', () => {
  it('lists constraints, edits setup values and keys mixes', () => {
    const controller = harness.controller
    expect(state().asset!.constraints).toEqual([
      { name: 'arm-ik', type: 'ik', bones: ['arm-front-upper', 'arm-front-lower'], target: 'aim' },
      { name: 'cape-follow', type: 'transform', bones: ['arm-back-upper'], target: 'head' },
    ])
    expect(controller.editor.setConstraintField('ik', 'arm-ik', 'mix', 0.3)).toBe(true)
    expect(controller.instance!.skeleton.findIkConstraint('arm-ik')!.mix).toBeCloseTo(0.3)
    controller.selectAnimation('walk')
    controller.setAnimateMode(true)
    controller.seekFrame(6)
    expect(controller.animate.keyConstraint('ik', 'arm-ik', { mix: 0.8, bendPositive: false })).toBe(true)
    expect(keys('arm-ik', 'ik')[0]).toMatchObject({ values: [0.8, 0], extra: { bendPositive: false } })
    expect(controller.animate.constraintValues('ik', 'arm-ik')).toMatchObject({ bendPositive: false })
    expect(controller.animate.constraintValues('ik', 'arm-ik')!.mix).toBeCloseTo(0.8, 5)
    expect(controller.animate.keyConstraint('transform', 'cape-follow', { mixRotate: 2 })).toBe(true)
    expect(keys('cape-follow', 'transform')[0].values[0]).toBe(1)
    expect(controller.animate.keyConstraint('ik', 'ghost')).toBe(false)
    expect(controller.animate.constraintValues('transform', 'ghost')).toBeNull()
  })

  it('solves the IK chain live while the target bone is dragged', () => {
    const controller = harness.controller
    controller.setSetupMode(true)
    controller.select({ kind: 'bone', name: 'aim' })
    harness.runFrames(1)
    const upper = controller.instance!.skeleton.findBone('arm-front-upper')!
    const before = upper.getWorldRotationX()
    const aim = controller.instance!.skeleton.findBone('aim')!
    const start = screenOf(aim.worldX, aim.worldY)
    expect(controller.gizmo.begin(start.x, start.y)).toBe(true)
    controller.gizmo.move(start.x - 120, start.y + 140)
    const during = controller.instance!.skeleton.findBone('arm-front-upper')!.getWorldRotationX()
    expect(Math.abs(during - before)).toBeGreaterThan(10)
    controller.gizmo.end()
    expect(Math.abs(controller.instance!.skeleton.findBone('arm-front-upper')!.getWorldRotationX() - during)).toBeLessThan(0.5)
    expect(state().editor.undoLabel).toBe('移動骨骼 aim')
  })
})

describe('draw order, deform, animations and skins', () => {
  it('moves a slot in the draw order at the current frame and resets it', () => {
    const controller = harness.controller
    controller.selectAnimation('walk')
    controller.setAnimateMode(true)
    controller.seekFrame(10)
    const setup = controller.animate.setupDrawOrder()
    const index = setup.indexOf('arm-front-upper')
    expect(controller.animate.moveDrawOrder('arm-front-upper', -3)).toBe(true)
    expect(controller.animate.currentDrawOrder().indexOf('arm-front-upper')).toBe(index - 3)
    expect(keys('draworder', 'drawOrder')).toHaveLength(1)
    expect(state().editor.undoLabel).toBe('繪製順序：arm-front-upper 往後')
    expect(controller.animate.moveDrawOrder(setup[setup.length - 1], 1)).toBe(false)
    controller.seekFrame(20)
    expect(controller.animate.currentDrawOrder()).toEqual(controller.animate.currentDrawOrder())
    expect(controller.animate.resetDrawOrder()).toBe(true)
    expect(keys('draworder', 'drawOrder').map((key) => key.extra)).toEqual([{ offsets: [{ slot: 'arm-front-upper', offset: -3 }] }, {}])
    expect(controller.animate.currentDrawOrder()).toEqual(setup)
  })

  it('selects mesh vertices on the canvas, drags them and keys the deform', () => {
    const controller = harness.controller
    controller.selectAnimation('idle')
    controller.setAnimateMode(true)
    controller.seekFrame(6)
    expect(controller.mesh.target()).toBeNull()
    controller.select({ kind: 'attachment', name: 'cape', slot: 'cape' })
    harness.runFrames(1)
    const target = controller.mesh.target()!
    expect(target.key).toBe('default|cape|cape')
    const screen = useLiveStore.getState().meshScreen!
    expect(screen).toHaveLength(6)
    expect(harness.stage.frames.at(-1)?.mesh?.vertices).toHaveLength(12)
    const before = worldVertices(target.slot, target.attachment)
    expect(controller.mesh.begin(screen[2][0], screen[2][1])).toBe(true)
    expect(state().meshSelection).toEqual([2])
    controller.mesh.move(screen[2][0] + 20, screen[2][1] - 10)
    const preview = worldVertices(target.slot, target.attachment)
    expect(preview[4] - before[4]).toBeCloseTo(20, 3)
    expect(preview[5] - before[5]).toBeCloseTo(10, 3)
    expect(state().editor.entries).toHaveLength(0)
    expect(controller.mesh.end()).toBe(true)
    expect(state().editor.undoLabel).toBe('變形 cape（1 個頂點）')
    expect(keys('default|cape|cape', 'deform', 'idle')).toHaveLength(1)
    const slot = controller.instance!.skeleton.findSlot('cape')!
    const after = worldVertices(slot, slot.getAttachment() as MeshAttachment)
    expect(after[4] - before[4]).toBeCloseTo(20, 2)
    controller.mesh.select([0, 1], 'toggle')
    expect(state().meshSelection).toEqual([0, 1, 2])
    controller.mesh.selectAll()
    expect(state().meshSelection).toHaveLength(6)
    controller.mesh.clearSelection()
    expect(state().meshSelection).toEqual([])
    expect(controller.mesh.begin(5, 5)).toBe(false)
    expect(controller.mesh.resetDeform()).toBe(true)
    expect(keys('default|cape|cape', 'deform', 'idle')[0].extra).toEqual({})
    expect(controller.mesh.cancel()).toBe(false)
    const again = useLiveStore.getState().meshScreen!
    controller.mesh.begin(again[0][0], again[0][1])
    controller.mesh.move(again[0][0] + 5, again[0][1])
    expect(controller.mesh.cancel()).toBe(true)
    expect(controller.mesh.end()).toBe(false)
    controller.setPlaying(true)
    expect(controller.mesh.target()).toBeNull()
    expect(controller.mesh.resetDeform()).toBe(false)
  })

  it('creates blank animations and skins and binds attachments', () => {
    const controller = harness.controller
    expect(controller.editor.addAnimation('blink')).toBe(true)
    expect(state().asset!.animations.map((item) => item.name)).toContain('blink')
    controller.selectAnimation('blink')
    expect(state().animation).toBe('blink')
    expect(controller.setAnimateMode(true)).toBe(true)
    controller.select({ kind: 'bone', name: 'head' })
    expect(controller.animate.keySelected()).toBe(true)
    expect(keys('head', 'rotate', 'blink')).toHaveLength(1)
    expect(controller.editor.addSkin('armor/gold')).toBe(true)
    expect(state().asset!.skins).toContain('armor/gold')
    expect(controller.editor.addSkinAttachment('armor/gold', 'helmet', 'helmet', 'helmet/knight')).toBe(true)
    controller.setSkins(['armor/gold'])
    controller.select({ kind: 'skin', name: 'armor/gold' })
    expect(controller.editor.renameSkin('armor/gold', 'armor/platinum')).toBe(true)
    expect(state().selection).toEqual({ kind: 'skin', name: 'armor/platinum' })
    expect(state().activeSkins).toEqual(['armor/platinum'])
    expect(controller.editor.removeSkinAttachment('armor/platinum', 'helmet', 'helmet')).toBe(true)
    expect(controller.editor.addAnimation('walk')).toBe(false)
  })
})
