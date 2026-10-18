import { describe, expect, it } from 'vitest'
import { TextureAtlas } from '@esotericsoftware/spine-core'
import { formatColor, parseColor, parseKeys, serializeKey, valueCount, channelSpec, curveKindOf, createKey } from '../../src/core/animation/channels'
import { absoluteCurve, bezierPoint, clampHandles, CURVE_PRESETS, LINEAR_HANDLES, normalizedHandles, sampleCurve, specOf } from '../../src/core/animation/curveShape'
import { channelKeys, copyKeyRefs, deleteKeys, moveKeyRefs, pasteKeys, setCurves, setKeys, updateKeyExtra } from '../../src/core/animation/keyCommands'
import { buildDopesheet } from '../../src/core/animation/dopesheet'
import { upsertKeys } from '../../src/core/animation/keyOps'
import { applyOps } from '../../src/core/editor/patch'
import { EditError } from '../../src/core/editor/commands'
import { readSkeletonData } from '../../src/core/editor/serialize'
import { SpineInstance } from '../../src/core/spine/SpineInstance'
import { createDemoFiles } from '../../src/core/demo/demoAsset'
import type { SkeletonDocument } from '../../src/core/editor/document'
import { FakeTexture, buildDemo } from '../support/fakeTexture'

const apply = (document: SkeletonDocument, ops: Parameters<typeof applyOps>[1]) => applyOps(document, ops).document as SkeletonDocument

function runtime(document: SkeletonDocument) {
  const atlas = new TextureAtlas(createDemoFiles().atlasText)
  for (const page of atlas.pages) page.setTexture(new FakeTexture(page.width, page.height))
  return new SpineInstance(readSkeletonData(document, atlas))
}

describe('curve shapes', () => {
  const segment = { t0: 1, t1: 2, v0: [10, 0], v1: [20, 0] }

  it('converts normalized handles to absolute curves and back', () => {
    expect(absoluteCurve([0.25, 0, 0.75, 1], segment, 2)).toEqual([1.25, 10, 1.75, 20, 1.25, 0, 1.75, 0])
    expect(normalizedHandles([1.25, 10, 1.75, 20, 1.25, 0, 1.75, 0], segment)).toEqual([0.25, 0, 0.75, 1])
    expect(normalizedHandles([1.5, 0, 1.5, 0, 1.25, 1, 1.75, 2], { t0: 1, t1: 2, v0: [0, 0], v1: [0, 4] })).toEqual([0.25, 0.25, 0.75, 0.5])
    expect(normalizedHandles([1, 1, 1, 1], { t0: 1, t1: 1, v0: [0], v1: [1] })).toBeNull()
    expect(normalizedHandles('stepped', segment)).toBeNull()
    expect(normalizedHandles([1.2, 5, 1.8, 5], { t0: 1, t1: 2, v0: [5], v1: [5] })).toEqual([0.2, 0.3333, 0.8, 0.6667])
    expect(clampHandles([-1, -5, 2, 5])).toEqual([0, -1, 1, 2])
  })

  it('samples curves and exposes presets', () => {
    expect(sampleCurve({ kind: 'linear' })).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }])
    expect(sampleCurve({ kind: 'stepped' })).toHaveLength(3)
    const ease = sampleCurve({ kind: 'bezier', handles: [0.42, 0, 1, 1] }, 4)
    expect(ease[0]).toEqual({ x: 0, y: 0 })
    expect(ease[4].x).toBeCloseTo(1)
    expect(ease[2].y).toBeLessThan(ease[2].x)
    expect(bezierPoint(LINEAR_HANDLES, 0.5).y).toBeCloseTo(0.5)
    expect(CURVE_PRESETS.map((preset) => preset.id)).toEqual(['linear', 'stepped', 'ease-in', 'ease-out', 'ease-in-out', 'back-out', 'back-in', 'snap'])
    expect(Math.max(...sampleCurve(CURVE_PRESETS[5].spec).map((point) => point.y))).toBeGreaterThan(1)
    expect(specOf('linear', null)).toEqual({ kind: 'linear' })
    expect(specOf('stepped', null)).toEqual({ kind: 'stepped' })
    expect(specOf([0, 0, 0, 0], null)).toEqual({ kind: 'bezier', handles: LINEAR_HANDLES })
    expect(curveKindOf([1])).toBe('bezier')
  })
})

