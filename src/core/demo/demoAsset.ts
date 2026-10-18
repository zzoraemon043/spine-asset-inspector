import type { AssetSource, TexturePixels } from '../types'
import { buildAtlasText, DEMO_PAGE, DEMO_REGIONS, packRegions } from './demoRegions'
import { createDemoSkeletonJson, DEMO_NAME } from './demoSkeleton'
import { paintAtlasPage } from './demoTexture'

export interface DemoFiles {
  readonly skeletonFileName: string
  readonly skeletonJson: string
  readonly atlasFileName: string
  readonly atlasText: string
  readonly pageName: string
  readonly texture: TexturePixels
}

export const DEMO_SKINS = ['armor/red', 'helmet/knight', 'weapon/sword'] as const

export function createDemoFiles(): DemoFiles {
  const regions = packRegions(DEMO_REGIONS, DEMO_PAGE.width, DEMO_PAGE.height, DEMO_PAGE.padding)
  return {
    skeletonFileName: `${DEMO_NAME}.json`,
    skeletonJson: JSON.stringify(createDemoSkeletonJson()),
    atlasFileName: `${DEMO_NAME}.atlas`,
    atlasText: buildAtlasText(DEMO_PAGE.name, DEMO_PAGE.width, DEMO_PAGE.height, regions),
    pageName: DEMO_PAGE.name,
    texture: paintAtlasPage(DEMO_PAGE.width, DEMO_PAGE.height, regions),
  }
}

export function createDemoSource<TImage>(toImage: (pixels: TexturePixels) => TImage): AssetSource<TImage> {
  const files = createDemoFiles()
  return {
    name: DEMO_NAME,
    origin: 'demo',
    skeleton: { fileName: files.skeletonFileName, format: 'json', data: files.skeletonJson },
    atlasText: files.atlasText,
    pages: new Map([[files.pageName, toImage(files.texture)]]),
    skeletonCandidates: [files.skeletonFileName],
    warnings: [],
  }
}
