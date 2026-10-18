import { describe, expect, it } from 'vitest'
import { TextureAtlas } from '@esotericsoftware/spine-core'
import { createDemoFiles, DEMO_SKINS } from '../../src/core/demo/demoAsset'
import { DEMO_PAGE, DEMO_REGIONS, packRegions } from '../../src/core/demo/demoRegions'
import { buildDemo } from '../support/fakeTexture'

describe('procedural demo asset', () => {
  it('packs every region without overlap inside the page', () => {
    const packed = packRegions(DEMO_REGIONS, DEMO_PAGE.width, DEMO_PAGE.height, DEMO_PAGE.padding)
    expect(packed).toHaveLength(DEMO_REGIONS.length)
    for (const a of packed) {
      expect(a.x + a.width).toBeLessThanOrEqual(DEMO_PAGE.width)
      expect(a.y + a.height).toBeLessThanOrEqual(DEMO_PAGE.height)
      for (const b of packed) {
        if (a === b) continue
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
        expect(overlap).toBe(false)
      }
    }
  })

  it('throws when the page is too small', () => {
    expect(() => packRegions(DEMO_REGIONS, 64, 64, 2)).toThrow()
  })

  it('produces a parseable atlas and a painted texture', () => {
    const files = createDemoFiles()
    const atlas = new TextureAtlas(files.atlasText)
    expect(atlas.pages[0].name).toBe('inspector-demo.png')
    expect(atlas.regions.map((region) => region.name)).toContain('sword')
    expect(files.texture.pixels.length).toBe(DEMO_PAGE.width * DEMO_PAGE.height * 4)
    let opaque = 0
    for (let i = 3; i < files.texture.pixels.length; i += 4) if (files.texture.pixels[i] > 0) opaque += 1
    expect(opaque).toBeGreaterThan(20_000)
  })

  it('is deterministic', () => {
    const a = createDemoFiles()
    const b = createDemoFiles()
    expect(a.skeletonJson).toBe(b.skeletonJson)
    expect(a.atlasText).toBe(b.atlasText)
    expect(Buffer.from(a.texture.pixels).equals(Buffer.from(b.texture.pixels))).toBe(true)
  })

  it('builds a full skeleton covering every inspector feature', () => {
    const { data, version, premultipliedAlpha } = buildDemo()
    expect(version.compatible).toBe(true)
    expect(premultipliedAlpha).toBe(false)
    expect(data.animations.map((animation) => animation.name)).toEqual(['idle', 'walk', 'run', 'attack', 'shoot', 'hit', 'death'])
    expect(data.skins.map((skin) => skin.name)).toEqual(['default', 'armor/red', 'armor/blue', 'helmet/knight', 'helmet/cap', 'weapon/sword', 'weapon/blaster'])
    expect(data.events.map((event) => event.name).sort()).toEqual(['fx', 'hit', 'step'])
    expect(data.bones).toHaveLength(18)
    expect(data.slots).toHaveLength(18)
    expect(data.fps).toBe(30)
    for (const skin of DEMO_SKINS) expect(data.findSkin(skin)).not.toBeNull()
  })
})
