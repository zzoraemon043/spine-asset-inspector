import { beforeEach, describe, expect, it } from 'vitest'
import { SpineInstance, type InstanceEvent } from '../../src/core/spine/SpineInstance'
import { buildDemo } from '../support/fakeTexture'

let instance: SpineInstance
let events: InstanceEvent[]

beforeEach(() => {
  instance = new SpineInstance(buildDemo().data)
  events = []
  instance.onEvent((event) => events.push(event))
})

const custom = () => events.filter((event) => event.kind === 'custom')

describe('SpineInstance skins', () => {
  it('falls back to the default skin when nothing is selected', () => {
    instance.setSkins([])
    const attachments = instance.currentAttachments()
    expect(attachments.torso).toBe('torso')
    expect(attachments.armor).toBeNull()
    expect(attachments.weapon).toBeNull()
  })

  it('composes several skins into one', () => {
    instance.setSkins(['armor/red', 'helmet/knight', 'weapon/blaster'])
    expect(instance.skins).toEqual(['armor/red', 'helmet/knight', 'weapon/blaster'])
    expect(instance.skeleton.skin?.name).toBe('__inspector_composite__')
    const slot = instance.skeleton.findSlot('weapon')
    const region = slot?.getAttachment() as { path?: string } | null
    expect(region?.path).toBe('blaster')
    expect(instance.currentAttachments().helmet).toBe('helmet')
  })

  it('uses a single skin directly and ignores unknown names', () => {
    instance.setSkins(['armor/blue', 'missing'])
    expect(instance.skins).toEqual(['armor/blue'])
    expect(instance.skeleton.skin?.name).toBe('armor/blue')
  })
})

describe('SpineInstance playback', () => {
  it('fires timeline events while advancing', () => {
    instance.setTrack(0, 'walk', { loop: true })
    for (let i = 0; i < 70; i++) instance.advance(1 / 60)
    const steps = custom().filter((event) => event.name === 'step')
    expect(steps.map((event) => event.intValue)).toEqual([1, 2, 1])
    expect(steps[1].stringValue).toBe('right')
    expect(steps[1].animationTime).toBeCloseTo(0.5, 5)
    expect(events.some((event) => event.kind === 'start')).toBe(true)
    expect(events.some((event) => event.kind === 'complete')).toBe(true)
  })

  it('reports int float and string parameters', () => {
    instance.setTrack(0, 'attack', { loop: false })
    for (let i = 0; i < 30; i++) instance.advance(1 / 30)
    const hit = custom().find((event) => event.name === 'hit')
    expect(hit).toMatchObject({ intValue: 25, stringValue: 'slash', animation: 'attack', track: 0 })
    expect(hit?.floatValue).toBeCloseTo(1.5)
  })

  it('does not advance while paused', () => {
    instance.setTrack(0, 'walk', { loop: true })
    instance.paused = true
    for (let i = 0; i < 10; i++) instance.advance(0.1)
    expect(instance.snapshot().time).toBe(0)
  })

  it('applies time scale', () => {
    instance.setTrack(0, 'walk', { loop: true })
    instance.setTimeScale(0.5)
    instance.advance(0.4)
    expect(instance.snapshot().time).toBeCloseTo(0.2, 5)
    instance.setTimeScale(-1)
    expect(instance.timeScale).toBe(0)
  })

  it('seeks without firing events and clamps to the animation range', () => {
    instance.setTrack(0, 'walk', { loop: true })
    instance.advance(0.01)
    events.length = 0
    instance.seek(0.75)
    expect(instance.snapshot().time).toBeCloseTo(0.75, 5)
    expect(instance.snapshot().frame).toBe(22)
    expect(custom()).toHaveLength(0)
    instance.seek(99)
    expect(instance.snapshot().time).toBeCloseTo(1, 3)
    expect(instance.snapshot().frame).toBe(29)
    instance.seek(-3)
    expect(instance.snapshot().time).toBe(0)
  })

  it('steps forward and backward by whole frames', () => {
    instance.setTrack(0, 'run', { loop: true })
    instance.paused = true
    instance.step(1)
    expect(instance.snapshot().frame).toBe(1)
    instance.step(5)
    expect(instance.snapshot().frame).toBe(6)
    instance.step(-2)
    expect(instance.snapshot().frame).toBe(4)
    instance.step(-50)
    expect(instance.snapshot().frame).toBe(0)
    instance.step(0)
    expect(instance.snapshot().frame).toBe(0)
  })

  it('step forward fires events crossed during the step', () => {
    instance.setTrack(0, 'run', { loop: true })
    instance.paused = true
    instance.step(1)
    events.length = 0
    for (let i = 0; i < 9; i++) instance.step(1)
    expect(custom().map((event) => event.name)).toEqual(['step'])
  })

  it('toggles loop on the live entry', () => {
    instance.setTrack(0, 'hit', { loop: false })
    instance.advance(1)
    expect(instance.snapshot().time).toBeCloseTo(0.4, 5)
    instance.setTrackLoop(0, true)
    expect(instance.snapshot().tracks[0].loop).toBe(true)
  })

  it('ignores unknown animations', () => {
    expect(instance.setTrack(0, 'nope', { loop: true })).toBeNull()
    expect(instance.hasAnimation('walk')).toBe(true)
  })
})

