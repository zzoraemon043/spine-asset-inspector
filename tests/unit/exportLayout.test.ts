import { describe, expect, it } from 'vitest'
import {
  clampDimension,
  composeSheet,
  fixedFrameSize,
  framePosition,
  parseBackground,
  resolveFrameSize,
  selectFrames,
  sheetLayout,
  sheetManifest,
  unpremultiplyFlip,
} from '../../src/core/export/exportPlan'
import { attachmentBoxes, focusBounds } from '../../src/core/render/focusBounds'
import { SpineInstance } from '../../src/core/spine/SpineInstance'
import { buildDemo } from '../support/fakeTexture'

const bounds = { x: -50, y: 0, width: 100, height: 200 }

describe('output sizing', () => {
  it('fits the character into a fixed canvas', () => {
    expect(fixedFrameSize(bounds, 512, 512)).toEqual({ width: 512, height: 512, scale: 2.56 })
    expect(fixedFrameSize(bounds, 300, 100)).toEqual({ width: 300, height: 100, scale: 0.5 })
    expect(clampDimension(99999)).toBe(4096)
    expect(clampDimension(Number.NaN)).toBe(1)
    const base = { padding: 0, background: null, scale: 2, width: 64, height: 32 }
    expect(resolveFrameSize(bounds, { ...base, sizeMode: 'scale' })).toEqual({ width: 200, height: 400, scale: 2 })
    expect(resolveFrameSize(bounds, { ...base, sizeMode: 'fixed' })).toMatchObject({ width: 64, height: 32 })
  })

  it('parses background colors', () => {
    expect(parseBackground('#ff8000')).toEqual([1, 128 / 255, 0, 1])
    expect(parseBackground(null)).toBeNull()
    expect(parseBackground('red')).toBeNull()
  })

  it('selects frame ranges safely', () => {
    const times = [0, 0.1, 0.2, 0.3, 0.4]
    expect(selectFrames(times, 1, 3)).toEqual({ times: [0.1, 0.2, 0.3], first: 1, last: 3 })
    expect(selectFrames(times, 2, null)).toEqual({ times: [0.2, 0.3, 0.4], first: 2, last: 4 })
    expect(selectFrames(times, 9, 1).times).toEqual([0.4])
    expect(selectFrames(times, -3, 0).times).toEqual([0])
    expect(selectFrames([], 0, null).times).toEqual([])
  })
})

describe('sprite sheet', () => {
  it('lays frames out in a near square grid', () => {
    expect(sheetLayout(10, 64, 32)).toEqual({ columns: 4, rows: 3, width: 256, height: 96, frameWidth: 64, frameHeight: 32 })
    expect(sheetLayout(10, 64, 32, 5)).toMatchObject({ columns: 5, rows: 2 })
    expect(sheetLayout(3, 64, 32, 10)).toMatchObject({ columns: 3, rows: 1 })
    expect(sheetLayout(100, 1000, 10, 0, 4096)).toMatchObject({ columns: 4, rows: 25 })
    expect(() => sheetLayout(0, 1, 1)).toThrow()
    expect(() => sheetLayout(100, 1000, 1000)).toThrow('超過上限')
    expect(framePosition(sheetLayout(10, 64, 32), 5)).toEqual({ x: 64, y: 32 })
  })

  it('composes frames into the sheet at their grid positions', () => {
    const frame = (value: number) => ({ width: 2, height: 2, pixels: new Uint8ClampedArray(16).fill(value) })
    const layout = sheetLayout(3, 2, 2, 2)
    const sheet = composeSheet([frame(10), frame(20), frame(30)], layout)
    expect(sheet.width).toBe(4)
    expect(sheet.height).toBe(4)
    const at = (x: number, y: number) => sheet.pixels[(y * 4 + x) * 4]
    expect([at(0, 0), at(2, 0), at(0, 2), at(3, 3)]).toEqual([10, 20, 30, 0])
  })

  it('writes a texture packer style manifest', () => {
    const layout = sheetLayout(2, 10, 20)
    const manifest = sheetManifest({ image: 'a.png', animation: 'walk', fps: 25, layout, names: ['f0', 'f1'], times: [0, 0.04] }) as Record<string, any>
    expect(manifest.frames.f1).toMatchObject({ frame: { x: 10, y: 0, w: 10, h: 20 }, duration: 40, time: 0.04 })
    expect(manifest.animations.walk).toEqual(['f0', 'f1'])
    expect(manifest.meta).toMatchObject({ image: 'a.png', size: { w: 20, h: 20 }, fps: 25 })
  })

  it('converts premultiplied bottom-up pixels to straight top-down rgba', () => {
    const raw = new Uint8Array([10, 20, 30, 255, 64, 32, 0, 128, 0, 0, 0, 0, 1, 2, 3, 255])
    const image = unpremultiplyFlip(raw, 2, 2)
    expect(Array.from(image.pixels)).toEqual([0, 0, 0, 0, 1, 2, 3, 255, 10, 20, 30, 255, 128, 64, 0, 128])
    expect(Array.from(unpremultiplyFlip(raw, 2, 2, false).pixels.slice(0, 4))).toEqual([10, 20, 30, 255])
  })
})

describe('focus bounds', () => {
  it('ignores far away attachments when framing the character', () => {
    const instance = new SpineInstance(buildDemo().data)
    instance.setSkins(['armor/red', 'helmet/knight', 'weapon/sword'])
    const boxes = attachmentBoxes(instance.skeleton)
    expect(boxes.length).toBeGreaterThan(10)
    const full = instance.bounds()
    const near = focusBounds(boxes, full)
    expect(near.width).toBeLessThanOrEqual(full.width + 1e-6)
    const far = [...boxes, { minX: 5000, minY: 5000, maxX: 5010, maxY: 5010 }]
    const focused = focusBounds(far, { x: 0, y: 0, width: 6000, height: 6000 })
    expect(focused.x + focused.width).toBeLessThan(1000)
    expect(focusBounds(boxes.slice(0, 2), full)).toBe(full)
  })
})
