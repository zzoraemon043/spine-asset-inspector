import { describe, expect, it } from 'vitest'
import { TextureAtlas } from '@esotericsoftware/spine-core'
import { channelSpec, createKey, isBoneChannel, parseKeys, roundTime, roundValue, serializeKey, serializeKeys, type Key } from '../../src/core/animation/channels'
import { moveKeys, rebuildChannel, removeKeys, segmentOf, upsertKeys } from '../../src/core/animation/keyOps'
import { copyKeyRefs, deleteKeys, keyId, moveKeyRefs, parseKeyId, pasteKeys, setKeys, channelKeys } from '../../src/core/animation/keyCommands'
import { buildDopesheet, frameOf, keysInFrameRange } from '../../src/core/animation/dopesheet'
import { channelForField, channelValues } from '../../src/core/animation/poseKeys'
import { applyOps } from '../../src/core/editor/patch'
import { EditError } from '../../src/core/editor/commands'
import { readSkeletonData } from '../../src/core/editor/serialize'
import { SpineInstance } from '../../src/core/spine/SpineInstance'
import { createDemoFiles } from '../../src/core/demo/demoAsset'
import { FakeTexture, buildDemo } from '../support/fakeTexture'
import type { SkeletonDocument } from '../../src/core/editor/document'
import type { JsonValue } from '../../src/core/editor/json'

function doc(): SkeletonDocument {
  return {
    skeleton: { spine: '4.2.0' },
    bones: [{ name: 'root' }, { name: 'arm', parent: 'root' }, { name: 'leg', parent: 'root' }],
    animations: {
      wave: {
        slots: {},
        bones: {
          arm: {
            rotate: [{ value: 10, curve: [0.1, 12, 0.3, 18] }, { time: 0.5, value: 20 }, { time: 1, value: 0 }],
            translate: [{ time: 0.2, x: 5 }],
          },
        },
      },
      empty: {},
    },
  }
}

const apply = (document: SkeletonDocument, ops: Parameters<typeof applyOps>[1]) => applyOps(document, ops).document as SkeletonDocument

describe('channel parsing and serialization', () => {
  it('parses defaults and keeps unchanged keys byte-identical', () => {
    const raw: JsonValue[] = [{ value: 10, curve: [0.1, 12, 0.3, 18] }, { time: 0.5, value: 20, custom: 1 }, { time: 1 }]
    const keys = parseKeys('rotate', raw)
    expect(keys.map((key) => [key.time, key.values])).toEqual([[0, [10]], [0.5, [20]], [1, [0]]])
    expect(keys[1].extra).toEqual({ custom: 1 })
    expect(serializeKeys('rotate', keys)).toEqual(raw)
    expect(serializeKey('scale', createKey(0.3333333333, [1, 2.123456]))).toEqual({ time: 0.333333, y: 2.1235 })
    expect(serializeKey('rotate', { ...createKey(0, [0]), curve: 'stepped' })).toEqual({ curve: 'stepped' })
    expect(parseKeys('rotate', undefined)).toEqual([])
    expect(parseKeys('scale', [{ curve: 'bogus' }])[0]).toMatchObject({ values: [1, 1], curve: 'linear' })
    expect(channelSpec('mystery')).toMatchObject({ label: 'mystery', fields: [] })
    expect(isBoneChannel('rotate')).toBe(true)
    expect(isBoneChannel('attachment')).toBe(false)
    expect(Object.is(roundTime(-0.0000001), 0)).toBe(true)
    expect(Object.is(roundValue(-0.00001), 0)).toBe(true)
  })
})