describe('slot and event channels', () => {
  it('parses and writes colors, alpha, attachments and events', () => {
    expect(parseColor('ff800040', 4)).toEqual([1, 128 / 255, 0, 64 / 255])
    expect(parseColor('#ffffff', 3)).toEqual([1, 1, 1])
    expect(parseColor('xyz', 3)).toBeNull()
    expect(parseColor(5, 3)).toBeNull()
    expect(formatColor([1, 0.5, 0, 2])).toBe('ff8000ff')
    const rgba = parseKeys('rgba', [{ time: 0.2, color: 'ff000080', curve: [0.25, 1, 0.3, 1, 0.25, 0, 0.3, 0, 0.25, 0, 0.3, 0, 0.25, 0.5, 0.3, 0.6] }])
    expect(rgba[0].values.map((value) => Math.round(value * 255))).toEqual([255, 0, 0, 128])
    expect(serializeKey('rgba', { ...rgba[0], raw: null })).toEqual({ time: 0.2, color: 'ff000080', curve: rgba[0].curve })
    expect(serializeKey('rgb2', createKey(0, [1, 0, 0, 0, 0, 1]))).toEqual({ light: 'ff0000', dark: '0000ff' })
    expect(serializeKey('alpha', createKey(0.5, [0.25]))).toEqual({ time: 0.5, value: 0.25 })
    expect(serializeKey('attachment', createKey(0.5, [], { name: 'eye' }))).toEqual({ time: 0.5, name: 'eye' })
    expect(valueCount('rgba2')).toBe(7)
    expect(channelSpec('event')).toMatchObject({ group: 'events', curved: false, unique: false })
    expect(upsertKeys(parseKeys('event', [{ time: 0.5, name: 'a' }]), [{ time: 0.5, values: [], extra: { name: 'b' } }], false).keys).toHaveLength(2)
  })

  it('keys slot attachments and colors that the runtime plays back', () => {
    const build = buildDemo()
    const edit = setKeys(
      build.document!,
      'walk',
      [
        { target: 'head', channel: 'attachment', time: 0.3, values: [] },
        { target: 'head', channel: 'attachment', time: 0.6, values: [], extra: { name: 'head' } },
        { target: 'torso', channel: 'rgba', time: 0, values: [1, 1, 1, 1] },
        { target: 'torso', channel: 'rgba', time: 0.5, values: [1, 0, 0, 0.2] },
      ],
      'K',
    )
    const document = apply(build.document!, edit.command.ops) as any
    expect(document.animations.walk.slots).toEqual({
      head: { attachment: [{ time: 0.3 }, { time: 0.6, name: 'head' }] },
      torso: { rgba: [{ color: 'ffffffff' }, { time: 0.5, color: 'ff000033' }] },
    })
    const instance = runtime(document)
    instance.setTrack(0, 'walk', { loop: true })
    instance.seek(0.4)
    expect(instance.skeleton.findSlot('head')!.getAttachment()).toBeNull()
    expect(instance.skeleton.findSlot('torso')!.color.a).toBeCloseTo(1 - 0.8 * 0.8, 2)
    instance.seek(0.7)
    expect(instance.skeleton.findSlot('head')!.getAttachment()?.name).toBe('head')
    expect(() => setKeys(build.document!, 'walk', [{ target: 'ghost', channel: 'rgba', time: 0, values: [1, 1, 1, 1] }], 'K')).toThrow('找不到插槽：ghost')
    expect(() => setKeys(build.document!, 'walk', [{ target: 'head', channel: 'sequence', time: 0, values: [] }], 'K')).toThrow(EditError)
  })

  it('adds, edits, moves and deletes events while keeping simultaneous events', () => {
    const build = buildDemo()
    const add = setKeys(build.document!, 'walk', [{ target: 'events', channel: 'event', time: 0.5, values: [], extra: { name: 'hit' } }], '新增事件 hit')
    let document = apply(build.document!, add.command.ops)
    expect((document as any).animations.walk.events).toEqual([
      { time: 0, name: 'step', int: 1, string: 'left' },
      { time: 0.5, name: 'step', int: 2, string: 'right' },
      { time: 0.5, name: 'hit' },
    ])
    expect(add.selection).toEqual(['events::event::2'])
    const edited = updateKeyExtra(document, 'walk', { target: 'events', channel: 'event', index: 2 }, { int: 7, string: 'boom', name: undefined }, '事件')
    expect((apply(document, edited.command.ops) as any).animations.walk.events[2]).toEqual({ time: 0.5, int: 7, string: 'boom' })
    expect(() => updateKeyExtra(document, 'walk', { target: 'events', channel: 'event', index: 9 }, {}, '事件')).toThrow(EditError)
    const moved = moveKeyRefs(document, 'walk', [{ target: 'events', channel: 'event', index: 2 }], -0.5)
    document = apply(document, moved.command.ops)
    expect(channelKeys(document, 'walk', 'events', 'event').map((key) => [key.time, key.extra.name])).toEqual([[0, 'step'], [0, 'hit'], [0.5, 'step']])
    const removed = deleteKeys(document, 'walk', [0, 1, 2].map((index) => ({ target: 'events', channel: 'event', index })))
    expect((apply(document, removed.command.ops) as any).animations.walk.events).toBeUndefined()
    const clip = copyKeyRefs(build.document!, 'walk', [{ target: 'events', channel: 'event', index: 1 }])
    expect(channelKeys(apply(build.document!, pasteKeys(build.document!, 'idle', clip, 0.25).command.ops), 'idle', 'events', 'event').map((key) => key.time)).toEqual([0.25])
    const instance = runtime(apply(build.document!, add.command.ops))
    const fired: string[] = []
    instance.onEvent((event) => {
      if (event.kind === 'custom') fired.push(event.name)
    })
    instance.setTrack(0, 'walk', { loop: true })
    instance.advance(0.6)
    expect(fired).toContain('hit')
  })
})

