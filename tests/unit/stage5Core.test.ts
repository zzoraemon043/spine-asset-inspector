import { describe, expect, it } from 'vitest'
import { TextureAtlas, MeshAttachment } from '@esotericsoftware/spine-core'
import { applyDrawOrderOffsets, drawOrderOffsets, moveInOrder } from '../../src/core/animation/drawOrder'
import { deformExtra, deformLength, denseDeform, offsetDeform, pickVertex, vertexCount, worldVertices, isMesh } from '../../src/core/animation/meshDeform'
import { channelKeys, setKeys, setCurves, moveKeyRefs } from '../../src/core/animation/keyCommands'
import { buildDopesheet } from '../../src/core/animation/dopesheet'
import { deformTarget, parseDeformTarget, serializeKey, createKey, curveChannels } from '../../src/core/animation/channels'
import { addAnimation, addSkin, addSkinAttachment, attachmentSources, removeSkinAttachment, renameSkin, setConstraintField } from '../../src/core/editor/structureCommands'
import { EditError } from '../../src/core/editor/commands'
import { applyOps } from '../../src/core/editor/patch'
import { readSkeletonData } from '../../src/core/editor/serialize'
import { SpineInstance } from '../../src/core/spine/SpineInstance'
import { createDemoFiles } from '../../src/core/demo/demoAsset'
import type { SkeletonDocument } from '../../src/core/editor/document'
import { FakeTexture, buildDemo } from '../support/fakeTexture'
import { ikFixtureJson } from '../support/ikFixture'

const apply = (document: SkeletonDocument, ops: Parameters<typeof applyOps>[1]) => applyOps(document, ops).document as SkeletonDocument

function runtime(document: SkeletonDocument) {
  const atlas = new TextureAtlas(createDemoFiles().atlasText)
  for (const page of atlas.pages) page.setTexture(new FakeTexture(page.width, page.height))
  return new SpineInstance(readSkeletonData(document, atlas))
}

