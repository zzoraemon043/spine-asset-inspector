import {
  AtlasAttachmentLoader,
  SkeletonBinary,
  SkeletonJson,
  TextureAtlas,
  type SkeletonData,
  type Texture,
} from '@esotericsoftware/spine-core'
import type { AssetSource, SpineVersionInfo } from '../types'
import { detectVersion } from './versionDetect'
import { convertSpine36Binary, isSpine36 } from '../legacy/spine36Binary'
import { parseDocument, type SkeletonDocument } from '../editor/document'

export type TextureFactory<TImage> = (image: TImage, pageName: string) => Texture

export interface LegacyUpgrade {
  readonly sourceVersion: string
  readonly warnings: readonly string[]
}

export interface SkeletonBuild {
  readonly data: SkeletonData
  readonly atlas: TextureAtlas
  readonly premultipliedAlpha: boolean
  readonly version: SpineVersionInfo
  readonly legacy: LegacyUpgrade | null
  readonly document: SkeletonDocument | null
  readonly documentReason: string | null
}

export const BINARY_EDIT_REASON = 'Spine 4.x 二進位 .skel 目前僅供檢視與匯出，若要編輯請於 Spine 編輯器匯出為 JSON 後再開啟'

export class SkeletonBuildError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkeletonBuildError'
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function buildSkeleton<TImage>(source: AssetSource<TImage>, createTexture: TextureFactory<TImage>): SkeletonBuild {
  const version = detectVersion(source.skeleton.format, source.skeleton.data)
  let atlas: TextureAtlas
  try {
    atlas = new TextureAtlas(source.atlasText)
  } catch (error) {
    throw new SkeletonBuildError(`圖集解析失敗：${describe(error)}`)
  }
  for (const page of atlas.pages) {
    const image = source.pages.get(page.name)
    if (image === undefined) throw new SkeletonBuildError(`缺少圖集頁面貼圖：${page.name}`)
    page.setTexture(createTexture(image, page.name))
  }
  const loader = new AtlasAttachmentLoader(atlas)
  let data: SkeletonData
  let legacy: LegacyUpgrade | null = null
  let document: SkeletonDocument | null = null
  const binary = source.skeleton.format === 'binary' && typeof source.skeleton.data !== 'string' ? source.skeleton.data : null
  if (version.major !== null && version.major < 4 && !(binary && isSpine36(version.raw))) {
    throw new SkeletonBuildError(
      `Spine ${version.raw} ${source.skeleton.format === 'json' ? 'JSON' : '二進位'} 尚未支援自動升級（目前支援 4.2，以及 3.6 二進位 .skel 自動升級）。請以 Spine 編輯器開啟原始專案並匯出為 4.2`,
    )
  }
  try {
    if (binary && isSpine36(version.raw)) {
      const conversion = convertSpine36Binary(binary)
      legacy = { sourceVersion: conversion.sourceVersion, warnings: conversion.warnings }
      const text = JSON.stringify(conversion.json)
      data = new SkeletonJson(loader).readSkeletonData(text)
      document = parseDocument(text)
    } else if (source.skeleton.format === 'json') {
      const text = typeof source.skeleton.data === 'string' ? source.skeleton.data : new TextDecoder().decode(source.skeleton.data)
      data = new SkeletonJson(loader).readSkeletonData(text)
      document = parseDocument(text)
    } else {
      const bytes = typeof source.skeleton.data === 'string' ? new TextEncoder().encode(source.skeleton.data) : source.skeleton.data
      data = new SkeletonBinary(loader).readSkeletonData(bytes)
    }
  } catch (error) {
    const hint = version.compatible || version.raw === null ? '' : `（檔案版本 ${version.raw}，執行環境為 4.2）`
    throw new SkeletonBuildError(`骨架解析失敗${hint}：${describe(error)}`)
  }
  if (!data.name) data.name = source.name
  return {
    data,
    atlas,
    premultipliedAlpha: atlas.pages.some((page) => page.pma),
    version,
    legacy,
    document,
    documentReason: document ? null : BINARY_EDIT_REASON,
  }
}
