import { cloneJson, isObject, type JsonObject, type JsonPath, type JsonValue } from './json'
import type { PatchOp } from './patch'
import type { EditCommand } from './session'
import { namedIndex, type SkeletonDocument } from './document'

export class EditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EditError'
  }
}

export const BONE_NUMERIC_FIELDS = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY', 'length'] as const
export type BoneNumericField = (typeof BONE_NUMERIC_FIELDS)[number]

export const BONE_FIELD_LABEL: Record<BoneNumericField, string> = {
  x: '位置 X',
  y: '位置 Y',
  rotation: '旋轉',
  scaleX: '縮放 X',
  scaleY: '縮放 Y',
  shearX: '斜切 X',
  shearY: '斜切 Y',
  length: '長度',
}

const BONE_DEFAULTS: Record<BoneNumericField, number> = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 0 }

export const EVENT_FIELDS = ['int', 'float', 'string', 'audio', 'volume', 'balance'] as const
export type EventField = (typeof EVENT_FIELDS)[number]

export const EVENT_FIELD_LABEL: Record<EventField, string> = {
  int: '整數',
  float: '小數',
  string: '字串',
  audio: '音效路徑',
  volume: '音量',
  balance: '左右平衡',
}

const EVENT_DEFAULTS: Record<EventField, JsonValue> = { int: 0, float: 0, string: '', audio: '', volume: 1, balance: 0 }

export const BLEND_MODES = ['normal', 'additive', 'multiply', 'screen'] as const
export type BlendModeName = (typeof BLEND_MODES)[number]

export const BLEND_LABEL: Record<BlendModeName, string> = { normal: '一般', additive: '加亮', multiply: '色彩增值', screen: '濾色' }

export type SlotColorField = 'color' | 'dark'

const MAX_NAME_LENGTH = 128

function entries(document: SkeletonDocument, key: string): Array<[number, JsonObject]> {
  const value = document[key]
  if (!Array.isArray(value)) return []
  const result: Array<[number, JsonObject]> = []
  value.forEach((item, index) => {
    if (isObject(item)) result.push([index, item])
  })
  return result
}

function mapEntries(value: JsonValue | undefined): Array<[string, JsonObject]> {
  if (!isObject(value)) return []
  return Object.entries(value).filter((entry): entry is [string, JsonObject] => isObject(entry[1]))
}

function requireEntry(document: SkeletonDocument, key: string, name: string, label: string): [number, JsonObject] {
  const index = namedIndex(document, key, name)
  const list = document[key]
  if (index < 0 || !Array.isArray(list)) throw new EditError(`找不到${label}：${name}`)
  return [index, list[index] as JsonObject]
}

function requireKey(document: SkeletonDocument, key: string, name: string, label: string): JsonObject {
  const map = document[key]
  const value = isObject(map) && Object.prototype.hasOwnProperty.call(map, name) ? map[name] : undefined
  if (!isObject(value)) throw new EditError(`找不到${label}：${name}`)
  return value
}

function requireFinite(value: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new EditError(`${label}必須是有效數字`)
  return value
}

export function validateName(name: string, existing: Iterable<string>, label: string, current?: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new EditError(`${label}名稱不可空白`)
  if (trimmed.length > MAX_NAME_LENGTH) throw new EditError(`${label}名稱過長（上限 ${MAX_NAME_LENGTH} 字）`)
  if (trimmed === current) return trimmed
  for (const item of existing) if (item === trimmed) throw new EditError(`${label}名稱已存在：${trimmed}`)
  return trimmed
}

function names(document: SkeletonDocument, key: string): string[] {
  return entries(document, key).map(([, item]) => (typeof item.name === 'string' ? item.name : ''))
}

function keys(document: SkeletonDocument, key: string): string[] {
  const value = document[key]
  return isObject(value) ? Object.keys(value) : []
}

function setOp(path: JsonPath, value: JsonValue | undefined): PatchOp {
  return { kind: 'set', path, value }
}

