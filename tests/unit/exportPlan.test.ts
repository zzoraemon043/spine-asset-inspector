import { describe, expect, it } from 'vitest'
import { buildManifest, EXPORT_LIMITS, frameFileName, frameSize, measureSequence, sanitizeFileStem, sequenceTimes } from '../../src/core/export/exportPlan'
import { pickWebmMimeType } from '../../src/core/export/webm'
import { SpineInstance } from '../../src/core/spine/SpineInstance'
import { transferPose } from '../../src/core/spine/poseTransfer'
import { buildDemo } from '../support/fakeTexture'

describe('export planning', () => {
  it('computes output sizes and caps the longest edge', () => {
    expect(frameSize({ x: 0, y: 0, width: 100, height: 50 }, 2)).toEqual({ width: 200, height: 100, scale: 2 })
    const capped = frameSize({ x: 0, y: 0, width: 2000, height: 1000 }, 8)
    expect(capped.width).toBe(EXPORT_LIMITS.maxDimension)
    expect(capped.scale).toBeCloseTo(2.048)
    expect(frameSize({ x: 0, y: 0, width: 10, height: 10 }, 0.001).scale).toBe(EXPORT_LIMITS.minScale)
  })

  it('samples frames and enforces the frame cap', () => {
    expect(sequenceTimes(1, 30)).toHaveLength(30)
    expect(sequenceTimes(100, 60)).toHaveLength(EXPORT_LIMITS.maxFrames)
  })

  it('names files predictably', () => {
    expect(frameFileName('hero_walk', 3, 30)).toBe('hero_walk_0003.png')
    expect(frameFileName('x', 12, 123456)).toBe('x_000012.png')
    expect(sanitizeFileStem('armor/red walk')).toBe('armor_red_walk')
    expect(sanitizeFileStem('///')).toBe('export')
  })

  it('measures the union of all frames', () => {
    const instance = new SpineInstance(buildDemo().data)
    instance.setSkins(['weapon/sword'])
    const times = sequenceTimes(0.8, 30)
    const bounds = measureSequence(instance, 'attack', times, 4)
    instance.seek(0)
    const first = instance.bounds()
    expect(bounds.height).toBeGreaterThan(first.height)
    expect(bounds.x).toBeLessThanOrEqual(first.x - 4)
  })

  it('builds a manifest with origin offsets', () => {
    const manifest = buildManifest({
      skeleton: 'hero',
      animation: 'walk',
      skins: ['a'],
      fps: 30,
      duration: 1,
      bounds: { x: -50, y: 0, width: 100, height: 200 },
      size: { width: 200, height: 400, scale: 2 },
      frames: [{ file: 'f.png', time: 0 }],
    })
    expect(manifest.origin).toEqual({ x: 100, y: 400 })
    expect(manifest.frameCount).toBe(1)
    expect(manifest.generator).toBe('spine-asset-inspector')
  })

  it('selects the best webm mime type', () => {
    expect(pickWebmMimeType(() => true)).toBe('video/webm;codecs=vp9')
    expect(pickWebmMimeType((type) => type === 'video/webm')).toBe('video/webm')
    expect(pickWebmMimeType(() => false)).toBeNull()
  })
})

describe('pose transfer', () => {
  it('copies world transforms, attachments and draw order', () => {
    const data = buildDemo().data
    const source = new SpineInstance(data)
    source.setSkins(['armor/blue', 'weapon/blaster'])
    source.setTrack(0, 'death', { loop: false })
    source.advance(0.9)
    source.setTrack(1, 'shoot', { loop: true, alpha: 0.5 })
    source.advance(0.1)
    const target = new SpineInstance(buildDemo().data)
    target.setSkins(['armor/blue', 'weapon/blaster'])
    transferPose(source.skeleton, target.skeleton)
    for (let i = 0; i < source.skeleton.bones.length; i++) {
      expect(target.skeleton.bones[i].worldX).toBeCloseTo(source.skeleton.bones[i].worldX)
      expect(target.skeleton.bones[i].worldY).toBeCloseTo(source.skeleton.bones[i].worldY)
      expect(target.skeleton.bones[i].a).toBeCloseTo(source.skeleton.bones[i].a)
    }
    expect(target.currentAttachments()).toEqual(source.currentAttachments())
    expect(target.skeleton.drawOrder.map((slot) => slot.data.name)).toEqual(source.skeleton.drawOrder.map((slot) => slot.data.name))
    expect(target.bounds()).toEqual(source.bounds())
  })
})
