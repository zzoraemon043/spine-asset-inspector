import { isObject, jsonEqual, type JsonObject, type JsonValue } from '../editor/json'
import type { PatchOp } from '../editor/patch'
import type { EditCommand } from '../editor/session'
import type { SkeletonDocument } from '../editor/document'
import { EditError } from '../editor/commands'
import { channelSpec, curveChannels, isKnownChannel, parseDeformTarget, parseKeys, roundTime, serializeKeys, TIME_EPSILON, valueCount, type ChannelGroup, type Curve, type Key } from './channels'
import { moveKeys, removeKeys, rebuildChannel, segmentOf, upsertKeys, type Entry, type Segment } from './keyOps'
import { absoluteCurve, type CurveSpec } from './curveShape'

export interface KeyRef {
  readonly target: string
  readonly channel: string
  readonly index: number
}

export interface KeyValue {
  readonly target: string
  readonly channel: string
  readonly time: number
  readonly values: readonly number[]
  readonly extra?: JsonObject
}

export interface ClipKey {
  readonly target: string
  readonly channel: string
  readonly offset: number
  readonly values: readonly number[]
  readonly curve: Curve
  readonly extra: JsonObject
  readonly segment: Segment | null
}

export interface KeyEdit {
  readonly command: EditCommand
  readonly selection: readonly string[]
}

interface ChannelUpdate {
  readonly target: string
  readonly channel: string
  readonly keys: readonly Key[]
}

const SEPARATOR = '::'

export function keyId(ref: KeyRef): string {
  return `${ref.target}${SEPARATOR}${ref.channel}${SEPARATOR}${ref.index}`
}

export function parseKeyId(id: string): KeyRef | null {
  const parts = id.split(SEPARATOR)
  if (parts.length < 3) return null
  const index = Number(parts[parts.length - 1])
  const channel = parts[parts.length - 2]
  const target = parts.slice(0, -2).join(SEPARATOR)
  return Number.isInteger(index) && index >= 0 && target ? { target, channel, index } : null
}

function animationOf(document: SkeletonDocument, animation: string): JsonObject {
  const map = document.animations
  const value = isObject(map) && Object.prototype.hasOwnProperty.call(map, animation) ? map[animation] : undefined
  if (!isObject(value)) throw new EditError(`找不到動畫：${animation}`)
  return value
}

function timelinePath(channel: string, target: string): { group: ChannelGroup; path: string[] } {
  const group = channelSpec(channel).group
  if (group === 'events' || group === 'drawOrder') return { group, path: [] }
  if (group === 'ik' || group === 'transform') return { group, path: [target] }
  if (group === 'attachments') {
    const parts = parseDeformTarget(target)
    if (!parts) throw new EditError(`變形目標無效：${target}`)
    return { group, path: [parts.skin, parts.slot, parts.attachment, 'deform'] }
  }
  return { group, path: [target, channel] }
}

function readPath(value: JsonValue | undefined, path: readonly string[]): JsonValue | undefined {
  let current = value
  for (const key of path) {
    if (!isObject(current)) return undefined
    current = current[key]
  }
  return current
}

function writePath(value: JsonValue | undefined, path: readonly string[], next: JsonValue | undefined, depth = 0): JsonValue | undefined {
  if (path.length === 0) return next
  const base: JsonObject = isObject(value) ? { ...value } : {}
  const [key, ...rest] = path
  const child = writePath(base[key], rest, next, depth + 1)
  if (child === undefined) delete base[key]
  else base[key] = child
  return depth > 0 && Object.keys(base).length === 0 ? undefined : base
}

export function channelKeys(document: SkeletonDocument, animation: string, target: string, channel: string): Key[] {
  const data = animationOf(document, animation)
  const { group, path } = timelinePath(channel, target)
  return parseKeys(channel, readPath(data[group], path))
}

function hasNamed(document: SkeletonDocument, key: string, name: string): boolean {
  const list = document[key]
  return Array.isArray(list) && list.some((item) => isObject(item) && item.name === name)
}

const TARGET_LABEL: Partial<Record<ChannelGroup, string>> = { bones: '骨骼', slots: '插槽', ik: 'IK 限制器', transform: '變換限制器' }

function requireTarget(document: SkeletonDocument, channel: string): (target: string) => void {
  if (!isKnownChannel(channel)) throw new EditError(`不支援的時間軸：${channel}`)
  const group = channelSpec(channel).group
  if (group === 'events' || group === 'drawOrder') return () => undefined
  if (group === 'attachments') {
    return (target) => {
      const parts = parseDeformTarget(target)
      const skin = parts && Array.isArray(document.skins) ? document.skins.find((item) => isObject(item) && item.name === parts.skin) : null
      const attachment = parts && isObject(skin) ? readPath(skin.attachments, [parts.slot, parts.attachment]) : undefined
      if (!parts || !isObject(attachment)) throw new EditError(`找不到網格部件：${target}`)
    }
  }
  return (target) => {
    if (!hasNamed(document, group, target)) throw new EditError(`找不到${TARGET_LABEL[group] ?? ''}：${target}`)
  }
}

