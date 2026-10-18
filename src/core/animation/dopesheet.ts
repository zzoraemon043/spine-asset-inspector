import { isObject, type JsonObject } from '../editor/json'
import type { SkeletonDocument } from '../editor/document'
import { BONE_CHANNELS, channelSpec, curveKindOf, deformTarget, DEFORM_CHANNEL, DRAW_ORDER_CHANNEL, DRAW_ORDER_TARGET, EVENT_CHANNEL, EVENTS_TARGET, parseKeys, SLOT_CHANNELS, type Key } from './channels'
import { keyId } from './keyCommands'

export type RowKind = 'bone' | 'slot' | 'channel' | 'events' | 'drawOrder' | 'constraint'
export type SegmentKind = 'linear' | 'stepped' | 'bezier'

export interface SheetKey {
  readonly id: string
  readonly target: string
  readonly channel: string
  readonly index: number
  readonly time: number
  readonly frame: number
  readonly segment: SegmentKind | null
  readonly label: string | null
}

export interface SheetRow {
  readonly id: string
  readonly kind: RowKind
  readonly target: string
  readonly owner: 'bone' | 'slot' | 'events' | 'drawOrder' | 'ik' | 'transform'
  readonly channel: string | null
  readonly label: string
  readonly depth: number
  readonly keys: readonly SheetKey[]
}

export interface Dopesheet {
  readonly rows: readonly SheetRow[]
  readonly frameCount: number
  readonly keyCount: number
}

export interface DopesheetInput {
  readonly document: SkeletonDocument | null
  readonly animation: string | null
  readonly fps: number
  readonly bones: readonly string[]
  readonly slots: readonly string[]
  readonly extraBones?: readonly string[]
  readonly extraSlots?: readonly string[]
  readonly ikConstraints?: readonly string[]
  readonly transformConstraints?: readonly string[]
  readonly collapsed?: ReadonlySet<string>
}

export function frameOf(time: number, fps: number): number {
  return Math.round(time * fps + 1e-6)
}

export function slotRowId(slot: string): string {
  return `slot:${slot}`
}

function keyLabel(channel: string, key: Key): string | null {
  if (channel === EVENT_CHANNEL) return typeof key.extra.name === 'string' ? key.extra.name : null
  if (channel === 'attachment') return typeof key.extra.name === 'string' ? key.extra.name : '（隱藏）'
  if (channel === DRAW_ORDER_CHANNEL) return Array.isArray(key.extra.offsets) ? `${key.extra.offsets.length} 個插槽改變順序` : '設置順序'
  return null
}

function sheetKeys(target: string, channel: string, raw: JsonObject[keyof JsonObject] | undefined, fps: number): SheetKey[] {
  const keys = parseKeys(channel, raw)
  return keys.map((key, index) => ({
    id: keyId({ target, channel, index }),
    target,
    channel,
    index,
    time: key.time,
    frame: frameOf(key.time, fps),
    segment: index < keys.length - 1 && channelSpec(channel).curved ? curveKindOf(key.curve) : null,
    label: keyLabel(channel, key),
  }))
}

