import { beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { deleteObject } from '../../src/core/editor/deleteCommands'
import { applyOps } from '../../src/core/editor/patch'
import { applyDrawOrderOffsets } from '../../src/core/animation/drawOrder'
import type { SkeletonDocument } from '../../src/core/editor/document'
import { useInspectorStore } from '../../src/store/inspectorStore'
import { ControllerProvider } from '../../src/controller/ControllerContext'
import type { InspectorController } from '../../src/controller/InspectorController'
import { PropertiesPanel } from '../../src/components/properties/PropertiesPanel'
import { createHarness, type FakeHarness } from '../support/fakeEnvironment'
import { ikFixtureJson, ikFixtureSource } from '../support/ikFixture'

const fixture = (): any => ikFixtureJson()
const run = (document: SkeletonDocument, target: Parameters<typeof deleteObject>[1]) => {
  const command = deleteObject(document, target)
  return { command, result: applyOps(document, command.ops).document as Record<string, any> }
}
const names = (items: Array<{ name: string }>) => items.map((item) => item.name)

function weightedBoneNames(document: Record<string, any>): string[] {
  const mesh = document.skins.find((skin: any) => skin.name === 'default').attachments.cape.cape
  const bones: string[] = []
  const vertices = mesh.vertices as number[]
  for (let index = 0; index < vertices.length; ) {
    const count = vertices[index++]
    for (let item = 0; item < count; item++) {
      bones.push(document.bones[vertices[index]].name)
      index += 4
    }
  }
  return bones
}

describe('delete commands', () => {
  it('deletes a bone with its children, slots, constraints and timelines and remaps mesh weights', () => {
    const document = fixture()
    const before = weightedBoneNames(document)
    const { command, result } = run(document, { kind: 'bone', name: 'arm-front-upper' })
    expect(command.label).toBe('刪除骨骼 arm-front-upper（含 3 個子骨骼、4 個插槽）')
    expect(names(result.bones)).not.toContain('weapon')
    expect(names(result.bones)).toHaveLength(15)
    expect(names(result.slots)).toEqual(expect.not.arrayContaining(['arm-front-upper', 'arm-front-lower', 'weapon', 'hand']))
    expect(result.ik).toEqual([])
    expect(result.skins.find((skin: any) => skin.name === 'weapon/sword').attachments).toEqual({})
    expect(result.animations.shoot.bones).toBeUndefined()
    expect(Object.keys(result.animations.attack.bones)).toEqual(['hip', 'torso'])
    expect(weightedBoneNames(result)).toEqual(before)
    expect(document.bones).toHaveLength(19)
  })

  it('refuses to delete the root bone or a bone that a remaining mesh is weighted to', () => {
    expect(() => deleteObject(fixture(), { kind: 'bone', name: 'root' })).toThrow('根骨骼不可刪除')
    expect(() => deleteObject(fixture(), { kind: 'bone', name: 'cape-tip' })).toThrow('部件 cape / cape 的網格權重綁定到要刪除的骨骼')
    expect(() => deleteObject(fixture(), { kind: 'bone', name: 'nope' })).toThrow('找不到骨骼：nope')
    const { result } = run(fixture(), { kind: 'bone', name: 'cape' })
    expect(names(result.slots)).not.toContain('cape')
    expect(result.skins[0].attachments.cape).toBeUndefined()
  })

  it('deletes slots, rewrites draw order keys and clears their timelines', () => {
    const document = fixture()
    const setup = names(document.slots as any)
    document.animations.idle.drawOrder = [{ time: 0, offsets: [{ slot: 'helmet', offset: -4 }, { slot: 'hand', offset: -2 }] }, { time: 1 }]
    document.animations.idle.drawOrder[0].offsets.sort((a: any, b: any) => setup.indexOf(a.slot) - setup.indexOf(b.slot))
    const desired = applyDrawOrderOffsets(setup, document.animations.idle.drawOrder[0].offsets).filter((slot) => slot !== 'helmet')
    const { command, result } = run(document, { kind: 'slot', name: 'helmet' })
    expect(command.label).toBe('刪除插槽 helmet')
    expect(names(result.slots)).not.toContain('helmet')
    expect(result.skins.find((skin: any) => skin.name === 'helmet/cap').attachments).toEqual({})
    expect(result.animations.death.slots).toBeUndefined()
    const after = names(result.slots)
    expect(applyDrawOrderOffsets(after, result.animations.idle.drawOrder[0].offsets)).toEqual(desired)
    expect(result.animations.idle.drawOrder[1]).toEqual({ time: 1 })
    const only = fixture()
    only.animations.idle.drawOrder = [{ time: 0, offsets: [{ slot: 'helmet', offset: -2 }] }]
    expect(run(only, { kind: 'slot', name: 'helmet' }).result.animations.idle.drawOrder).toEqual([{ time: 0 }])
    expect(() => deleteObject(fixture(), { kind: 'slot', name: 'nope' })).toThrow('找不到插槽：nope')
  })

  it('deletes attachments from every skin and clears the setup attachment and deform keys', () => {
    const document = fixture()
    document.animations.walk.attachments = { default: { cape: { cape: { deform: [{ time: 0 }] } } } }
    const { command, result } = run(document, { kind: 'attachment', slot: 'armor', name: 'armor' })
    expect(command.label).toBe('刪除部件 armor / armor')
    expect(result.skins.find((skin: any) => skin.name === 'armor/red').attachments).toEqual({})
    expect(result.skins.find((skin: any) => skin.name === 'armor/blue').attachments).toEqual({})
    expect(result.slots.find((slot: any) => slot.name === 'armor').attachment).toBeUndefined()
    const mesh = run(document, { kind: 'attachment', slot: 'cape', name: 'cape' }).result
    expect(mesh.animations.walk.attachments).toBeUndefined()
    expect(mesh.slots.find((slot: any) => slot.name === 'cape').attachment).toBeUndefined()
    const linked = fixture()
    linked.skins.find((skin: any) => skin.name === 'armor/red').attachments.cape = { capelink: { type: 'linkedmesh', parent: 'cape', skin: 'default', path: 'cape' } }
    const removed = run(linked, { kind: 'attachment', slot: 'cape', name: 'cape' }).result
    expect(removed.skins.find((skin: any) => skin.name === 'armor/red').attachments.cape).toBeUndefined()
    const kept = fixture()
    kept.slots.find((slot: any) => slot.name === 'hitbox').attachment = 'hitbox'
    expect(() => deleteObject(kept, { kind: 'attachment', slot: 'hitbox', name: 'nope' })).toThrow('找不到部件：hitbox / nope')
  })

  it('deletes constraints, skins, events and animations', () => {
    const document = fixture()
    document.skins.find((skin: any) => skin.name === 'armor/red').ik = ['arm-ik']
    document.animations.walk.ik = { 'arm-ik': [{ time: 0, mix: 0.5 }] }
    const ik = run(document, { kind: 'constraint', group: 'ik', name: 'arm-ik' }).result
    expect(ik.ik).toEqual([])
    expect(ik.skins.find((skin: any) => skin.name === 'armor/red').ik).toEqual([])
    expect(ik.animations.walk.ik).toBeUndefined()
    expect(run(fixture(), { kind: 'constraint', group: 'transform', name: 'cape-follow' }).command.label).toBe('刪除變換限制器 cape-follow')
    expect(() => deleteObject(fixture(), { kind: 'constraint', group: 'path', name: 'x' })).toThrow('找不到路徑限制器：x')
    const skin = fixture()
    skin.animations.walk.attachments = { 'armor/red': {}, default: { cape: { cape: { deform: [{ time: 0 }] } } } }
    const noSkin = run(skin, { kind: 'skin', name: 'armor/red' }).result
    expect(names(noSkin.skins)).not.toContain('armor/red')
    expect(Object.keys(noSkin.animations.walk.attachments)).toEqual(['default'])
    expect(() => deleteObject(fixture(), { kind: 'skin', name: 'default' })).toThrow('default 皮膚不可刪除')
    expect(() => deleteObject(fixture(), { kind: 'skin', name: 'nope' })).toThrow('找不到皮膚：nope')
    const linked = fixture()
    linked.skins.find((item: any) => item.name === 'armor/blue').attachments.cape = { link: { type: 'linkedmesh', parent: 'cape', skin: 'armor/red' } }
    expect(() => deleteObject(linked, { kind: 'skin', name: 'armor/red' })).toThrow('連結網格 cape / link 引用此皮膚')
    const events = run(fixture(), { kind: 'event', name: 'step' }).result
    expect(Object.keys(events.events)).toEqual(['hit', 'fx'])
    expect(events.animations.walk.events).toBeUndefined()
    expect(events.animations.attack.events).toHaveLength(2)
    expect(() => deleteObject(fixture(), { kind: 'event', name: 'nope' })).toThrow('找不到事件：nope')
    expect(Object.keys(run(fixture(), { kind: 'animation', name: 'walk' }).result.animations)).not.toContain('walk')
    expect(() => deleteObject(fixture(), { kind: 'animation', name: 'nope' })).toThrow('找不到動畫：nope')
  })

  it('deletes path and physics constraints that use removed slots and bones', () => {
    const document = fixture()
    document.path = [{ name: 'trail', bones: ['cape'], target: 'helmet' }]
    document.physics = [{ name: 'sway', bone: 'cape-tip' }]
    document.skins[0].attachments.helmet = { clip: { type: 'clipping', end: 'helmet', vertexCount: 3, vertices: [0, 0, 1, 0, 0, 1] } }
    const slot = run(document, { kind: 'slot', name: 'helmet' }).result
    expect(slot.path).toEqual([])
    const clipDoc = fixture()
    clipDoc.skins[0].attachments.hitbox.clip = { type: 'clipping', end: 'helmet', vertexCount: 3, vertices: [0, 0, 1, 0, 0, 1] }
    expect(run(clipDoc, { kind: 'slot', name: 'helmet' }).result.skins[0].attachments.hitbox.clip.end).toBeUndefined()
    const bone = run(document, { kind: 'bone', name: 'cape' }).result
    expect(bone.physics).toEqual([])
  })
})

describe('deleting objects from the editor', () => {
  let harness: FakeHarness
  const state = () => useInspectorStore.getState()

  beforeEach(async () => {
    cleanup()
    harness = createHarness()
    await harness.controller.loadDemo()
    harness.controller.applySource(ikFixtureSource())
  })

  it('deletes the selected bone with Delete in the panel and restores it with undo', () => {
    const controller = harness.controller
    render(
      <ControllerProvider controller={controller as unknown as InspectorController<ImageBitmap>}>
        <PropertiesPanel />
      </ControllerProvider>,
    )
    expect(screen.queryByTestId('selection-delete')).toBeNull()
    act(() => controller.select({ kind: 'bone', name: 'arm-front-upper' }))
    expect(controller.deletableSelection()).toEqual({ kind: 'bone', name: 'arm-front-upper' })
    act(() => {
      fireEvent.click(screen.getByTestId('selection-delete'))
    })
    expect(state().selection).toBeNull()
    expect(state().asset!.bones.map((bone) => bone.name)).not.toContain('weapon')
    expect(controller.instance!.skeleton.findBone('hand')).toBeNull()
    expect(state().editor.undoLabel).toBe('刪除骨骼 arm-front-upper（含 3 個子骨骼、4 個插槽）')
    act(() => {
      controller.editor.undo()
    })
    expect(controller.instance!.skeleton.findBone('hand')).not.toBeNull()
    act(() => controller.select({ kind: 'bone', name: 'root' }))
    act(() => {
      fireEvent.click(screen.getByTestId('selection-delete'))
    })
    expect(state().notices.at(-1)?.text).toBe('根骨骼不可刪除')
    expect(state().selection).toEqual({ kind: 'bone', name: 'root' })
  })

  it('maps every selection kind and handles the keyboard', () => {
    const controller = harness.controller
    const cases = [
      [{ kind: 'slot', name: 'helmet' }, { kind: 'slot', name: 'helmet' }],
      [{ kind: 'attachment', name: 'armor', slot: 'armor' }, { kind: 'attachment', slot: 'armor', name: 'armor' }],
      [{ kind: 'attachment', name: 'armor' }, null],
      [{ kind: 'constraint', name: 'arm-ik', group: 'ik' }, { kind: 'constraint', group: 'ik', name: 'arm-ik' }],
      [{ kind: 'constraint', name: 'arm-ik' }, null],
      [{ kind: 'skin', name: 'armor/red' }, { kind: 'skin', name: 'armor/red' }],
      [{ kind: 'event', name: 'fx' }, { kind: 'event', name: 'fx' }],
      [{ kind: 'animation', name: 'hit' }, { kind: 'animation', name: 'hit' }],
      [{ kind: 'skeleton', name: 'x' }, null],
    ] as const
    for (const [selection, target] of cases) {
      useInspectorStore.setState({ selection: selection as never })
      expect(controller.deletableSelection()).toEqual(target)
    }
    useInspectorStore.setState({ selection: null })
    expect(controller.deleteSelection()).toBe(false)
    controller.select({ kind: 'event', name: 'fx' })
    expect(controller.deleteSelection()).toBe(true)
    expect(state().asset!.events.map((event) => event.name)).toEqual(['step', 'hit'])
    controller.select({ kind: 'skin', name: 'armor/red' })
    useInspectorStore.setState({ editor: { ...state().editor, enabled: false } })
    expect(controller.deletableSelection()).toBeNull()
  })
})