describe('key operations', () => {
  const base = (): Key[] => parseKeys('rotate', [{ value: 0, curve: [0.25, 0, 0.75, 10] }, { time: 1, value: 10 }, { time: 2, value: 0 }])

  it('inserts, replaces and remaps the bezier of the previous segment', () => {
    const keys = base()
    const inserted = upsertKeys(keys, [{ time: 0.5, values: [4] }])
    expect(inserted.keys.map((key) => key.time)).toEqual([0, 0.5, 1, 2])
    expect(inserted.positions).toEqual([1])
    expect(inserted.keys[0].curve).toEqual([0.125, 0, 0.375, 4])
    expect(inserted.keys[0].raw).toBeNull()
    expect(inserted.keys[2].raw).not.toBeNull()
    const replaced = upsertKeys(keys, [{ time: 1, values: [20] }])
    expect(replaced.keys.map((key) => key.values[0])).toEqual([0, 20, 0])
    expect(replaced.keys[0].curve).toEqual([0.25, 0, 0.75, 20])
    expect(replaced.positions).toEqual([1])
    const kept = upsertKeys(keys, [{ time: 0, values: [0] }])
    expect(kept.keys[0].curve).toEqual([0.25, 0, 0.75, 10])
  })

  it('moves keys with collision replacement and keeps relative curves', () => {
    const keys = base()
    const moved = moveKeys(keys, [1], 0.5)
    expect(moved.keys.map((key) => key.time)).toEqual([0, 1.5, 2])
    expect(moved.positions).toEqual([1])
    expect(moved.keys[0].curve).toEqual([0.375, 0, 1.125, 10])
    const collided = moveKeys(keys, [1], 1)
    expect(collided.keys.map((key) => [key.time, key.values[0]])).toEqual([[0, 0], [2, 10]])
    expect(collided.positions).toEqual([1])
    const reordered = moveKeys(keys, [0], 1.5)
    expect(reordered.keys.map((key) => key.time)).toEqual([1, 1.5, 2])
    expect(reordered.positions).toEqual([1])
    expect(reordered.keys[1].curve).toEqual([1.625, 0, 1.875, 0])
  })

  it('removes keys and remaps around flat segments', () => {
    expect(removeKeys(base(), [1]).map((key) => key.time)).toEqual([0, 2])
    expect(removeKeys(base(), [1])[0].curve).toEqual([0.5, 0, 1.5, 0])
    const flat = parseKeys('rotate', [{ value: 5, curve: [0.3, 5, 0.6, 5] }, { time: 1, value: 5 }])
    const changed = upsertKeys(flat, [{ time: 1, values: [8] }])
    expect(changed.keys[0].curve).toEqual([0.3, 6, 0.6, 7])
    expect(segmentOf(flat, 1)).toBeNull()
    const zero = parseKeys('rotate', [{ value: 0, curve: [0, 0, 0, 0] }, { value: 1 }])
    expect(rebuildChannel(zero, [{ key: zero[0], source: 0 }, { key: { ...zero[1], time: 0.9 }, source: 1 }]).keys[0].curve).toEqual([0.3, 0, 0.6, 0])
  })
})