function changeField(path: JsonPath, current: JsonValue | undefined, value: JsonValue | undefined, fallback?: JsonValue): PatchOp[] {
  if (current === value) return []
  if (current === undefined && value !== undefined && fallback !== undefined && value === fallback) return []
  return [setOp(path, value)]
}

function replaceField(document: SkeletonDocument, key: string, field: string, from: string, to: string): PatchOp[] {
  return entries(document, key)
    .filter(([, item]) => item[field] === from)
    .map(([index]) => setOp([key, index, field], to))
}

function replaceInLists(document: SkeletonDocument, key: string, field: string, from: string, to: string): PatchOp[] {
  const ops: PatchOp[] = []
  for (const [index, item] of entries(document, key)) {
    const list = item[field]
    if (!Array.isArray(list)) continue
    list.forEach((value, position) => {
      if (value === from) ops.push(setOp([key, index, field, position], to))
    })
  }
  return ops
}

function renameInAnimations(document: SkeletonDocument, group: string, from: string, to: string): PatchOp[] {
  const ops: PatchOp[] = []
  for (const [animation, data] of mapEntries(document.animations)) {
    const timelines = data[group]
    if (isObject(timelines) && Object.prototype.hasOwnProperty.call(timelines, from)) ops.push({ kind: 'rename', path: ['animations', animation, group], from, to })
  }
  return ops
}

export function setBoneField(document: SkeletonDocument, bone: string, field: BoneNumericField, value: number): EditCommand {
  const [index, entry] = requireEntry(document, 'bones', bone, '骨骼')
  const number = requireFinite(value, BONE_FIELD_LABEL[field])
  if (field === 'length' && number < 0) throw new EditError('骨骼長度不可小於 0')
  return {
    label: `骨骼 ${bone}：${BONE_FIELD_LABEL[field]} ${number}`,
    ops: changeField(['bones', index, field], entry[field], number, BONE_DEFAULTS[field]),
    mergeKey: `bone:${bone}:${field}`,
  }
}

export function setBoneTransform(document: SkeletonDocument, bone: string, values: Partial<Record<BoneNumericField, number>>, label?: string): EditCommand {
  const [index, entry] = requireEntry(document, 'bones', bone, '骨骼')
  const ops: PatchOp[] = []
  for (const field of BONE_NUMERIC_FIELDS) {
    const value = values[field]
    if (value === undefined) continue
    const number = requireFinite(value, BONE_FIELD_LABEL[field])
    if (field === 'length' && number < 0) throw new EditError('骨骼長度不可小於 0')
    ops.push(...changeField(['bones', index, field], entry[field], number, BONE_DEFAULTS[field]))
  }
  return { label: label ?? `骨骼 ${bone}：調整變形`, ops }
}

export function renameBone(document: SkeletonDocument, from: string, to: string): EditCommand {
  const [index] = requireEntry(document, 'bones', from, '骨骼')
  const name = validateName(to, names(document, 'bones'), '骨骼', from)
  if (name === from) return { label: `重新命名骨骼 ${from}`, ops: [] }
  const ops: PatchOp[] = [
    setOp(['bones', index, 'name'], name),
    ...replaceField(document, 'bones', 'parent', from, name),
    ...replaceField(document, 'slots', 'bone', from, name),
    ...replaceInLists(document, 'ik', 'bones', from, name),
    ...replaceField(document, 'ik', 'target', from, name),
    ...replaceInLists(document, 'transform', 'bones', from, name),
    ...replaceField(document, 'transform', 'target', from, name),
    ...replaceInLists(document, 'path', 'bones', from, name),
    ...replaceField(document, 'physics', 'bone', from, name),
    ...replaceInLists(document, 'skins', 'bones', from, name),
    ...renameInAnimations(document, 'bones', from, name),
  ]
  return { label: `重新命名骨骼 ${from} 為 ${name}`, ops }
}

function slotAttachmentNames(document: SkeletonDocument, slot: string): Set<string> {
  const result = new Set<string>()
  for (const [, skin] of entries(document, 'skins')) {
    const attachments = skin.attachments
    if (!isObject(attachments)) continue
    const slotMap = attachments[slot]
    if (isObject(slotMap)) for (const name of Object.keys(slotMap)) result.add(name)
  }
  return result
}

