import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { AtlasAttachmentLoader, RegionAttachment, TextureAtlas } from '@esotericsoftware/spine-core'
import { describeAtlas, isTrimmed, packedSize, regionIds } from '../../src/core/atlas/atlasModel'
import { regionFileNames, sanitizeRegionPath, sliceRegion, sourcePixel, type SliceGeometry } from '../../src/core/atlas/atlasSlicer'
import { buildAtlasArchive } from '../../src/core/atlas/atlasArchive'
import { findAtlasRegion, replaceRegion } from '../../src/core/atlas/regionOverride'
import { crc32, encodePng } from '../../src/core/image/pngEncode'
import { createDemoFiles } from '../../src/core/demo/demoAsset'
import { SpineInstance } from '../../src/core/spine/SpineInstance'
import type { TexturePixels } from '../../src/core/types'
import { decodePng } from '../support/pngDecode'
import { buildDemo, FakeTexture } from '../support/fakeTexture'

function makeImage(width: number, height: number, seed = 1): TexturePixels {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = (i * 7 + seed) & 0xff
    pixels[i * 4 + 1] = (i * 13 + seed * 3) & 0xff
    pixels[i * 4 + 2] = (i * 29) & 0xff
    pixels[i * 4 + 3] = i % 5 === 0 ? 0 : (i * 31) & 0xff
  }
  return { width, height, pixels }
}

function pixelAt(image: TexturePixels, x: number, y: number): number[] {
  const offset = (y * image.width + x) * 4
  return Array.from(image.pixels.slice(offset, offset + 4))
}

function packInto(page: TexturePixels, image: TexturePixels, region: SliceGeometry): void {
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const target = sourcePixel(region, x, y)
      const from = (y * image.width + x) * 4
      const to = (target.y * page.width + target.x) * 4
      for (let c = 0; c < 4; c++) page.pixels[to + c] = image.pixels[from + c]
    }
  }
}

const base: SliceGeometry = { x: 3, y: 5, width: 6, height: 4, degrees: 0, offsetX: 0, offsetY: 0, originalWidth: 6, originalHeight: 4 }

describe('atlas slicing geometry', () => {
  it('maps image pixels into the packed page rectangle for every rotation', () => {
    for (const degrees of [0, 90, 180, 270]) {
      const region = { ...base, degrees }
      const packed = packedSize(region)
      const seen = new Set<string>()
      for (let y = 0; y < region.height; y++) {
        for (let x = 0; x < region.width; x++) {
          const point = sourcePixel(region, x, y)
          expect(point.x).toBeGreaterThanOrEqual(region.x)
          expect(point.y).toBeGreaterThanOrEqual(region.y)
          expect(point.x).toBeLessThan(region.x + packed.width)
          expect(point.y).toBeLessThan(region.y + packed.height)
          seen.add(`${point.x},${point.y}`)
        }
      }
      expect(seen.size).toBe(region.width * region.height)
    }
    expect(packedSize({ width: 6, height: 4, degrees: 90 })).toEqual({ width: 4, height: 6 })
    expect(packedSize({ width: 6, height: 4, degrees: -90 })).toEqual({ width: 4, height: 6 })
  })

  it('matches the spine runtime uv convention for rotated regions', () => {
    const atlasText = ['page.png', 'size:64,64', 'filter:Linear,Linear', 'part', 'bounds:10,20,8,5', 'rotate:90', ''].join('\n')
    const atlas = new TextureAtlas(atlasText)
    atlas.pages[0].setTexture(new FakeTexture(64, 64))
    const attachment = new AtlasAttachmentLoader(atlas).newRegionAttachment(null as never, 'part', 'part', null as never)
    attachment.width = 8
    attachment.height = 5
    attachment.updateRegion()
    expect(attachment).toBeInstanceOf(RegionAttachment)
    const upperLeft = { u: attachment.uvs[2] * 64, v: attachment.uvs[3] * 64 }
    const corner = sourcePixel(describeAtlas(atlas).regions[0], 0, 0)
    expect(upperLeft.u).toBeCloseTo(corner.x)
    expect(upperLeft.v).toBeCloseTo(corner.y + 1)
    const upperRight = { u: attachment.uvs[4] * 64, v: attachment.uvs[5] * 64 }
    const topRight = sourcePixel(describeAtlas(atlas).regions[0], 7, 0)
    expect(upperRight.u).toBeCloseTo(topRight.x)
    expect(upperRight.v).toBeCloseTo(topRight.y)
  })

  it('restores rotated regions losslessly', () => {
    for (const degrees of [0, 90, 180, 270]) {
      const image = makeImage(6, 4, degrees)
      const page = makeImage(20, 20, 99)
      const region = { ...base, degrees }
      packInto(page, image, region)
      const slice = sliceRegion(page, region)
      expect(slice.width).toBe(6)
      expect(slice.height).toBe(4)
      expect(Array.from(slice.pixels)).toEqual(Array.from(image.pixels))
    }
  })

  it('restores trimmed whitespace from offsets', () => {
    const image = makeImage(6, 4)
    const page = makeImage(20, 20, 7)
    const region = { ...base, offsetX: 2, offsetY: 1, originalWidth: 10, originalHeight: 8 }
    packInto(page, image, region)
    const restored = sliceRegion(page, region)
    expect(restored.width).toBe(10)
    expect(restored.height).toBe(8)
    expect(pixelAt(restored, 0, 0)).toEqual([0, 0, 0, 0])
    expect(pixelAt(restored, 2, 3)).toEqual(pixelAt(image, 0, 0))
    expect(pixelAt(restored, 7, 6)).toEqual(pixelAt(image, 5, 3))
    expect(pixelAt(restored, 9, 7)).toEqual([0, 0, 0, 0])
    const trimmed = sliceRegion(page, region, { restoreWhitespace: false })
    expect(trimmed.width).toBe(6)
    expect(Array.from(trimmed.pixels)).toEqual(Array.from(image.pixels))
  })

  it('rejects regions outside the page', () => {
    expect(() => sliceRegion(makeImage(8, 8), { ...base, x: 4 })).toThrow('超出')
    expect(() => sliceRegion(makeImage(8, 8), { ...base, width: 0 })).toThrow()
  })

  it('creates safe unique file names', () => {
    expect(sanitizeRegionPath('../weapons\\sword:01')).toBe('weapons/sword_01')
    expect(sanitizeRegionPath('..')).toBe('region')
    expect(regionFileNames([
      { name: 'fx/spark', index: 0 },
      { name: 'fx/spark', index: 1 },
      { name: 'head', index: 0 },
      { name: 'HEAD', index: 0 },
    ])).toEqual(['fx/spark_0.png', 'fx/spark_1.png', 'head.png', 'HEAD_2.png'])
    expect(regionIds([{ name: 'a', index: 0 }, { name: 'a', index: 1 }, { name: 'b', index: 0 }])).toEqual(['a#0', 'a#1', 'b'])
  })

  it('describes atlas pages and regions', () => {
    const atlas = new TextureAtlas(createDemoFiles().atlasText)
    const info = describeAtlas(atlas)
    expect(info.pages).toEqual([{ name: 'inspector-demo.png', width: 512, height: 256, pma: false, regionCount: 20 }])
    expect(info.regions.find((region) => region.id === 'sword')).toMatchObject({ width: 110, height: 16, degrees: 0 })
    expect(info.regions.some(isTrimmed)).toBe(false)
  })
})