describe('document key commands', () => {
  it('creates keys in new channels, bones and animations without bone timelines', () => {
    const document = doc()
    const edit = setKeys(document, 'wave', [{ target: 'leg', channel: 'scale', time: 0.25, values: [1.5, 1] }], 'K')
    const next = apply(document, edit.command.ops) as any
    expect(next.animations.wave.bones.leg).toEqual({ scale: [{ time: 0.25, x: 1.5 }] })
    expect(edit.selection).toEqual(['leg::scale::0'])
    const empty = setKeys(document, 'empty', [{ target: 'arm', channel: 'rotate', time: 0, values: [30] }], 'K')
    expect(apply(document, empty.command.ops).animations).toMatchObject({ empty: { bones: { arm: { rotate: [{ value: 30 }] } } } })
    expect(Object.keys((apply(document, empty.command.ops) as any).animations.empty)).toEqual(['bones'])
    const rekey = setKeys(document, 'wave', [{ target: 'arm', channel: 'rotate', time: 0.5, values: [25] }, { target: 'arm', channel: 'translate', time: 0.2, values: [1, 2] }], 'K')
    const rekeyed = apply(document, rekey.command.ops) as any
    expect(rekeyed.animations.wave.bones.arm.rotate[1]).toEqual({ time: 0.5, value: 25 })
    expect(rekeyed.animations.wave.bones.arm.translate).toEqual([{ time: 0.2, x: 1, y: 2 }])
    expect([...rekey.selection].sort()).toEqual(['arm::rotate::1', 'arm::translate::0'])
    expect(() => setKeys(document, 'nope', [], 'K')).toThrow(EditError)
    expect(() => setKeys(document, 'wave', [{ target: 'ghost', channel: 'rotate', time: 0, values: [1] }], 'K')).toThrow('找不到骨骼：ghost')
    expect(() => setKeys(document, 'wave', [{ target: 'arm', channel: 'attachment', time: 0, values: [1] }], 'K')).toThrow(EditError)
    expect(() => setKeys(document, 'wave', [{ target: 'arm', channel: 'rotate', time: -1, values: [1] }], 'K')).toThrow(EditError)
    expect(() => setKeys(document, 'wave', [{ target: 'arm', channel: 'rotate', time: 0, values: [1, 2] }], 'K')).toThrow(EditError)
  })

  it('deletes keys and drops empty channels and bones', () => {
    const document = doc()
    const removed = deleteKeys(document, 'wave', [{ target: 'arm', channel: 'translate', index: 0 }, { target: 'arm', channel: 'rotate', index: 9 }])
    expect(removed.command.label).toBe('刪除 1 個關鍵影格')
    expect(Object.keys((apply(document, removed.command.ops) as any).animations.wave.bones.arm)).toEqual(['rotate'])
    const all = deleteKeys(document, 'wave', [0, 1, 2].map((index) => ({ target: 'arm', channel: 'rotate', index })).concat([{ target: 'arm', channel: 'translate', index: 0 }]))
    expect((apply(document, all.command.ops) as any).animations.wave.bones).toEqual({})
    expect(deleteKeys(document, 'wave', []).command.ops).toEqual([])
  })

  it('moves keys across channels, clamps at zero and reports new selection', () => {
    const document = doc()
    const refs = [{ target: 'arm', channel: 'rotate', index: 1 }, { target: 'arm', channel: 'translate', index: 0 }]
    const moved = moveKeyRefs(document, 'wave', refs, 0.1)
    const next = apply(document, moved.command.ops)
    expect(channelKeys(next, 'wave', 'arm', 'rotate').map((key) => key.time)).toEqual([0, 0.6, 1])
    expect(channelKeys(next, 'wave', 'arm', 'translate')[0].time).toBe(0.3)
    expect([...moved.selection].sort()).toEqual(['arm::rotate::1', 'arm::translate::0'])
    const clamped = moveKeyRefs(document, 'wave', refs, -5)
    const back = apply(document, clamped.command.ops)
    expect(channelKeys(back, 'wave', 'arm', 'translate')[0].time).toBe(0)
    expect(channelKeys(back, 'wave', 'arm', 'rotate').map((key) => key.time)).toEqual([0, 0.3, 1])
    expect(moveKeyRefs(document, 'wave', refs, 0).command.ops).toEqual([])
    expect(moveKeyRefs(document, 'wave', refs, 0).selection).toEqual(refs.map(keyId))
  })

  it('copies and pastes keys at another time keeping curves between copied keys', () => {
    const document = doc()
    const clip = copyKeyRefs(document, 'wave', [{ target: 'arm', channel: 'rotate', index: 0 }, { target: 'arm', channel: 'rotate', index: 1 }])
    expect(clip.map((item) => item.offset)).toEqual([0, 0.5])
    expect(clip[0].segment).not.toBeNull()
    const pasted = pasteKeys(document, 'wave', clip, 2)
    const keys = channelKeys(apply(document, pasted.command.ops), 'wave', 'arm', 'rotate')
    expect(keys.map((key) => [key.time, key.values[0]])).toEqual([[0, 10], [0.5, 20], [1, 0], [2, 10], [2.5, 20]])
    expect(keys[3].curve).toEqual([2.1, 12, 2.3, 18])
    expect(pasted.selection).toEqual(['arm::rotate::3', 'arm::rotate::4'])
    const single = copyKeyRefs(document, 'wave', [{ target: 'arm', channel: 'rotate', index: 0 }])
    expect(single[0].curve).toBe('linear')
    expect(pasteKeys(document, 'wave', [], 0).command.ops).toEqual([])
    const cross = pasteKeys(document, 'empty', clip, 0)
    expect(channelKeys(apply(document, cross.command.ops), 'empty', 'arm', 'rotate')).toHaveLength(2)
  })

  it('round trips key ids', () => {
    expect(parseKeyId(keyId({ target: 'a::b', channel: 'rotate', index: 3 }))).toEqual({ target: 'a::b', channel: 'rotate', index: 3 })
    expect(parseKeyId('bad')).toBeNull()
    expect(parseKeyId('x::rotate::-1')).toBeNull()
  })
})

