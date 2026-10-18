import type { JsonObject } from '../editor/json'
import { roundTime, TIME_EPSILON, type Curve, type Key } from './channels'

export interface Segment {
  readonly t0: number
  readonly t1: number
  readonly v0: readonly number[]
  readonly v1: readonly number[]
}

export interface Entry {
  readonly key: Key
  readonly source: number | null
  readonly segment?: Segment | null
}

export interface Rebuilt {
  readonly keys: Key[]
  readonly positions: number[]
}

function sameCurve(a: Curve, b: Curve): boolean {
  if (a === b) return true
  if (typeof a === 'string' || typeof b === 'string') return false
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function sameKey(a: Key, b: Key): boolean {
  return a.time === b.time && sameCurve(a.curve, b.curve) && a.values.length === b.values.length && a.values.every((value, index) => value === b.values[index])
}

export function replaceKeys(old: readonly Key[], changes: ReadonlyMap<number, Key>): Key[] {
  return old.map((key, index) => changes.get(index) ?? key)
}

const PROGRESS_START: readonly number[] = [0]
const PROGRESS_END: readonly number[] = [1]

export function segmentOf(keys: readonly Key[], index: number, progress = false): Segment | null {
  const key = keys[index]
  const next = keys[index + 1]
  if (!key || !next) return null
  return { t0: key.time, t1: next.time, v0: progress ? PROGRESS_START : key.values, v1: progress ? PROGRESS_END : next.values }
}

function remapCurve(curve: readonly number[], from: Segment, to: Segment): number[] {
  const result = [...curve]
  const span = from.t1 - from.t0
  for (let channel = 0; channel * 4 + 3 < curve.length; channel += 1) {
    const offset = channel * 4
    const fromV0 = from.v0[channel] ?? 0
    const fromV1 = from.v1[channel] ?? 0
    const toV0 = to.v0[channel] ?? 0
    const toV1 = to.v1[channel] ?? 0
    const valueSpan = fromV1 - fromV0
    for (let point = 0; point < 2; point += 1) {
      const cx = curve[offset + point * 2]
      const cy = curve[offset + point * 2 + 1]
      const u = Math.abs(span) < 1e-9 ? (point + 1) / 3 : (cx - from.t0) / span
      const newX = to.t0 + u * (to.t1 - to.t0)
      const newY = Math.abs(valueSpan) < 1e-9 ? toV0 + (toV1 - toV0) * ((point + 1) / 3) + (cy - fromV0) : toV0 + ((cy - fromV0) / valueSpan) * (toV1 - toV0)
      result[offset + point * 2] = Math.round(newX * 1e6) / 1e6
      result[offset + point * 2 + 1] = Math.round(newY * 1e4) / 1e4
    }
  }
  return result
}

function sameSegment(a: Segment, b: Segment): boolean {
  return a.t0 === b.t0 && a.t1 === b.t1 && a.v0.every((value, index) => value === b.v0[index]) && a.v1.every((value, index) => value === b.v1[index])
}

export interface Addition {
  readonly time: number
  readonly values: readonly number[]
  readonly extra?: JsonObject
}

export function rebuildChannel(old: readonly Key[], entries: readonly Entry[], unique = true, progress = false): Rebuilt {
  const indexed = entries.map((entry, order) => ({ entry, order }))
  const sorted = [...indexed].sort((a, b) => a.entry.key.time - b.entry.key.time || a.order - b.order)
  const kept: typeof sorted = []
  for (const item of sorted) {
    const last = kept[kept.length - 1]
    if (unique && last && Math.abs(last.entry.key.time - item.entry.key.time) < TIME_EPSILON) kept[kept.length - 1] = last.order > item.order ? last : item
    else kept.push(item)
  }
  const positions = entries.map(() => -1)
  kept.forEach((item, position) => {
    positions[item.order] = position
  })
  const keys = kept.map((item, position) => {
    const entry = item.entry
    let key = entry.key
    const next = kept[position + 1]?.entry.key
    const from = entry.segment !== undefined ? entry.segment : entry.source !== null ? segmentOf(old, entry.source, progress) : null
    if (typeof key.curve !== 'string' && from && next) {
      const to: Segment = { t0: key.time, t1: next.time, v0: progress ? PROGRESS_START : key.values, v1: progress ? PROGRESS_END : next.values }
      if (!sameSegment(from, to)) key = { ...key, curve: remapCurve(key.curve, from, to), raw: null }
    }
    const original = entry.source !== null ? old[entry.source] : null
    if (key.raw && (!original || !sameKey(key, original))) key = { ...key, raw: null }
    return key
  })
  return { keys, positions }
}

export function upsertKeys(old: readonly Key[], additions: readonly Addition[], unique = true, progress = false): Rebuilt {
  const entries: Entry[] = old.map((key, source) => ({ key, source }))
  const added: number[] = []
  for (const addition of additions) {
    const time = roundTime(addition.time)
    const existing = unique ? old.findIndex((key) => Math.abs(key.time - time) < TIME_EPSILON) : -1
    if (existing >= 0) {
      entries.push({ key: { ...old[existing], values: [...addition.values], extra: addition.extra ?? old[existing].extra, raw: null }, source: existing })
      entries[existing] = { key: { ...old[existing], time: -1 }, source: existing }
    } else {
      entries.push({ key: { time, values: [...addition.values], curve: 'linear', extra: addition.extra ?? {}, raw: null }, source: null })
    }
    added.push(entries.length - 1)
  }
  const filtered = entries.filter((entry) => entry.key.time >= 0)
  const offset = entries.length - filtered.length
  const result = rebuildChannel(old, filtered, unique, progress)
  return { keys: result.keys, positions: added.map((index) => result.positions[index - offset]) }
}

export function removeKeys(old: readonly Key[], indexes: readonly number[], unique = true, progress = false): Key[] {
  const drop = new Set(indexes)
  return rebuildChannel(
    old,
    old.flatMap((key, source) => (drop.has(source) ? [] : [{ key, source }])),
    unique,
    progress,
  ).keys
}

export function moveKeys(old: readonly Key[], indexes: readonly number[], delta: number, unique = true, progress = false): Rebuilt {
  const moving = new Set(indexes)
  const entries: Entry[] = []
  for (let source = 0; source < old.length; source += 1) if (!moving.has(source)) entries.push({ key: old[source], source })
  const start = entries.length
  for (const source of indexes) entries.push({ key: { ...old[source], time: roundTime(old[source].time + delta) }, source })
  const result = rebuildChannel(old, entries, unique, progress)
  return { keys: result.keys, positions: indexes.map((_, index) => result.positions[start + index]) }
}
