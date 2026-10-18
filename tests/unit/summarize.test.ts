import { describe, expect, it } from 'vitest'
import { summarize } from '../../src/core/spine/summarize'
import { buildSkeleton, SkeletonBuildError } from '../../src/core/spine/skeletonFactory'
import { parseVersion } from '../../src/core/spine/versionDetect'
import { buildDemo, demoSource, FakeTexture } from '../support/fakeTexture'

function demoSummary(version = buildDemo().version) {
  const build = buildDemo()
  return summarize({
    name: 'inspector-demo',
    origin: 'demo',
    format: 'json',
    fileName: 'inspector-demo.json',
    data: build.data,
    atlas: build.atlas,
    version,
    premultipliedAlpha: build.premultipliedAlpha,
    skeletonCandidates: ['inspector-demo.json'],
    warnings: [],
  })
}

describe('asset summary', () => {
  it('describes statistics', () => {
    const summary = demoSummary()
    expect(summary.stats).toMatchObject({ bones: 18, slots: 18, skins: 7, animations: 7, events: 3, atlasPages: 1, atlasRegions: 20 })
    expect(summary.fps).toBe(30)
    expect([...summary.eventNames].sort()).toEqual(['fx', 'hit', 'step'])
    expect(summary.warnings).toEqual([])
  })

  it('lists timeline event markers per animation', () => {
    const attack = demoSummary().animations.find((animation) => animation.name === 'attack')
    expect(attack?.events.map((event) => [event.name, Number(event.time.toFixed(2))])).toEqual([
      ['fx', 0.3],
      ['hit', 0.4],
    ])
    expect(attack?.events[1]).toMatchObject({ intValue: 25, stringValue: 'slash' })
    expect(attack?.boneTimelineCount).toBeGreaterThan(0)
    const hit = demoSummary().animations.find((animation) => animation.name === 'hit')
    expect(hit?.slotTimelineCount).toBe(2)
  })

  it('lists attachments per slot with skin origins and types', () => {
    const slots = demoSummary().slots
    const weapon = slots.find((slot) => slot.name === 'weapon')
    expect(weapon?.attachments).toEqual([{ name: 'weapon', type: 'region', skins: ['weapon/sword', 'weapon/blaster'] }])
    expect(slots.find((slot) => slot.name === 'cape')?.attachments[0].type).toBe('mesh')
    expect(slots.find((slot) => slot.name === 'hitbox')?.attachments[0].type).toBe('boundingbox')
    expect(slots[0]).toMatchObject({ index: 0, name: 'arm-back-upper', bone: 'arm-back-upper', setupAttachment: 'arm-upper-back' })
  })

  it('warns about version mismatches', () => {
    const summary = demoSummary(parseVersion('3.8.99'))
    expect(summary.warnings[0]).toContain('3.8.99')
  })
})

describe('skeleton factory errors', () => {
  it('reports missing atlas pages', () => {
    const source = { ...demoSource(), pages: new Map() }
    expect(() => buildSkeleton(source, () => new FakeTexture(1, 1))).toThrow(SkeletonBuildError)
  })

  it('reports invalid skeleton data with version hints', () => {
    const source = { ...demoSource(), skeleton: { fileName: 'x.json', format: 'json' as const, data: '{"skeleton":{"spine":"3.8.99"},"bones":[{"name":"a"}],"slots":[{"name":"s","bone":"missing"}]}' } }
    expect(() => buildSkeleton(source, (image) => new FakeTexture(image.width, image.height))).toThrow(/3\.8\.99/)
  })

  it('reports corrupt binary data', () => {
    const source = { ...demoSource(), skeleton: { fileName: 'x.skel', format: 'binary' as const, data: new Uint8Array([1, 2, 3]) } }
    expect(() => buildSkeleton(source, (image) => new FakeTexture(image.width, image.height))).toThrow(SkeletonBuildError)
  })
})