describe('SpineInstance mixing and layers', () => {
  it('mixes between animations using the configured duration', () => {
    instance.setDefaultMix(0.4)
    instance.setTrack(0, 'idle', { loop: true })
    instance.advance(0.2)
    instance.setTrack(0, 'walk', { loop: true })
    instance.advance(0.1)
    const main = instance.snapshot().tracks[0]
    expect(main.mixingFrom).toBe('idle')
    expect(main.mixDuration).toBeCloseTo(0.4)
    expect(main.mixProgress).toBeGreaterThan(0)
    expect(main.mixProgress).toBeLessThan(1)
    instance.advance(0.5)
    instance.advance(0.01)
    expect(instance.snapshot().tracks[0].mixingFrom).toBeNull()
  })

  it('stores pair specific mixes and resets them', () => {
    instance.setDefaultMix(0.1)
    instance.setMix('idle', 'run', 0.75)
    expect(instance.getMix('idle', 'run')).toBeCloseTo(0.75)
    expect(instance.getMix('run', 'idle')).toBeCloseTo(0.1)
    instance.resetMixes([{ from: 'walk', to: 'run', duration: 0.3 }], 0.2)
    expect(instance.getMix('idle', 'run')).toBeCloseTo(0.2)
    expect(instance.getMix('walk', 'run')).toBeCloseTo(0.3)
    instance.setMix('idle', 'missing', 1)
    expect(instance.getMix('idle', 'missing')).toBeCloseTo(0.2)
  })

  it('honours an explicit zero mix duration', () => {
    instance.setDefaultMix(0.5)
    instance.setTrack(0, 'idle', { loop: true })
    instance.advance(0.1)
    instance.setTrack(0, 'walk', { loop: true, mixDuration: 0 })
    instance.advance(0.01)
    expect(instance.snapshot().tracks[0].mixingFrom).toBeNull()
  })

  it('layers a second track over the first', () => {
    instance.setTrack(0, 'run', { loop: true })
    instance.advance(0.05)
    const before = instance.skeleton.findBone('arm-front-upper')?.rotation ?? 0
    instance.setTrack(1, 'shoot', { loop: true, alpha: 1 })
    instance.advance(0.05)
    const snapshot = instance.snapshot()
    expect(snapshot.tracks.map((track) => track.animation)).toEqual(['run', 'shoot'])
    const after = instance.skeleton.findBone('arm-front-upper')?.rotation ?? 0
    expect(Math.abs(after - before)).toBeGreaterThan(20)
    instance.setTrackAlpha(1, 2)
    expect(instance.state.getCurrent(1)?.alpha).toBe(1)
    instance.setTrackBlend(1, 'add')
    expect(instance.state.getCurrent(1)?.mixBlend).toBe(3)
    instance.clearTrack(1)
    expect(instance.state.getCurrent(1)).toBeNull()
  })

  it('mixes a track out when cleared with a duration', () => {
    instance.setTrack(1, 'shoot', { loop: true })
    instance.advance(0.05)
    instance.clearTrack(1, 0.3)
    expect(instance.state.getCurrent(1)?.animation?.name).toBe('<empty>')
    instance.clearAll()
    expect(instance.snapshot().tracks).toHaveLength(0)
  })
})

describe('SpineInstance slot overrides', () => {
  beforeEach(() => {
    instance.setSkins(['weapon/sword', 'helmet/knight'])
    instance.setTrack(0, 'idle', { loop: true })
  })

  it('hides a slot and restores it', () => {
    instance.setSlotOverride('weapon', { visible: false, attachment: undefined })
    instance.advance(0.1)
    expect(instance.currentAttachments().weapon).toBeNull()
    instance.setSlotOverride('weapon', null)
    expect(instance.currentAttachments().weapon).toBe('weapon')
    expect(instance.getSlotOverrides().size).toBe(0)
  })

  it('forces a specific attachment or none', () => {
    instance.setSlotOverride('helmet', { visible: true, attachment: null })
    expect(instance.currentAttachments().helmet).toBeNull()
    instance.setSlotOverride('torso', { visible: true, attachment: 'torso' })
    expect(instance.currentAttachments().torso).toBe('torso')
  })

  it('keeps overrides above attachment timelines', () => {
    instance.setSlotOverride('helmet', { visible: false, attachment: undefined })
    instance.setTrack(0, 'death', { loop: false })
    instance.advance(0.1)
    expect(instance.currentAttachments().helmet).toBeNull()
  })

  it('clears every override', () => {
    instance.setSlotOverride('weapon', { visible: false, attachment: undefined })
    instance.setSlotOverride('helmet', { visible: false, attachment: undefined })
    instance.clearSlotOverrides()
    expect(instance.currentAttachments().weapon).toBe('weapon')
    expect(instance.currentAttachments().helmet).toBe('helmet')
  })

  it('ignores unknown slots', () => {
    instance.setSlotOverride('missing', { visible: false, attachment: undefined })
    expect(instance.getSlotOverrides().size).toBe(0)
  })

  it('follows the death attachment timeline without overrides', () => {
    instance.setTrack(0, 'death', { loop: false, resetPose: true })
    instance.advance(0.3)
    expect(instance.currentAttachments().helmet).toBe('helmet')
    instance.advance(0.5)
    expect(instance.currentAttachments().helmet).toBeNull()
  })
})

describe('SpineInstance geometry', () => {
  it('reports finite bounds around the character', () => {
    const bounds = instance.bounds()
    expect(bounds.width).toBeGreaterThan(60)
    expect(bounds.height).toBeGreaterThan(250)
    expect(bounds.y).toBeGreaterThan(-20)
  })
})