function writeChannels(document: SkeletonDocument, animation: string, updates: readonly ChannelUpdate[]): PatchOp[] {
  const data = animationOf(document, animation)
  const values = new Map<ChannelGroup, JsonValue | undefined>()
  for (const update of updates) {
    const { group, path } = timelinePath(update.channel, update.target)
    const current = values.has(group) ? values.get(group) : data[group]
    const serialized = update.keys.length > 0 ? (serializeKeys(update.channel, update.keys) as JsonValue) : undefined
    values.set(group, path.length === 0 ? serialized : writePath(current, path, serialized))
  }
  const ops: PatchOp[] = []
  for (const [group, value] of values) {
    const existing = Object.prototype.hasOwnProperty.call(data, group)
    if (!existing && (value === undefined || (isObject(value) && Object.keys(value).length === 0))) continue
    if (existing && jsonEqual(value, data[group])) continue
    ops.push(existing ? { kind: 'set', path: ['animations', animation, group], value } : { kind: 'set', path: ['animations', animation, group], value, position: 0 })
  }
  return ops
}

function groupItems<T extends { target: string; channel: string }>(items: readonly T[]): Array<{ target: string; channel: string; items: T[] }> {
  const result = new Map<string, { target: string; channel: string; items: T[] }>()
  for (const item of items) {
    const key = `${item.channel}${SEPARATOR}${item.target}`
    const entry = result.get(key) ?? { target: item.target, channel: item.channel, items: [] }
    entry.items.push(item)
    result.set(key, entry)
  }
  return [...result.values()]
}

export function setKeys(document: SkeletonDocument, animation: string, items: readonly KeyValue[], label: string): KeyEdit {
  const updates: ChannelUpdate[] = []
  const selection: string[] = []
  for (const { target, channel, items: values } of groupItems(items)) {
    requireTarget(document, channel)(target)
    const current = channelSpec(channel)
    for (const value of values) {
      if (value.time < 0 || !Number.isFinite(value.time)) throw new EditError('關鍵影格時間必須大於或等於 0')
      if (value.values.length !== valueCount(channel) || value.values.some((item) => !Number.isFinite(item))) throw new EditError(`關鍵影格數值無效：${target} ${current.label}`)
    }
    const result = upsertKeys(channelKeys(document, animation, target, channel), values, current.unique, current.progress)
    updates.push({ target, channel, keys: result.keys })
    for (const position of result.positions) if (position >= 0) selection.push(keyId({ target, channel, index: position }))
  }
  return { command: { label, ops: writeChannels(document, animation, updates) }, selection: [...new Set(selection)] }
}

function resolveRefs(document: SkeletonDocument, animation: string, refs: readonly KeyRef[]): Array<{ target: string; channel: string; indexes: number[]; keys: Key[] }> {
  const result = new Map<string, { target: string; channel: string; indexes: number[]; keys: Key[] }>()
  for (const ref of refs) {
    if (!isKnownChannel(ref.channel)) continue
    const key = `${ref.channel}${SEPARATOR}${ref.target}`
    const entry = result.get(key) ?? { target: ref.target, channel: ref.channel, indexes: [], keys: channelKeys(document, animation, ref.target, ref.channel) }
    if (ref.index < entry.keys.length && !entry.indexes.includes(ref.index)) entry.indexes.push(ref.index)
    entry.indexes.sort((a, b) => a - b)
    result.set(key, entry)
  }
  return [...result.values()].filter((entry) => entry.indexes.length > 0)
}

export function deleteKeys(document: SkeletonDocument, animation: string, refs: readonly KeyRef[]): KeyEdit {
  const resolved = resolveRefs(document, animation, refs)
  const updates = resolved.map(({ target, channel, indexes, keys }) => ({ target, channel, keys: removeKeys(keys, indexes, channelSpec(channel).unique, channelSpec(channel).progress) }))
  const count = resolved.reduce((sum, entry) => sum + entry.indexes.length, 0)
  return { command: { label: `刪除 ${count} 個關鍵影格`, ops: count > 0 ? writeChannels(document, animation, updates) : [] }, selection: [] }
}

