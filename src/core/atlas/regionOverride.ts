import {
  MeshAttachment,
  RegionAttachment,
  TextureAtlasPage,
  TextureAtlasRegion,
  type SkeletonData,
  type Texture,
  type TextureAtlas,
} from '@esotericsoftware/spine-core'
import { regionIds } from './atlasModel'

export interface RegionReplacement {
  readonly regionId: string
  readonly attachments: number
  restore(): void
}

type RegionHolder = RegionAttachment | MeshAttachment

function holders(data: SkeletonData): RegionHolder[] {
  const result = new Set<RegionHolder>()
  for (const skin of data.skins) {
    for (const entry of skin.getAttachments()) {
      const attachment = entry.attachment
      if (attachment instanceof RegionAttachment || attachment instanceof MeshAttachment) result.add(attachment)
    }
  }
  return [...result]
}

export function findAtlasRegion(atlas: TextureAtlas, id: string): TextureAtlasRegion | null {
  const ids = regionIds(atlas.regions)
  const position = ids.indexOf(id)
  return position >= 0 ? atlas.regions[position] : null
}

export function createStandaloneRegion(source: TextureAtlasRegion, texture: Texture, width: number, height: number): TextureAtlasRegion {
  const page = new TextureAtlasPage(`${source.page.name}:${source.name}:override`)
  page.width = width
  page.height = height
  page.pma = source.page.pma
  page.texture = texture
  const region = new TextureAtlasRegion(page, source.name)
  region.index = source.index
  region.texture = texture
  region.x = 0
  region.y = 0
  region.width = width
  region.height = height
  region.originalWidth = width
  region.originalHeight = height
  region.offsetX = 0
  region.offsetY = 0
  region.degrees = 0
  region.u = 0
  region.v = 0
  region.u2 = 1
  region.v2 = 1
  page.regions.push(region)
  return region
}

export function replaceRegion(data: SkeletonData, atlas: TextureAtlas, id: string, texture: Texture, width: number, height: number): RegionReplacement {
  const original = findAtlasRegion(atlas, id)
  if (!original) throw new Error(`找不到圖集 Region：${id}`)
  if (width <= 0 || height <= 0) throw new Error('替換貼圖尺寸必須大於 0')
  const replacement = createStandaloneRegion(original, texture, width, height)
  const targets = holders(data).filter((attachment) => attachment.region === original)
  for (const attachment of targets) {
    attachment.region = replacement
    attachment.updateRegion()
  }
  return {
    regionId: id,
    attachments: targets.length,
    restore() {
      for (const attachment of targets) {
        if (attachment.region !== replacement) continue
        attachment.region = original
        attachment.updateRegion()
      }
    },
  }
}