export function buildDopesheet(input: DopesheetInput): Dopesheet {
  const { document, animation, fps } = input
  const collapsed = input.collapsed ?? new Set<string>()
  const animations = document && isObject(document.animations) ? document.animations : null
  const data = animation && animations && isObject(animations[animation]) ? animations[animation] : null
  const rows: SheetRow[] = []
  if (!data) return { rows, frameCount: 0, keyCount: 0 }
  const events = sheetKeys(EVENTS_TARGET, EVENT_CHANNEL, data.events, fps)
  if (events.length > 0) rows.push({ id: 'events', kind: 'events', target: EVENTS_TARGET, owner: 'events', channel: EVENT_CHANNEL, label: '事件', depth: 0, keys: events })
  const drawOrder = sheetKeys(DRAW_ORDER_TARGET, DRAW_ORDER_CHANNEL, data.drawOrder, fps)
  if (drawOrder.length > 0) rows.push({ id: 'draworder', kind: 'drawOrder', target: DRAW_ORDER_TARGET, owner: 'drawOrder', channel: DRAW_ORDER_CHANNEL, label: '繪製順序', depth: 0, keys: drawOrder })
  for (const type of ['ik', 'transform'] as const) {
    const map = isObject(data[type]) ? (data[type] as JsonObject) : {}
    const listed = type === 'ik' ? input.ikConstraints ?? Object.keys(map) : input.transformConstraints ?? Object.keys(map)
    for (const name of listed) {
      if (!Array.isArray(map[name])) continue
      rows.push({ id: `${type}:${name}`, kind: 'constraint', target: name, owner: type, channel: type, label: `${type === 'ik' ? 'IK' : '變換'} ${name}`, depth: 0, keys: sheetKeys(name, type, map[name], fps) })
    }
  }
  const deforms = new Map<string, Array<{ skin: string; attachment: string; raw: JsonObject[keyof JsonObject] }>>()
  if (isObject(data.attachments)) {
    for (const [skin, slotsMap] of Object.entries(data.attachments)) {
      if (!isObject(slotsMap)) continue
      for (const [slot, attachments] of Object.entries(slotsMap)) {
        if (!isObject(attachments)) continue
        for (const [attachment, timelines] of Object.entries(attachments)) {
          if (isObject(timelines) && Array.isArray(timelines.deform)) deforms.set(slot, [...(deforms.get(slot) ?? []), { skin, attachment, raw: timelines.deform }])
        }
      }
    }
  }
  const addGroup = (owner: 'bone' | 'slot', names: readonly string[], extra: readonly string[], map: unknown, channels: readonly string[]) => {
    const timelinesByName = isObject(map) ? map : {}
    for (const name of names) {
      const timelines = isObject(timelinesByName[name]) ? (timelinesByName[name] as JsonObject) : null
      const deformList = owner === 'slot' ? deforms.get(name) ?? [] : []
      if (!timelines && deformList.length === 0 && !extra.includes(name)) continue
      const id = owner === 'bone' ? name : slotRowId(name)
      const deformRows: SheetRow[] = deformList.map((entry) => {
        const target = deformTarget(entry.skin, name, entry.attachment)
        return { id: `${id}:deform:${entry.skin}|${entry.attachment}`, kind: 'channel', target, owner, channel: DEFORM_CHANNEL, label: `變形 ${entry.attachment}`, depth: 1, keys: sheetKeys(target, DEFORM_CHANNEL, entry.raw, fps) }
      })
      const channelRows: SheetRow[] = (timelines ? channels.filter((channel) => Array.isArray(timelines[channel])) : []).map((channel) => ({
        id: `${id}:${channel}`,
        kind: 'channel',
        target: name,
        owner,
        channel,
        label: channelSpec(channel).label,
        depth: 1,
        keys: sheetKeys(name, channel, timelines?.[channel], fps),
      }))
      channelRows.push(...deformRows)
      rows.push({ id, kind: owner, target: name, owner, channel: null, label: name, depth: 0, keys: channelRows.flatMap((row) => row.keys) })
      if (!collapsed.has(id)) rows.push(...channelRows)
    }
  }
  addGroup('bone', input.bones, input.extraBones ?? [], data.bones, BONE_CHANNELS)
  addGroup('slot', input.slots, input.extraSlots ?? [], data.slots, SLOT_CHANNELS)
  const summaries = rows.filter((row) => row.kind !== 'channel')
  const keyCount = summaries.reduce((sum, row) => sum + row.keys.length, 0)
  const frameCount = summaries.reduce((max, row) => row.keys.reduce((inner, key) => Math.max(inner, key.frame), max), 0)
  return { rows, frameCount, keyCount }
}

export function keysInFrameRange(sheet: Dopesheet, rowIds: ReadonlySet<string>, from: number, to: number): string[] {
  const low = Math.min(from, to)
  const high = Math.max(from, to)
  const result = new Set<string>()
  for (const row of sheet.rows) {
    if (!rowIds.has(row.id)) continue
    for (const key of row.keys) if (key.frame >= low && key.frame <= high) result.add(key.id)
  }
  return [...result]
}