export function moveKeyRefs(document: SkeletonDocument, animation: string, refs: readonly KeyRef[], delta: number): KeyEdit {
  const resolved = resolveRefs(document, animation, refs)
  let earliest = Number.POSITIVE_INFINITY
  for (const entry of resolved) for (const index of entry.indexes) earliest = Math.min(earliest, entry.keys[index].time)
  const shift = Number.isFinite(earliest) ? Math.max(delta, -earliest) : 0
  const updates: ChannelUpdate[] = []
  const selection: string[] = []
  let count = 0
  for (const { target, channel, indexes, keys } of resolved) {
    const result = moveKeys(keys, indexes, shift, channelSpec(channel).unique, channelSpec(channel).progress)
    updates.push({ target, channel, keys: result.keys })
    count += indexes.length
    for (const position of result.positions) if (position >= 0) selection.push(keyId({ target, channel, index: position }))
  }
  const ops = count > 0 && Math.abs(shift) >= TIME_EPSILON ? writeChannels(document, animation, updates) : []
  return { command: { label: `移動 ${count} 個關鍵影格`, ops }, selection: ops.length > 0 ? [...new Set(selection)] : refs.map(keyId) }
}

export function copyKeyRefs(document: SkeletonDocument, animation: string, refs: readonly KeyRef[]): ClipKey[] {
  const clip: Array<ClipKey & { time: number }> = []
  for (const { target, channel, indexes, keys } of resolveRefs(document, animation, refs)) {
    const chosen = new Set(indexes)
    for (const index of indexes) {
      const key = keys[index]
      const segment = typeof key.curve !== 'string' && chosen.has(index + 1) ? segmentOf(keys, index, channelSpec(channel).progress) : null
      clip.push({ target, channel, time: key.time, offset: 0, values: key.values, curve: segment || typeof key.curve === 'string' ? key.curve : 'linear', extra: key.extra, segment })
    }
  }
  if (clip.length === 0) return []
  const start = Math.min(...clip.map((item) => item.time))
  return clip.map(({ time, ...item }) => ({ ...item, offset: roundTime(time - start) }))
}

export function pasteKeys(document: SkeletonDocument, animation: string, clip: readonly ClipKey[], at: number): KeyEdit {
  if (clip.length === 0) return { command: { label: '貼上關鍵影格', ops: [] }, selection: [] }
  const updates: ChannelUpdate[] = []
  const selection: string[] = []
  for (const { target, channel, items } of groupItems(clip)) {
    requireTarget(document, channel)(target)
    const old = channelKeys(document, animation, target, channel)
    const entries: Entry[] = old.map((key, source) => ({ key, source }))
    const start = entries.length
    for (const item of items) entries.push({ key: { time: roundTime(at + item.offset), values: [...item.values], curve: item.curve, extra: item.extra, raw: null }, source: null, segment: item.segment })
    const result = rebuildChannel(old, entries, channelSpec(channel).unique, channelSpec(channel).progress)
    updates.push({ target, channel, keys: result.keys })
    for (let index = start; index < entries.length; index += 1) {
      const position = result.positions[index]
      if (position >= 0) selection.push(keyId({ target, channel, index: position }))
    }
  }
  return { command: { label: `貼上 ${clip.length} 個關鍵影格`, ops: writeChannels(document, animation, updates) }, selection }
}

export function setCurves(document: SkeletonDocument, animation: string, refs: readonly KeyRef[], spec: CurveSpec, label: string): KeyEdit {
  const updates: ChannelUpdate[] = []
  const selection: string[] = []
  for (const { target, channel, indexes, keys } of resolveRefs(document, animation, refs)) {
    if (!channelSpec(channel).curved) continue
    const next = keys.map((key, index) => {
      const segment = segmentOf(keys, index, channelSpec(channel).progress)
      if (!indexes.includes(index) || !segment) return key
      selection.push(keyId({ target, channel, index }))
      const curve: Curve = spec.kind === 'bezier' ? absoluteCurve(spec.handles, segment, curveChannels(channel)) : spec.kind
      return { ...key, curve, raw: null }
    })
    updates.push({ target, channel, keys: next })
  }
  if (selection.length === 0) throw new EditError('請選取後面還有關鍵影格的關鍵影格，才能設定曲線')
  return { command: { label, ops: writeChannels(document, animation, updates) }, selection: refs.map(keyId) }
}

export function updateKeyExtra(document: SkeletonDocument, animation: string, ref: KeyRef, patch: Readonly<Record<string, JsonValue | undefined>>, label: string): KeyEdit {
  const keys = channelKeys(document, animation, ref.target, ref.channel)
  const key = keys[ref.index]
  if (!key) throw new EditError('找不到關鍵影格')
  const extra: JsonObject = { ...key.extra }
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) delete extra[field]
    else extra[field] = value
  }
  if (jsonEqual(extra, key.extra)) return { command: { label, ops: [] }, selection: [keyId(ref)] }
  const next = keys.map((item, index) => (index === ref.index ? { ...item, extra, raw: null } : item))
  return { command: { label, ops: writeChannels(document, animation, [{ target: ref.target, channel: ref.channel, keys: next }]) }, selection: [keyId(ref)] }
}
