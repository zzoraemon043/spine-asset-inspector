import { zipSync } from 'fflate'
import type { TexturePixels } from '../types'
import { encodePng } from '../image/pngEncode'
import type { AtlasInfo } from './atlasModel'
import { regionFileNames, sliceRegion } from './atlasSlicer'

export interface AtlasArchiveManifest {
  readonly generator: string
  readonly restoreWhitespace: boolean
  readonly regions: readonly {
    readonly file: string
    readonly name: string
    readonly index: number
    readonly page: string
    readonly width: number
    readonly height: number
    readonly rotated: boolean
    readonly trimmed: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  }[]
}

export interface AtlasArchive {
  readonly zip: Uint8Array
  readonly files: number
  readonly manifest: AtlasArchiveManifest
}

export function buildAtlasArchive(atlas: AtlasInfo, pages: ReadonlyMap<string, TexturePixels>, restoreWhitespace = true, onProgress?: (ratio: number) => void): AtlasArchive {
  const names = regionFileNames(atlas.regions)
  const files: Record<string, Uint8Array> = {}
  const entries: AtlasArchiveManifest['regions'][number][] = []
  atlas.regions.forEach((region, index) => {
    const page = pages.get(region.page)
    if (!page) throw new Error(`缺少圖集頁面像素：${region.page}`)
    const image = sliceRegion(page, region, { restoreWhitespace })
    files[names[index]] = encodePng(image)
    entries.push({
      file: names[index],
      name: region.name,
      index: region.index,
      page: region.page,
      width: image.width,
      height: image.height,
      rotated: region.degrees !== 0,
      trimmed: {
        x: restoreWhitespace ? region.offsetX : 0,
        y: restoreWhitespace ? image.height - region.offsetY - region.height : 0,
        width: region.width,
        height: region.height,
      },
    })
    onProgress?.((index + 1) / (atlas.regions.length + 1))
  })
  const manifest: AtlasArchiveManifest = { generator: 'spine-asset-inspector', restoreWhitespace, regions: entries }
  files['atlas-manifest.json'] = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`)
  return { zip: zipSync(files, { level: 0 }), files: entries.length, manifest }
}
