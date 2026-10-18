import type { TextureAtlas } from '@esotericsoftware/spine-core'

export interface AtlasRegionInfo {
  readonly id: string
  readonly name: string
  readonly page: string
  readonly index: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly degrees: number
  readonly offsetX: number
  readonly offsetY: number
  readonly originalWidth: number
  readonly originalHeight: number
}

export interface AtlasPageInfo {
  readonly name: string
  readonly width: number
  readonly height: number
  readonly pma: boolean
  readonly regionCount: number
}

export interface AtlasInfo {
  readonly pages: readonly AtlasPageInfo[]
  readonly regions: readonly AtlasRegionInfo[]
}

export function duplicatedNames(regions: readonly { readonly name: string }[]): Set<string> {
  const seen = new Set<string>()
  const duplicated = new Set<string>()
  for (const region of regions) {
    if (seen.has(region.name)) duplicated.add(region.name)
    seen.add(region.name)
  }
  return duplicated
}

export function regionIds(regions: readonly { readonly name: string; readonly index: number }[]): string[] {
  const duplicated = duplicatedNames(regions)
  return regions.map((region) => (duplicated.has(region.name) ? `${region.name}#${region.index}` : region.name))
}

export function describeAtlas(atlas: TextureAtlas): AtlasInfo {
  const ids = regionIds(atlas.regions)
  return {
    pages: atlas.pages.map((page) => ({
      name: page.name,
      width: page.width,
      height: page.height,
      pma: page.pma,
      regionCount: page.regions.length,
    })),
    regions: atlas.regions.map((region, position) => ({
      id: ids[position],
      name: region.name,
      page: region.page.name,
      index: region.index,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      degrees: region.degrees,
      offsetX: region.offsetX,
      offsetY: region.offsetY,
      originalWidth: region.originalWidth,
      originalHeight: region.originalHeight,
    })),
  }
}

export function packedSize(region: Pick<AtlasRegionInfo, 'width' | 'height' | 'degrees'>): { width: number; height: number } {
  const quarter = ((region.degrees % 360) + 360) % 360
  return quarter === 90 || quarter === 270 ? { width: region.height, height: region.width } : { width: region.width, height: region.height }
}

export function isTrimmed(region: AtlasRegionInfo): boolean {
  return region.originalWidth !== region.width || region.originalHeight !== region.height || region.offsetX !== 0 || region.offsetY !== 0
}
