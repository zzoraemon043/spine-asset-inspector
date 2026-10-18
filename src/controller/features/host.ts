import type { SkeletonData, Texture, TextureAtlas } from '@esotericsoftware/spine-core'
import type { AssetSource, SpineVersionInfo } from '@/core/types'
import type { LegacyUpgrade } from '@/core/spine/skeletonFactory'
import type { SpineInstance } from '@/core/spine/SpineInstance'
import type { ExportKind } from '@/store/defaults'
import type { CancelSignal, ControllerEnvironment, ExportJobResult, StageAdapter } from '../types'

export interface LoadedAsset<TImage> {
  readonly source: AssetSource<TImage>
  readonly instance: SpineInstance
  readonly data: SkeletonData
  readonly atlas: TextureAtlas
  readonly premultipliedAlpha: boolean
  readonly textures: readonly Texture[]
  readonly version: SpineVersionInfo
  readonly legacy: LegacyUpgrade | null
}

export interface FeatureHost<TImage> {
  readonly env: ControllerEnvironment<TImage>
  asset(): LoadedAsset<TImage> | null
  stage(): StageAdapter<TImage> | null
  runExport(kind: ExportKind, job: (signal: CancelSignal) => Promise<ExportJobResult>): Promise<boolean>
  refreshAudit(): void
  publishLive(): void
}
