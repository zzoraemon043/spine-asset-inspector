import { isObject, type JsonObject, type JsonValue } from './json'

export type SkeletonDocument = JsonObject

export class DocumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentError'
  }
}

export function parseDocument(text: string): SkeletonDocument {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new DocumentError(`JSON 格式錯誤：${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isObject(value)) throw new DocumentError('骨架 JSON 根節點必須是物件')
  return value
}

export function objectList(document: SkeletonDocument, key: string): JsonObject[] {
  const value = document[key]
  return Array.isArray(value) ? value.filter(isObject) : []
}

export function objectMap(document: SkeletonDocument, key: string): JsonObject {
  const value = document[key]
  return isObject(value) ? value : {}
}

export function stringOf(value: JsonValue | undefined): string | null {
  return typeof value === 'string' ? value : null
}

export function numberOf(value: JsonValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function namedIndex(document: SkeletonDocument, key: string, name: string): number {
  const value = document[key]
  if (!Array.isArray(value)) return -1
  return value.findIndex((item) => isObject(item) && item.name === name)
}

export function documentFps(document: SkeletonDocument): number | null {
  const skeleton = document.skeleton
  return isObject(skeleton) && typeof skeleton.fps === 'number' ? skeleton.fps : null
}

export function findNamed(document: SkeletonDocument | null, key: string, name: string): JsonObject | null {
  if (!document) return null
  const value = document[key]
  if (!Array.isArray(value)) return null
  const found = value.find((item) => isObject(item) && item.name === name)
  return isObject(found) ? found : null
}

export function findKeyed(document: SkeletonDocument | null, key: string, name: string): JsonObject | null {
  if (!document) return null
  const map = document[key]
  if (!isObject(map) || !Object.prototype.hasOwnProperty.call(map, name)) return null
  const value = map[name]
  return isObject(value) ? value : null
}