export function renameSlot(document: SkeletonDocument, from: string, to: string): EditCommand {
  const [index] = requireEntry(document, 'slots', from, '插槽')
  const name = validateName(to, names(document, 'slots'), '插槽', from)
  if (name === from) return { label: `重新命名插槽 ${from}`, ops: [] }
  const values: PatchOp[] = [setOp(['slots', index, 'name'], name), ...replaceField(document, 'path', 'target', from, name)]
  const renames: PatchOp[] = []
  for (const [skinIndex, skin] of entries(document, 'skins')) {
    for (const [slotKey, slotMap] of mapEntries(skin.attachments)) {
      for (const [attachmentName, attachment] of mapEntries(slotMap)) {
        if (attachment.type === 'clipping' && attachment.end === from) values.push(setOp(['skins', skinIndex, 'attachments', slotKey, attachmentName, 'end'], name))
      }
    }
    const attachments = skin.attachments
    if (isObject(attachments) && Object.prototype.hasOwnProperty.call(attachments, from)) renames.push({ kind: 'rename', path: ['skins', skinIndex, 'attachments'], from, to: name })
  }
  for (const [animation, data] of mapEntries(document.animations)) {
    for (const group of ['attachments', 'deform']) {
      for (const [skinName, skinMap] of mapEntries(data[group])) {
        if (Object.prototype.hasOwnProperty.call(skinMap, from)) renames.push({ kind: 'rename', path: ['animations', animation, group, skinName], from, to: name })
      }
    }
    for (const group of ['drawOrder', 'draworder']) {
      const keysList = data[group]
      if (!Array.isArray(keysList)) continue
      keysList.forEach((key, keyIndex) => {
        if (!isObject(key) || !Array.isArray(key.offsets)) return
        key.offsets.forEach((offset, offsetIndex) => {
          if (isObject(offset) && offset.slot === from) values.push(setOp(['animations', animation, group, keyIndex, 'offsets', offsetIndex, 'slot'], name))
        })
      })
    }
  }
  renames.push(...renameInAnimations(document, 'slots', from, name))
  return { label: `重新命名插槽 ${from} 為 ${name}`, ops: [...values, ...renames] }
}