describe('png encoder', () => {
  it('computes standard crc32 values', () => {
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082)
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('round trips rgba pixels exactly', () => {
    const image = makeImage(13, 7)
    const decoded = decodePng(encodePng(image))
    expect(decoded).toMatchObject({ width: 13, height: 7, colorType: 6 })
    expect(Array.from(decoded.pixels)).toEqual(Array.from(image.pixels))
    expect(decodePng(encodePng(image, 0)).pixels).toEqual(decoded.pixels)
  })

  it('validates input', () => {
    expect(() => encodePng({ width: 0, height: 1, pixels: new Uint8ClampedArray(0) })).toThrow()
    expect(() => encodePng({ width: 2, height: 2, pixels: new Uint8ClampedArray(3) })).toThrow()
  })
})

describe('atlas archive', () => {
  it('slices every demo region into a lossless png with manifest', () => {
    const files = createDemoFiles()
    const info = describeAtlas(new TextureAtlas(files.atlasText))
    const progress: number[] = []
    const archive = buildAtlasArchive(info, new Map([[files.pageName, files.texture]]), true, (ratio) => progress.push(ratio))
    const entries = unzipSync(archive.zip)
    expect(Object.keys(entries)).toHaveLength(21)
    expect(archive.files).toBe(20)
    expect(progress.at(-1)).toBeLessThan(1)
    for (const region of info.regions) {
      const png = decodePng(entries[`${region.name}.png`])
      expect(png.width).toBe(region.width)
      expect(png.height).toBe(region.height)
      expect(Array.from(png.pixels)).toEqual(Array.from(sliceRegion(files.texture, region).pixels))
    }
    const manifest = JSON.parse(new TextDecoder().decode(entries['atlas-manifest.json']))
    expect(manifest.regions).toHaveLength(20)
    expect(manifest.restoreWhitespace).toBe(true)
  })

  it('fails when a page is missing', () => {
    const info = describeAtlas(new TextureAtlas(createDemoFiles().atlasText))
    expect(() => buildAtlasArchive(info, new Map())).toThrow('inspector-demo.png')
  })
})

describe('region hot replacement', () => {
  it('points every attachment using the region at a standalone texture and restores it', () => {
    const build = buildDemo()
    const instance = new SpineInstance(build.data)
    instance.setSkins(['weapon/sword'])
    const original = findAtlasRegion(build.atlas, 'sword')
    const texture = new FakeTexture(32, 8)
    const replacement = replaceRegion(build.data, build.atlas, 'sword', texture, 32, 8)
    expect(replacement.attachments).toBe(1)
    const weapon = instance.skeleton.findSlot('weapon')?.getAttachment() as RegionAttachment
    expect(weapon.region?.texture).toBe(texture)
    expect(Array.from(weapon.uvs)).toEqual([0, 1, 0, 0, 1, 0, 1, 1])
    replacement.restore()
    expect(weapon.region).toBe(original)
    expect(weapon.region?.texture).not.toBe(texture)
  })

  it('replaces mesh regions and validates arguments', () => {
    const build = buildDemo()
    const replacement = replaceRegion(build.data, build.atlas, 'cape', new FakeTexture(10, 10), 10, 10)
    expect(replacement.attachments).toBe(1)
    expect(() => replaceRegion(build.data, build.atlas, 'missing', new FakeTexture(1, 1), 1, 1)).toThrow('missing')
    expect(() => replaceRegion(build.data, build.atlas, 'head', new FakeTexture(1, 1), 0, 1)).toThrow()
  })
})