describe('dopesheet model', () => {
  it('lists bones with timelines, channel rows, frames and selection ranges', () => {
    const sheet = buildDopesheet({ document: doc(), animation: 'wave', fps: 30, bones: ['root', 'arm', 'leg'], slots: [], extraBones: ['leg'] })
    expect(sheet.rows.map((row) => row.id)).toEqual(['arm', 'arm:translate', 'arm:rotate', 'leg'])
    expect(sheet.rows[2].keys.map((key) => key.frame)).toEqual([0, 15, 30])
    expect(sheet.rows[0].keys).toHaveLength(4)
    expect(sheet.frameCount).toBe(30)
    expect(sheet.keyCount).toBe(4)
    expect(sheet.rows[1].label).toBe('位移')
    const collapsed = buildDopesheet({ document: doc(), animation: 'wave', fps: 30, bones: ['root', 'arm'], slots: [], collapsed: new Set(['arm']) })
    expect(collapsed.rows.map((row) => row.id)).toEqual(['arm'])
    expect(keysInFrameRange(sheet, new Set(['arm:rotate', 'arm:translate']), 20, 5).sort()).toEqual(['arm::rotate::1', 'arm::translate::0'])
    expect(buildDopesheet({ document: null, animation: null, fps: 30, bones: ['arm'], slots: [] }).rows).toEqual([])
    expect(frameOf(0.49999, 30)).toBe(15)
  })
})

describe('pose to key values', () => {
  it('converts runtime poses to timeline values and the runtime reproduces the pose', () => {
    const setup = { x: 10, y: 5, rotation: 30, scaleX: 2, scaleY: 0 }
    const pose = { x: 15, y: 0, rotation: 75, scaleX: 3, scaleY: 0.5 }
    expect(channelValues('translate', setup, pose)).toEqual([5, -5])
    expect(channelValues('rotate', setup, pose)).toEqual([45])
    expect(channelValues('scale', setup, pose)).toEqual([1.5, 0.5])
    expect(channelForField('y')).toBe('translate')
    expect(channelForField('rotation')).toBe('rotate')
    expect(channelForField('scaleY')).toBe('scale')
    const build = buildDemo()
    const bone = build.data.findBone('head')!
    const target = { x: bone.x + 12, y: bone.y - 4, rotation: bone.rotation + 33, scaleX: bone.scaleX * 1.25, scaleY: bone.scaleY * 0.8 }
    const setupValues = { x: bone.x, y: bone.y, rotation: bone.rotation, scaleX: bone.scaleX, scaleY: bone.scaleY }
    const edit = setKeys(
      build.document!,
      'idle',
      (['translate', 'rotate', 'scale'] as const).map((channel) => ({ target: 'head', channel, time: 0.4, values: channelValues(channel, setupValues, target) })),
      'K',
    )
    const atlas = new TextureAtlas(createDemoFiles().atlasText)
    for (const page of atlas.pages) page.setTexture(new FakeTexture(page.width, page.height))
    const instance = new SpineInstance(readSkeletonData(apply(build.document!, edit.command.ops), atlas))
    instance.setTrack(0, 'idle', { loop: true })
    instance.seek(0.4)
    const posed = instance.skeleton.findBone('head')!
    expect(posed.x).toBeCloseTo(target.x, 3)
    expect(posed.y).toBeCloseTo(target.y, 3)
    expect(posed.rotation).toBeCloseTo(target.rotation, 3)
    expect(posed.scaleX).toBeCloseTo(target.scaleX, 3)
    expect(posed.scaleY).toBeCloseTo(target.scaleY, 3)
  })
})
