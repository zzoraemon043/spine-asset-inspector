import { AtlasAttachmentLoader, SkeletonJson, type SkeletonData, type TextureAtlas } from '@esotericsoftware/spine-core'
import { cloneJson } from './json'
import { DocumentError, type SkeletonDocument } from './document'

export interface SerializeOptions {
  readonly pretty?: boolean
}

export function serializeDocument(document: SkeletonDocument, options: SerializeOptions = {}): string {
  return options.pretty ? JSON.stringify(document, null, 2) : JSON.stringify(document)
}

export function readSkeletonData(document: SkeletonDocument, atlas: TextureAtlas, name?: string): SkeletonData {
  let data: SkeletonData
  try {
    data = new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(cloneJson(document))
  } catch (error) {
    throw new DocumentError(`編輯後的骨架無法解析：${error instanceof Error ? error.message : String(error)}`)
  }
  if (!data.name && name) data.name = name
  return data
}
