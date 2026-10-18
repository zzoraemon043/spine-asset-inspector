import { beforeEach, describe, expect, it } from 'vitest'
import { useInspectorStore } from '../../src/store/inspectorStore'
import { channelKeys } from '../../src/core/animation/keyCommands'
import { createHarness, type FakeHarness } from '../support/fakeEnvironment'

let harness: FakeHarness
const state = () => useInspectorStore.getState()
const keys = (target: string, channel: string, animation = 'walk') => channelKeys(state().editor.document!, animation, target, channel)

beforeEach(async () => {
  harness = createHarness()
  await harness.controller.loadDemo()
  harness.controller.selectAnimation('walk')
  harness.controller.setAnimateMode(true)
})

describe('stage 4 controller features', () => {
  it('applies curves to the selected keys with undo', () => {
    const controller = harness.controller
    expect(controller.animate.setCurve({ kind: 'stepped' }, '步進')).toBe(false)
    expect(state().notices.at(-1)?.text).toBe('請先在律動表選取關鍵影格')
    controller.animate.selectKeys(['torso::rotate::0', 'cape::rotate::0'])
    expect(controller.animate.setCurve({ kind: 'bezier', handles: [0.42, 0, 0.58, 1] }, '曲線預設：緩入緩出')).toBe(true)
    expect(Array.isArray(keys('torso', 'rotate')[0].curve)).toBe(true)
    expect(Array.isArray(keys('cape', 'rotate')[0].curve)).toBe(true)
    expect(state().keySelection).toEqual(['torso::rotate::0', 'cape::rotate::0'])
    expect(state().editor.undoLabel).toBe('曲線預設：緩入緩出')
    controller.animate.selectKeys(['torso::rotate::2'])
    expect(controller.animate.setCurve({ kind: 'stepped' }, '步進')).toBe(false)
    expect(state().keySelection).toEqual(['torso::rotate::2'])
    controller.editor.undo()
    expect(keys('torso', 'rotate')[0].curve).toBe('linear')
  })

  it('keys slot attachments and colors at the current frame', () => {
    const controller = harness.controller
    controller.seekFrame(9)
    expect(controller.animate.keySlotAttachment('head', null)).toBe(true)
    expect(keys('head', 'attachment').map((key) => [Math.round(key.time * 30), key.extra.name ?? null])).toEqual([[9, null]])
    expect(controller.instance!.skeleton.findSlot('head')!.getAttachment()).toBeNull()
    expect(controller.animate.currentSlotAttachment('head')).toBeNull()
    expect(controller.animate.keySlotColor('torso', '#ff000080')).toBe(true)
    expect(keys('torso', 'rgba')[0].values.map((value) => Math.round(value * 255))).toEqual([255, 0, 0, 128])
    expect(controller.animate.currentSlotColor('torso')).toBe('ff000080')
    expect(controller.animate.keySlotColor('torso', 'nope')).toBe(false)
    expect(controller.animate.keySlotColor('torso', '00ff00')).toBe(true)
    expect(controller.animate.currentSlotColor('torso')).toBe('00ff00ff')
    controller.seekFrame(15)
    controller.select({ kind: 'slot', name: 'weapon' })
    expect(controller.animate.keySelected()).toBe(true)
    expect(keys('weapon', 'attachment')).toHaveLength(1)
    expect(keys('weapon', 'rgba')).toHaveLength(1)
    expect(state().editor.undoLabel).toBe('K 幀：插槽 weapon')
    expect(controller.animate.currentSlotColor('ghost')).toBeNull()
    expect(controller.animate.keySlot('ghost')).toBe(false)
  })

  it('writes rgb and alpha when the slot already uses split color timelines', () => {
    const controller = harness.controller
    controller.seekFrame(0)
    controller.editor.edit((document) => {
      const walk = (document.animations as any).walk
      return { label: 'split', ops: [{ kind: 'set', path: ['animations', 'walk', 'slots'], value: { ...(walk.slots ?? {}), torso: { alpha: [{ value: 1 }] } } }] }
    })
    controller.seekFrame(6)
    expect(controller.animate.keySlotColor('torso', '0000ff40')).toBe(true)
    expect(keys('torso', 'rgba')).toHaveLength(0)
    expect(keys('torso', 'rgb')[0].values).toEqual([0, 0, 1])
    expect(keys('torso', 'alpha').map((key) => Math.round(key.values[0] * 255))).toEqual([255, 64])
  })

  it('adds events and edits their parameters', () => {
    const controller = harness.controller
    controller.seekFrame(12)
    expect(controller.animate.addEvent('ghost')).toBe(false)
    expect(controller.animate.addEvent('hit')).toBe(true)
    const events = keys('events', 'event')
    const index = events.findIndex((key) => key.extra.name === 'hit')
    expect(Math.round(events[index].time * 30)).toBe(12)
    expect(state().keySelection).toEqual([`events::event::${index}`])
    const ref = { target: 'events', channel: 'event', index }
    expect(controller.animate.updateEventKey(ref, { int: 3, string: 'heavy' })).toBe(true)
    expect(keys('events', 'event')[index].extra).toEqual({ name: 'hit', int: 3, string: 'heavy' })
    expect(controller.animate.updateEventKey(ref, { int: 1.5 })).toBe(false)
    expect(controller.animate.updateEventKey(ref, { float: Number.NaN })).toBe(false)
    expect(controller.animate.updateEventKey(ref, { name: 'ghost' })).toBe(false)
    expect(controller.animate.updateEventKey(ref, { int: 3 })).toBe(false)
    expect(controller.animate.updateEventKey({ ...ref, channel: 'rotate' }, { int: 1 })).toBe(false)
    expect(controller.animate.updateEventKey(ref, { name: 'fx' })).toBe(true)
    expect(keys('events', 'event')[index].extra.name).toBe('fx')
    const fired: string[] = []
    controller.setPlaying(true)
    controller.seek(0)
    for (let frame = 0; frame < 30; frame += 1) {
      harness.runFrames(1, 1 / 30)
      fired.push(...state().eventLog.map((record) => `${record.name}:${record.intValue}`))
    }
    expect(fired).toContain('fx:3')
  })
})
