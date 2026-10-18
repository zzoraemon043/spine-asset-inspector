import { childOf, isContainer, isObject, type JsonContainer, type JsonObject, type JsonPath, type JsonValue } from './json'

export type PatchOp =
  | { readonly kind: 'set'; readonly path: JsonPath; readonly value: JsonValue | undefined; readonly position?: number }
  | { readonly kind: 'insert'; readonly path: JsonPath; readonly value: JsonValue }
  | { readonly kind: 'remove'; readonly path: JsonPath }
  | { readonly kind: 'rename'; readonly path: JsonPath; readonly from: string; readonly to: string }

export interface PatchResult<T extends JsonValue> {
  readonly document: T
  readonly inverse: readonly PatchOp[]
}

export class PatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PatchError'
  }
}

function describePath(path: JsonPath): string {
  return path.length === 0 ? '(根)' : path.map(String).join('.')
}

function copyOf(container: JsonContainer): JsonContainer {
  return Array.isArray(container) ? container.slice() : { ...container }
}

function modify(root: JsonValue, path: JsonPath, depth: number, edit: (container: JsonContainer) => JsonContainer): JsonValue {
  if (!isContainer(root)) throw new PatchError(`路徑不是容器：${describePath(path.slice(0, depth))}`)
  if (depth === path.length) return edit(root)
  const key = path[depth]
  const child = childOf(root, key)
  if (child === undefined) throw new PatchError(`找不到路徑：${describePath(path.slice(0, depth + 1))}`)
  const next = modify(child, path, depth + 1, edit)
  const copy = copyOf(root)
  ;(copy as Record<string | number, JsonValue>)[key] = next
  return copy
}

function insertKey(target: JsonObject, key: string, value: JsonValue, position: number | undefined): JsonObject {
  const entries = Object.entries(target)
  const index = position === undefined ? entries.length : Math.min(Math.max(0, position), entries.length)
  entries.splice(index, 0, [key, value])
  return Object.fromEntries(entries)
}

function requireIndex(key: string | number | undefined, path: JsonPath): number {
  if (typeof key !== 'number' || !Number.isInteger(key) || key < 0) throw new PatchError(`陣列索引無效：${describePath(path)}`)
  return key
}

function applySet(root: JsonValue, op: Extract<PatchOp, { kind: 'set' }>): PatchResult<JsonValue> {
  if (op.path.length === 0) {
    if (op.value === undefined) throw new PatchError('不可刪除根節點')
    return { document: op.value, inverse: [{ kind: 'set', path: [], value: root }] }
  }
  const parentPath = op.path.slice(0, -1)
  const key = op.path[op.path.length - 1]
  let inverse = null as PatchOp | null
  const document = modify(root, parentPath, 0, (container) => {
    if (Array.isArray(container)) {
      const index = requireIndex(key, op.path)
      if (index >= container.length) throw new PatchError(`陣列索引超出範圍：${describePath(op.path)}`)
      if (op.value === undefined) throw new PatchError(`陣列元素請使用 remove：${describePath(op.path)}`)
      const copy = container.slice()
      inverse = { kind: 'set', path: op.path, value: container[index] }
      copy[index] = op.value
      return copy
    }
    if (typeof key !== 'string') throw new PatchError(`物件鍵必須為字串：${describePath(op.path)}`)
    const exists = Object.prototype.hasOwnProperty.call(container, key)
    const previous = exists ? container[key] : undefined
    const position = exists ? Object.keys(container).indexOf(key) : undefined
    inverse = previous === undefined ? { kind: 'set', path: op.path, value: undefined } : { kind: 'set', path: op.path, value: previous, position }
    if (op.value === undefined) {
      const copy = { ...container }
      delete copy[key]
      return copy
    }
    if (exists) return { ...container, [key]: op.value }
    return insertKey(container, key, op.value, op.position)
  })
  return { document, inverse: inverse ? [inverse] : [] }
}

function applyInsert(root: JsonValue, op: Extract<PatchOp, { kind: 'insert' }>): PatchResult<JsonValue> {
  const index = requireIndex(op.path[op.path.length - 1], op.path)
  const document = modify(root, op.path.slice(0, -1), 0, (container) => {
    if (!Array.isArray(container)) throw new PatchError(`insert 只能用於陣列：${describePath(op.path)}`)
    if (index > container.length) throw new PatchError(`陣列索引超出範圍：${describePath(op.path)}`)
    const copy = container.slice()
    copy.splice(index, 0, op.value)
    return copy
  })
  return { document, inverse: [{ kind: 'remove', path: op.path }] }
}

function applyRemove(root: JsonValue, op: Extract<PatchOp, { kind: 'remove' }>): PatchResult<JsonValue> {
  const index = requireIndex(op.path[op.path.length - 1], op.path)
  let removed = undefined as JsonValue | undefined
  const document = modify(root, op.path.slice(0, -1), 0, (container) => {
    if (!Array.isArray(container)) throw new PatchError(`remove 只能用於陣列：${describePath(op.path)}`)
    if (index >= container.length) throw new PatchError(`陣列索引超出範圍：${describePath(op.path)}`)
    const copy = container.slice()
    removed = copy.splice(index, 1)[0]
    return copy
  })
  return { document, inverse: [{ kind: 'insert', path: op.path, value: removed as JsonValue }] }
}

function applyRename(root: JsonValue, op: Extract<PatchOp, { kind: 'rename' }>): PatchResult<JsonValue> {
  if (op.from === op.to) return { document: root, inverse: [] }
  const document = modify(root, op.path, 0, (container) => {
    if (!isObject(container)) throw new PatchError(`rename 只能用於物件：${describePath(op.path)}`)
    if (!Object.prototype.hasOwnProperty.call(container, op.from)) throw new PatchError(`找不到鍵：${op.from}`)
    if (Object.prototype.hasOwnProperty.call(container, op.to)) throw new PatchError(`鍵已存在：${op.to}`)
    return Object.fromEntries(Object.entries(container).map(([key, value]) => [key === op.from ? op.to : key, value]))
  })
  return { document, inverse: [{ kind: 'rename', path: op.path, from: op.to, to: op.from }] }
}

export function applyOp<T extends JsonValue>(root: T, op: PatchOp): PatchResult<T> {
  const result =
    op.kind === 'set' ? applySet(root, op) : op.kind === 'insert' ? applyInsert(root, op) : op.kind === 'remove' ? applyRemove(root, op) : applyRename(root, op)
  return result as PatchResult<T>
}

export function applyOps<T extends JsonValue>(root: T, ops: readonly PatchOp[]): PatchResult<T> {
  let document = root
  const inverse: PatchOp[] = []
  for (const op of ops) {
    const result = applyOp(document, op)
    document = result.document
    inverse.unshift(...result.inverse)
  }
  return { document, inverse }
}
