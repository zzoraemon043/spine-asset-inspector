import type { TexturePixels } from '../types'
import { duplicatedNames, packedSize, type AtlasRegionInfo } from './atlasModel'

export type SliceGeometry = Pick<AtlasRegionInfo, 'x' | 'y' | 'width' | 'height' | 'degrees' | 'offsetX' | 'offsetY' | 'originalWidth' | 'originalHeight'>

export interface SliceOptions {
  readonly restoreWhitespace: boolean
}

export function sourcePixel(region: SliceGeometry, imageX: number, imageY: number): { x: number; y: number } {
  const quarter = ((region.degrees % 360) + 360) % 360
  if (quarter === 90) return { x: region.x + imageY, y: region.y + (region.width - 1 - imageX) }
  if (quarter === 180) return { x: region.x + (region.width - 1 - imageX), y: region.y + (region.height - 1 - imageY) }
  if (quarter === 270) return { x: region.x + (region.height - 1 - imageY), y: region.y + imageX }
  return { x: region.x + imageX, y: region.y + imageY }
}

export function sliceRegion(page: TexturePixels, region: SliceGeometry, options: SliceOptions = { restoreWhitespace: true }): TexturePixels {
  const packed = packedSize(region)
  if (region.width <= 0 || region.height <= 0) throw new Error('Region 尺寸必須大於 0')
  if (region.x < 0 || region.y < 0 || region.x + packed.width > page.width || region.y + packed.height > page.height) {
    throw new Error('Region 超出圖集頁面範圍')
  }
  const restore = options.restoreWhitespace
  const outWidth = restore ? Math.max(region.originalWidth, region.width) : region.width
  const outHeight = restore ? Math.max(region.originalHeight, region.height) : region.height
  const left = restore ? region.offsetX : 0
  const top = restore ? outHeight - region.offsetY - region.height : 0
  const pixels = new Uint8ClampedArray(outWidth * outHeight * 4)
  for (let imageY = 0; imageY < region.height; imageY++) {
    const targetY = top + imageY
    if (targetY < 0 || targetY >= outHeight) continue
    for (let imageX = 0; imageX < region.width; imageX++) {
      const targetX = left + imageX
      if (targetX < 0 || targetX >= outWidth) continue
      const source = sourcePixel(region, imageX, imageY)
      const from = (source.y * page.width + source.x) * 4
      const to = (targetY * outWidth + targetX) * 4
      pixels[to] = page.pixels[from]
      pixels[to + 1] = page.pixels[from + 1]
      pixels[to + 2] = page.pixels[from + 2]
      pixels[to + 3] = page.pixels[from + 3]
    }
  }
  return { width: outWidth, height: outHeight, pixels }
}

export function sanitizeRegionPath(name: string): string {
  const segments = name
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.replace(/[<>:"|?*\u0000-\u001f]/g, '_').trim())
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
  return segments.length > 0 ? segments.join('/') : 'region'
}

export function regionFileNames(regions: readonly Pick<AtlasRegionInfo, 'name' | 'index'>[]): string[] {
  const used = new Set<string>()
  const duplicated = duplicatedNames(regions)
  return regions.map((region) => {
    const base = sanitizeRegionPath(duplicated.has(region.name) ? `${region.name}_${region.index}` : region.name)
    let candidate = `${base}.png`
    let counter = 2
    while (used.has(candidate.toLowerCase())) candidate = `${base}_${counter++}.png`
    used.add(candidate.toLowerCase())
    return candidate
  })
}