export function setSlotColor(document: SkeletonDocument, slot: string, field: SlotColorField, value: string | null): EditCommand {
  const [index, entry] = requireEntry(document, 'slots', slot, '插槽')
  const pattern = field === 'color' ? /^[0-9a-f]{8}$/ : /^[0-9a-f]{6}$/
  const normalized = value === null ? null : value.trim().replace(/^#/, '').toLowerCase()
  if (normalized !== null && !pattern.test(normalized)) throw new EditError(field === 'color' ? '顏色格式須為 RRGGBBAA（8 位十六進位）' : '暗色格式須為 RRGGBB（6 位十六進位）')
  const label = field === 'color' ? '顏色' : '暗色'
  return {
    label: `插槽 ${slot}：${label} ${normalized ?? '清除'}`,
    ops: changeField(['slots', index, field], entry[field], normalized ?? undefined, field === 'color' ? 'ffffffff' : undefined),
    mergeKey: `slot:${slot}:${field}`,
  }
}

export function setSlotAttachment(document: SkeletonDocument, slot: string, attachment: string | null): EditCommand {
  const [index, entry] = requireEntry(document, 'slots', slot, '插槽')
  if (attachment !== null && !slotAttachmentNames(document, slot).has(attachment)) throw new EditError(`插槽 ${slot} 沒有部件：${attachment}`)
  return {
    label: `插槽 ${slot}：預設部件 ${attachment ?? '無'}`,
    ops: changeField(['slots', index, 'attachment'], entry.attachment, attachment ?? undefined),
  }
}

export function setSlotBlend(document: SkeletonDocument, slot: string, blend: string): EditCommand {
  const [index, entry] = requireEntry(document, 'slots', slot, '插槽')
  if (!(BLEND_MODES as readonly string[]).includes(blend)) throw new EditError(`不支援的混合模式：${blend}`)
  return {
    label: `插槽 ${slot}：混合模式 ${BLEND_LABEL[blend as BlendModeName]}`,
    ops: changeField(['slots', index, 'blend'], entry.blend, blend, 'normal'),
  }
}

export function renameEvent(document: SkeletonDocument, from: string, to: string): EditCommand {
  requireKey(document, 'events', from, '事件')
  const name = validateName(to, keys(document, 'events'), '事件', from)
  if (name === from) return { label: `重新命名事件 ${from}`, ops: [] }
  const ops: PatchOp[] = [{ kind: 'rename', path: ['events'], from, to: name }]
  for (const [animation, data] of mapEntries(document.animations)) {
    const keysList = data.events
    if (!Array.isArray(keysList)) continue
    keysList.forEach((key, keyIndex) => {
      if (isObject(key) && key.name === from) ops.push(setOp(['animations', animation, 'events', keyIndex, 'name'], name))
    })
  }
  return { label: `重新命名事件 ${from} 為 ${name}`, ops }
}

export function setEventField(document: SkeletonDocument, event: string, field: EventField, value: number | string): EditCommand {
  const entry = requireKey(document, 'events', event, '事件')
  let normalized: JsonValue
  if (field === 'string' || field === 'audio') {
    if (typeof value !== 'string') throw new EditError(`${EVENT_FIELD_LABEL[field]}必須是文字`)
    normalized = value
  } else {
    const number = requireFinite(Number(value), EVENT_FIELD_LABEL[field])
    if (field === 'int' && !Number.isInteger(number)) throw new EditError('整數欄位不可有小數')
    if (field === 'volume' && number < 0) throw new EditError('音量不可小於 0')
    if (field === 'balance' && (number < -1 || number > 1)) throw new EditError('左右平衡須介於 -1 到 1')
    normalized = number
  }
  return {
    label: `事件 ${event}：${EVENT_FIELD_LABEL[field]} ${String(normalized)}`,
    ops: changeField(['events', event, field], entry[field], normalized, EVENT_DEFAULTS[field]),
    mergeKey: `event:${event}:${field}`,
  }
}

export function renameAnimation(document: SkeletonDocument, from: string, to: string): EditCommand {
  requireKey(document, 'animations', from, '動畫')
  const name = validateName(to, keys(document, 'animations'), '動畫', from)
  if (name === from) return { label: `重新命名動畫 ${from}`, ops: [] }
  return { label: `重新命名動畫 ${from} 為 ${name}`, ops: [{ kind: 'rename', path: ['animations'], from, to: name }] }
}

export function uniqueName(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing)
  if (!taken.has(base)) return base
  let index = 2
  while (taken.has(`${base} ${index}`)) index += 1
  return `${base} ${index}`
}

export function duplicateAnimation(document: SkeletonDocument, name: string, target?: string): EditCommand {
  const data = requireKey(document, 'animations', name, '動畫')
  const existing = keys(document, 'animations')
  const copyName = target === undefined ? uniqueName(`${name} 複本`, existing) : validateName(target, existing, '動畫')
  return {
    label: `複製動畫 ${name} 為 ${copyName}`,
    ops: [{ kind: 'set', path: ['animations', copyName], value: cloneJson(data), position: existing.indexOf(name) + 1 }],
  }
}

export function deleteAnimation(document: SkeletonDocument, name: string): EditCommand {
  requireKey(document, 'animations', name, '動畫')
  return { label: `刪除動畫 ${name}`, ops: [setOp(['animations', name], undefined)] }
}

export function setSkeletonFps(document: SkeletonDocument, fps: number): EditCommand {
  const number = requireFinite(fps, '影格速率')
  if (number <= 0 || number > 240) throw new EditError('影格速率須介於 1 到 240')
  const skeleton = document.skeleton
  const ops: PatchOp[] = isObject(skeleton)
    ? changeField(['skeleton', 'fps'], skeleton.fps, number)
    : [{ kind: 'set', path: ['skeleton'], value: { fps: number }, position: 0 }]
  return { label: `骨架影格速率 ${number}`, ops, mergeKey: 'skeleton:fps' }
}