describe('draw order offsets', () => {
  it('round trips any permutation through Spine offsets', () => {
    const setup = ['a', 'b', 'c', 'd', 'e', 'f']
    let seed = 7
    for (let round = 0; round < 50; round += 1) {
      const desired = [...setup]
      for (let index = desired.length - 1; index > 0; index -= 1) {
        seed = (seed * 9301 + 49297) % 233280
        const swap = Math.floor((seed / 233280) * (index + 1))
        ;[desired[index], desired[swap]] = [desired[swap], desired[index]]
      }
      expect(applyDrawOrderOffsets(setup, drawOrderOffsets(setup, desired))).toEqual(desired)
    }
    expect(drawOrderOffsets(setup, setup)).toEqual([])
    expect(drawOrderOffsets(['a', 'b', 'c', 'd'], ['c', 'b', 'd', 'a'])).toEqual([
      { slot: 'a', offset: 3 },
      { slot: 'c', offset: -2 },
    ])
    expect(drawOrderOffsets(['a', 'b', 'c', 'd', 'e'], ['a', 'e', 'b', 'c', 'd'])).toEqual([{ slot: 'e', offset: -3 }])
    expect(moveInOrder(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c'])
    expect(moveInOrder(['a', 'b', 'c'], 'c', 5)).toEqual(['a', 'b', 'c'])
    expect(moveInOrder(['a', 'b'], 'x', 1)).toEqual(['a', 'b'])
    expect(() => applyDrawOrderOffsets(['a', 'b'], [{ slot: 'a', offset: 5 }])).toThrow()
  })

  it('keys a draw order the runtime reproduces', () => {
    const build = buildDemo()
    const setup = build.data.slots.map((slot) => slot.name)
    const desired = moveInOrder(setup, 'arm-front-upper', -10)
    const extra = { offsets: drawOrderOffsets(setup, desired).map((entry) => ({ ...entry })) }
    const edit = setKeys(build.document!, 'walk', [{ target: 'draworder', channel: 'drawOrder', time: 0.2, values: [], extra }], 'K')
    const document = apply(build.document!, edit.command.ops) as any
    expect(document.animations.walk.drawOrder[0].time).toBe(0.2)
    const instance = runtime(document)
    instance.setTrack(0, 'walk', { loop: true })
    instance.seek(0.3)
    expect(instance.skeleton.drawOrder.map((slot) => slot.data.name)).toEqual(desired)
    const sheet = buildDopesheet({ document, animation: 'walk', fps: 30, bones: [], slots: [] })
    expect(sheet.rows.map((row) => row.id)).toEqual(['events', 'draworder'])
    expect(sheet.rows[1].keys[0].label).toBe(`${extra.offsets.length} 個插槽改變順序`)
  })
})

describe('mesh deform', () => {
  it('trims and expands deform offsets', () => {
    expect(deformExtra([0, 0, 1.23456, 0, 2, 0, 0])).toEqual({ offset: 2, vertices: [1.2346, 0, 2] })
    expect(deformExtra([1, 0])).toEqual({ vertices: [1] })
    expect(deformExtra([0, 0])).toEqual({})
    expect(denseDeform({ offset: 2, vertices: [1, 2] }, 5)).toEqual([0, 0, 1, 2, 0])
    expect(denseDeform({}, 2)).toEqual([0, 0])
    expect(pickVertex([0, 0, 10, 0], { x: 9, y: 1 }, 3)).toBe(1)
    expect(pickVertex([0, 0], { x: 9, y: 1 }, 3)).toBeNull()
    expect(deformTarget('default', 'cape', 'cape')).toBe('default|cape|cape')
    expect(parseDeformTarget('default|cape|cape')).toEqual({ skin: 'default', slot: 'cape', attachment: 'cape' })
    expect(parseDeformTarget('bad')).toBeNull()
    expect(curveChannels('deform')).toBe(1)
    expect(serializeKey('transform', createKey(0, [1, 1, 1, 1, 1, 1]))).toEqual({ mixRotate: 1, mixX: 1, mixY: 1, mixScaleX: 1, mixScaleY: 1, mixShearY: 1 })
  })

  it('moves only the selected weighted vertices by the world delta and keys it', () => {
    const build = buildDemo()
    const instance = runtime(build.document!)
    instance.setTrack(0, 'idle', { loop: true })
    instance.seek(0.2)
    const slot = instance.skeleton.findSlot('cape')!
    const attachment = slot.getAttachment()
    expect(isMesh(attachment)).toBe(true)
    const mesh = attachment as MeshAttachment
    expect(vertexCount(mesh)).toBe(6)
    expect(deformLength(mesh)).toBe(mesh.bones ? (mesh.vertices.length / 3) * 2 : mesh.vertices.length)
    const before = worldVertices(slot, mesh)
    const offsets = offsetDeform(instance.skeleton, slot, mesh, [], [1, 4], { x: 7, y: -3 })
    instance.setDeformOverride('cape', offsets)
    const after = worldVertices(slot, mesh)
    for (let vertex = 0; vertex < 6; vertex += 1) {
      const moved = vertex === 1 || vertex === 4
      expect(after[vertex * 2] - before[vertex * 2]).toBeCloseTo(moved ? 7 : 0, 4)
      expect(after[vertex * 2 + 1] - before[vertex * 2 + 1]).toBeCloseTo(moved ? -3 : 0, 4)
    }
    instance.setDeformOverride('cape', null)
    const target = deformTarget('default', 'cape', 'cape')
    const edit = setKeys(build.document!, 'idle', [{ target, channel: 'deform', time: 0.2, values: [], extra: deformExtra(offsets) }, { target, channel: 'deform', time: 0.6, values: [], extra: {} }], 'K')
    const document = apply(build.document!, edit.command.ops) as any
    expect(Object.keys(document.animations.idle.attachments.default.cape.cape)).toEqual(['deform'])
    const replay = runtime(document)
    replay.setTrack(0, 'idle', { loop: true })
    replay.seek(0.2)
    const replayed = worldVertices(replay.skeleton.findSlot('cape')!, replay.skeleton.findSlot('cape')!.getAttachment() as MeshAttachment)
    expect(replayed[2]).toBeCloseTo(after[2], 3)
    const curved = apply(document, setCurves(document, 'idle', [{ target, channel: 'deform', index: 0 }], { kind: 'bezier', handles: [0.5, 0, 0.5, 1] }, '曲線').command.ops)
    expect(channelKeys(curved, 'idle', target, 'deform')[0].curve).toEqual([0.4, 0, 0.4, 1])
    const moved = apply(curved, moveKeyRefs(curved, 'idle', [{ target, channel: 'deform', index: 1 }], 0.2).command.ops)
    expect(channelKeys(moved, 'idle', target, 'deform')[0].curve).toEqual([0.5, 0, 0.5, 1])
    const sheet = buildDopesheet({ document, animation: 'idle', fps: 30, bones: [], slots: ['cape'] })
    expect(sheet.rows.map((row) => row.id)).toEqual(['slot:cape', 'slot:cape:deform:default|cape'])
    expect(() => setKeys(build.document!, 'idle', [{ target: 'default|cape|missing', channel: 'deform', time: 0, values: [] }], 'K')).toThrow(EditError)
    expect(() => setKeys(build.document!, 'idle', [{ target: 'bad', channel: 'deform', time: 0, values: [] }], 'K')).toThrow(EditError)
  })
})

describe('constraint keys and structure commands', () => {
  it('keys IK and transform constraints that drive the runtime', () => {
    const document = ikFixtureJson() as SkeletonDocument
    const edit = setKeys(
      document,
      'idle',
      [
        { target: 'arm-ik', channel: 'ik', time: 0, values: [1, 0] },
        { target: 'arm-ik', channel: 'ik', time: 0.5, values: [0, 0], extra: { bendPositive: false } },
        { target: 'cape-follow', channel: 'transform', time: 0, values: [0.25, 1, 0.5, 1, 1, 1] },
      ],
      'K',
    )
    const next = apply(document, edit.command.ops) as any
    expect(next.animations.idle.ik['arm-ik']).toEqual([{}, { time: 0.5, mix: 0, bendPositive: false }])
    expect(next.animations.idle.transform['cape-follow']).toEqual([{ mixRotate: 0.25, mixX: 1, mixY: 0.5, mixScaleX: 1, mixScaleY: 1, mixShearY: 1 }])
    const instance = runtime(next)
    instance.setTrack(0, 'idle', { loop: true })
    instance.seek(0.25)
    expect(instance.skeleton.findIkConstraint('arm-ik')!.mix).toBeCloseTo(0.5, 3)
    expect(instance.skeleton.findTransformConstraint('cape-follow')!.mixY).toBeCloseTo(0.5, 3)
    const sheet = buildDopesheet({ document: next, animation: 'idle', fps: 30, bones: [], slots: [], ikConstraints: ['arm-ik'], transformConstraints: ['cape-follow'] })
    expect(sheet.rows.filter((row) => row.kind === 'constraint').map((row) => row.label)).toEqual(['IK arm-ik', '變換 cape-follow'])
    expect(() => setKeys(document, 'idle', [{ target: 'ghost', channel: 'ik', time: 0, values: [1, 0] }], 'K')).toThrow('找不到IK 限制器：ghost')
  })

  it('adds animations and skins, renames skins and binds attachments', () => {
    const document = buildDemo().document!
    const added = apply(document, addAnimation(document, ' blink ').ops) as any
    expect(added.animations.blink).toEqual({})
    expect(() => addAnimation(document, 'walk')).toThrow(EditError)
    expect(apply({ bones: [] }, addAnimation({ bones: [] }, 'a').ops)).toEqual({ bones: [], animations: { a: {} } })
    const skinned = apply(document, addSkin(document, 'armor/gold').ops) as any
    expect(skinned.skins.at(-1)).toEqual({ name: 'armor/gold', attachments: {} })
    expect(apply({}, addSkin({}, 'x').ops)).toEqual({ skins: [{ name: 'x', attachments: {} }] })
    const sources = attachmentSources(skinned)
    const helmet = sources.find((item) => item.skin === 'helmet/knight')!
    const bound = apply(skinned, addSkinAttachment(skinned, 'armor/gold', helmet.slot, helmet.name, 'helmet/knight').ops) as any
    expect(bound.skins.at(-1).attachments[helmet.slot][helmet.name]).toEqual(helmet.data)
    expect(() => addSkinAttachment(bound, 'armor/gold', helmet.slot, helmet.name, 'helmet/knight')).toThrow(EditError)
    expect(() => addSkinAttachment(bound, 'armor/gold', helmet.slot, 'missing', 'helmet/knight')).toThrow(EditError)
    expect(() => addSkinAttachment(bound, 'nope', helmet.slot, helmet.name, 'helmet/knight')).toThrow(EditError)
    expect(() => addSkinAttachment(bound, 'armor/gold', 'ghost', helmet.name, 'helmet/knight')).toThrow(EditError)
    const removed = apply(bound, removeSkinAttachment(bound, 'armor/gold', helmet.slot, helmet.name).ops) as any
    expect(removed.skins.at(-1).attachments).toEqual({})
    expect(() => removeSkinAttachment(removed, 'armor/gold', helmet.slot, helmet.name)).toThrow(EditError)
    const withDeform = { ...bound, animations: { ...bound.animations, idle: { ...bound.animations.idle, attachments: { 'armor/gold': {} } } } }
    const renamed = apply(withDeform, renameSkin(withDeform, 'armor/gold', 'armor/platinum').ops) as any
    expect(renamed.skins.at(-1).name).toBe('armor/platinum')
    expect(Object.keys(renamed.animations.idle.attachments)).toEqual(['armor/platinum'])
    expect(() => renameSkin(document, 'default', 'x')).toThrow('default 皮膚不可重新命名')
    expect(() => renameSkin(document, 'armor/red', 'default')).toThrow(EditError)
    expect(() => renameSkin(document, 'ghost', 'x')).toThrow(EditError)
    expect(renameSkin(document, 'armor/red', 'armor/red').ops).toEqual([])
  })

  it('edits constraint setup values with validation', () => {
    const document = ikFixtureJson() as SkeletonDocument
    expect((apply(document, setConstraintField(document, 'ik', 'arm-ik', 'mix', 0.4).ops) as any).ik[0].mix).toBe(0.4)
    expect((apply(document, setConstraintField(document, 'ik', 'arm-ik', 'bendPositive', false).ops) as any).ik[0].bendPositive).toBe(false)
    expect((apply(document, setConstraintField(document, 'transform', 'cape-follow', 'mixY', 0.2).ops) as any).transform[0].mixY).toBe(0.2)
    expect(setConstraintField(document, 'ik', 'arm-ik', 'mix', 1).ops).toEqual([])
    expect(() => setConstraintField(document, 'ik', 'arm-ik', 'mix', 2)).toThrow(EditError)
    expect(() => setConstraintField(document, 'ik', 'arm-ik', 'softness', -1)).toThrow(EditError)
    expect(() => setConstraintField(document, 'ik', 'arm-ik', 'bendPositive', 1)).toThrow(EditError)
    expect(() => setConstraintField(document, 'ik', 'arm-ik', 'mixX', 1)).toThrow(EditError)
    expect(() => setConstraintField(document, 'ik', 'ghost', 'mix', 1)).toThrow(EditError)
    expect(() => setConstraintField(document, 'ik', 'arm-ik', 'mix', Number.NaN)).toThrow(EditError)
    expect(runtime(document).data.ikConstraints).toHaveLength(1)
  })
})
