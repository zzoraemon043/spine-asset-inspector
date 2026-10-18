import type { SkeletonData, Texture } from '@esotericsoftware/spine-core'
import type { TexturePixels, VirtualFile } from '@/core/types'
import { describeAtlas } from '@/core/atlas/atlasModel'
import { buildAtlasArchive } from '@/core/atlas/atlasArchive'
import { regionFileNames, sliceRegion } from '@/core/atlas/atlasSlicer'
import { replaceRegion, type RegionReplacement } from '@/core/atlas/regionOverride'
import { encodePng } from '@/core/image/pngEncode'
import { sanitizeFileStem } from '@/core/export/exportPlan'
import { patchState, pushNotice, useInspectorStore, type RegionOverrideInfo } from '@/store/inspectorStore'
import type { FeatureHost } from './host'

interface ActiveReplacement<TImage> {
  readonly replacement: RegionReplacement
  readonly texture: Texture
  readonly image: TImage
  readonly width: number
  readonly height: number
}

export class AtlasFeature<TImage> {
  private readonly host: FeatureHost<TImage>
  private readonly replacements = new Map<string, ActiveReplacement<TImage>>()

  constructor(host: FeatureHost<TImage>) {
    this.host = host
  }

  onAssetLoaded(): void {
    const asset = this.host.asset()
    patchState({ atlas: asset ? describeAtlas(asset.atlas) : null, regionOverrides: {}, selectedRegion: null, regionFilter: '' })
  }

  disposeAll(): void {
    for (const active of this.replacements.values()) this.release(active)
    this.replacements.clear()
  }

  rebind(data: SkeletonData): void {
    const asset = this.host.asset()
    if (!asset) return
    for (const [id, active] of this.replacements) {
      const replacement = replaceRegion(data, asset.atlas, id, active.texture, active.width, active.height)
      this.replacements.set(id, { ...active, replacement })
    }
  }

  private release(active: ActiveReplacement<TImage>): void {
    active.replacement.restore()
    active.texture.dispose()
    this.host.env.imaging.release?.(active.image)
  }

  overridesForExport(): ReadonlyMap<string, TImage> {
    return new Map([...this.replacements.entries()].map(([id, active]) => [id, active.image]))
  }

  pageImage(name: string): TImage | null {
    return this.host.asset()?.source.pages.get(name) ?? null
  }

  selectRegion(id: string | null): void {
    patchState({ selectedRegion: id })
  }

  setFilter(filter: string): void {
    patchState({ regionFilter: filter })
  }

  setRestoreWhitespace(enabled: boolean): void {
    patchState({ restoreWhitespace: enabled })
  }

  async replaceRegionImage(id: string, file: VirtualFile): Promise<boolean> {
    const asset = this.host.asset()
    const stage = this.host.stage()
    if (!asset || !stage) return false
    try {
      const image = await this.host.env.imaging.decode(file)
      const size = this.host.env.imaging.size(image)
      const texture = stage.createTexture(image)
      const previous = this.replacements.get(id)
      if (previous) this.release(previous)
      let replacement: RegionReplacement
      try {
        replacement = replaceRegion(asset.data, asset.atlas, id, texture, size.width, size.height)
      } catch (error) {
        texture.dispose()
        this.host.env.imaging.release?.(image)
        throw error
      }
      this.replacements.set(id, { replacement, texture, image, width: size.width, height: size.height })
      const info: RegionOverrideInfo = { fileName: file.name, width: size.width, height: size.height, attachments: replacement.attachments }
      patchState({ regionOverrides: { ...useInspectorStore.getState().regionOverrides, [id]: info }, selectedRegion: id })
      asset.instance.refresh()
      this.host.refreshAudit()
      this.host.publishLive()
      pushNotice('success', `已替換 Region ${id}（${size.width}x${size.height}，影響 ${replacement.attachments} 個部件）`)
      return true
    } catch (error) {
      pushNotice('error', error instanceof Error ? error.message : String(error))
      return false
    }
  }

  restoreRegion(id: string): void {
    const active = this.replacements.get(id)
    if (!active) return
    this.release(active)
    this.replacements.delete(id)
    const overrides = { ...useInspectorStore.getState().regionOverrides }
    delete overrides[id]
    patchState({ regionOverrides: overrides })
    this.host.asset()?.instance.refresh()
    this.host.refreshAudit()
  }

  restoreAll(): void {
    this.disposeAll()
    patchState({ regionOverrides: {} })
    this.host.asset()?.instance.refresh()
    this.host.refreshAudit()
  }

  private pagePixels(): Map<string, TexturePixels> {
    const asset = this.host.asset()
    if (!asset) throw new Error('尚未載入資產')
    const pixels = new Map<string, TexturePixels>()
    for (const [name, image] of asset.source.pages) pixels.set(name, this.host.env.imaging.readPixels(image))
    return pixels
  }

  async exportArchive(): Promise<boolean> {
    return this.host.runExport('atlas', async () => {
      const asset = this.host.asset()
      const atlas = useInspectorStore.getState().atlas
      if (!asset || !atlas) throw new Error('尚未載入圖集')
      const restore = useInspectorStore.getState().restoreWhitespace
      const archive = buildAtlasArchive(atlas, this.pagePixels(), restore)
      return {
        blob: new Blob([archive.zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
        fileName: `${sanitizeFileStem(asset.source.name)}_regions_${archive.files}.zip`,
        width: atlas.pages[0]?.width ?? 0,
        height: atlas.pages[0]?.height ?? 0,
        frames: archive.files,
      }
    })
  }

  async exportRegion(id: string): Promise<boolean> {
    return this.host.runExport('region', async () => {
      const atlas = useInspectorStore.getState().atlas
      const index = atlas?.regions.findIndex((region) => region.id === id) ?? -1
      if (!atlas || index < 0) throw new Error(`找不到圖集 Region：${id}`)
      const region = atlas.regions[index]
      const page = this.pagePixels().get(region.page)
      if (!page) throw new Error(`缺少圖集頁面像素：${region.page}`)
      const image = sliceRegion(page, region, { restoreWhitespace: useInspectorStore.getState().restoreWhitespace })
      const fileName = regionFileNames(atlas.regions)[index].split('/').pop() ?? 'region.png'
      return {
        blob: new Blob([encodePng(image) as Uint8Array<ArrayBuffer>], { type: 'image/png' }),
        fileName,
        width: image.width,
        height: image.height,
        frames: 1,
      }
    })
  }
}