describe('curve commands', () => {
  it('writes linear, stepped and bezier curves that change runtime interpolation', () => {
    const build = buildDemo()
    const refs = [{ target: 'torso', channel: 'rotate', index: 0 }]
    const ease = setCurves(build.document!, 'idle', refs, { kind: 'bezier', handles: [0.42, 0, 1, 1] }, '曲線')
    const document = apply(build.document!, ease.command.ops)
    const key = channelKeys(document, 'idle', 'torso', 'rotate')[0]
    expect(key.curve).toEqual([0.252, 0, 0.6, 2])
    const linearPose = runtime(build.document!)
    linearPose.setTrack(0, 'idle', { loop: true })
    linearPose.seek(0.3)
    const eased = runtime(document)
    eased.setTrack(0, 'idle', { loop: true })
    eased.seek(0.3)
    expect(eased.skeleton.findBone('torso')!.rotation).toBeLessThan(linearPose.skeleton.findBone('torso')!.rotation - 0.3)
    const stepped = apply(document, setCurves(document, 'idle', refs, { kind: 'stepped' }, '步進').command.ops)
    expect(channelKeys(stepped, 'idle', 'torso', 'rotate')[0].curve).toBe('stepped')
    const linear = apply(stepped, setCurves(stepped, 'idle', refs, { kind: 'linear' }, '線性').command.ops)
    expect((linear as any).animations.idle.bones.torso.rotate[0]).toEqual({})
    expect(channelKeys(linear, 'idle', 'torso', 'rotate')[0]).toMatchObject({ time: 0, values: [0], curve: 'linear' })
    expect(() => setCurves(build.document!, 'idle', [{ target: 'torso', channel: 'rotate', index: 2 }], { kind: 'linear' }, '曲線')).toThrow(EditError)
    const color = setCurves(build.document!, 'hit', [{ target: 'torso', channel: 'rgba', index: 0 }], { kind: 'bezier', handles: [0.5, 0, 0.5, 1] }, '曲線')
    expect(channelKeys(apply(build.document!, color.command.ops), 'hit', 'torso', 'rgba')[0].curve).toHaveLength(16)
  })

  it('shows slot and event rows with segment kinds in the dopesheet', () => {
    const build = buildDemo()
    const curved = apply(build.document!, setCurves(build.document!, 'hit', [{ target: 'torso', channel: 'rgba', index: 0 }], { kind: 'stepped' }, '步進').command.ops)
    const sheet = buildDopesheet({ document: curved, animation: 'hit', fps: 30, bones: ['hip', 'torso'], slots: ['torso', 'head', 'weapon'], extraSlots: ['weapon'] })
    expect(sheet.rows.map((row) => row.id)).toEqual(['events', 'hip', 'hip:translate', 'torso', 'torso:rotate', 'slot:torso', 'slot:torso:rgba', 'slot:head', 'slot:head:rgba', 'slot:weapon'])
    expect(sheet.rows[0].keys[0]).toMatchObject({ id: 'events::event::0', label: 'fx', segment: null })
    expect(sheet.rows[6].keys.map((key) => key.segment)).toEqual(['stepped', null])
    expect(sheet.rows[2].keys[0].segment).toBe('linear')
    const death = buildDopesheet({ document: build.document, animation: 'death', fps: 30, bones: [], slots: ['helmet'], collapsed: new Set(['slot:helmet']) })
    expect(death.rows.map((row) => row.id)).toEqual(['events', 'slot:helmet'])
    expect(death.rows[1].keys.map((key) => key.label)).toEqual(['helmet', '（隱藏）'])
    expect(death.keyCount).toBe(4)
    expect(death.frameCount).toBe(30)
  })
})
