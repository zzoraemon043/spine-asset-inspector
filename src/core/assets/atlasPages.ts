import { TextureAtlas } from '@esotericsoftware/spine-core'

export interface AtlasOverview {
  readonly pages: readonly string[]
  readonly regions: number
  readonly premultipliedAlpha: boolean
}

export function inspectAtlas(atlasText: string): AtlasOverview {
  const atlas = new TextureAtlas(atlasText)
  return {
    pages: atlas.pages.map((page) => page.name),
    regions: atlas.regions.length,
    premultipliedAlpha: atlas.pages.some((page) => page.pma),
  }
}
