import { cloneJson, isObject, type JsonObject, type JsonValue } from './json'
import type { PatchOp } from './patch'
import type { EditCommand } from './session'
import type { SkeletonDocument } from './document'
import { EditError, validateName } from './commands'

export const IK_FIELDS = ['mix', 'softness', 'bendPositive', 'compress', 'stretch', 'uniform'] as const
export type IkField = (typeof IK_FIELDS)[number]
export const TRANSFORM_FIELDS = ['mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY'] as const
export type TransformField = (typeof TRANSFORM_FIELDS)[number]
export type ConstraintType = 'ik' | 'transform'

export const CONSTRAINT_FIELD_LABEL: Record<IkField | TransformField, string> = {
  mix: '權重',
  softness: '柔軟度',
  bendPositive: '彎曲方向為正',
  compress: '允許壓縮',
  stretch: '允許伸展',
  uniform: '等比伸展',
  mixRotate: '旋轉權重',
  mixX: 'X 權重',
  mixY: 'Y 權重',
  mixScaleX: '縮放 X 權重',
  mixScaleY: '縮放 Y 權重',
  mixShearY: '斜切 Y 權重',
}

const BOOLEAN_DEFAULTS: Record<string, boolean> = { bendPositive: true, compress: false, stretch: false, uniform: false }

function names(document: SkeletonDocument, key: string): string[] {
  const value = document[key]
  return Array.isArray(value) ? value.filter(isObject).map((item) => (typeof item.name === 'string' ? item.name : '')) : []
}

function indexOfNamed(document: SkeletonDocument, key: string, name: string): number {
  const value = document[key]
  return Array.isArray(value) ? value.findIndex((item) => isObject(item) && item.name === name) : -1
}

export function addAnimation(document: SkeletonDocument, name: string): EditCommand {
  const animations = isObject(document.animations) ? document.animations : null
  const animationName = validateName(name, animations ? Object.keys(animations) : [], '動畫')
  const ops: PatchOp[] = animations
    ? [{ kind: 'set', path: ['animations', animationName], value: {} }]
    : [{ kind: 'set', path: ['animations'], value: { [animationName]: {} } }]
  return { label: `新增動畫 ${animationName}`, ops }
}

export function addSkin(document: SkeletonDocument, name: string): EditCommand {
  const skinName = validateName(name, names(document, 'skins'), '皮膚')
  const skins = document.skins
  const value: JsonObject = { name: skinName, attachments: {} }
  const ops: PatchOp[] = Array.isArray(skins) ? [{ kind: 'insert', path: ['skins', skins.length], value }] : [{ kind: 'set', path: ['skins'], value: [value] }]
  return { label: `新增皮膚 ${skinName}`, ops }
}

export function renameSkin(document: SkeletonDocument, from: string, to: string): EditCommand {
  const index = indexOfNamed(document, 'skins', from)
  if (index < 0) throw new EditError(`找不到皮膚：${from}`)
  if (from === 'default') throw new EditError('default 皮膚不可重新命名')
  const name = validateName(to, names(document, 'skins'), '皮膚', from)
  if (name === 'default') throw new EditError('不可命名為 default')
  if (name === from) return { label: `重新命名皮膚 ${from}`, ops: [] }
  const ops: PatchOp[] = [{ kind: 'set', path: ['skins', index, 'name'], value: name }]
  const skins = Array.isArray(document.skins) ? document.skins : []
  skins.forEach((skin, skinIndex) => {
    if (!isObject(skin) || !isObject(skin.attachments)) return
    for (const [slot, map] of Object.entries(skin.attachments)) {
      if (!isObject(map)) continue
      for (const [attachment, data] of Object.entries(map)) {
        if (isObject(data) && data.skin === from) ops.push({ kind: 'set', path: ['skins', skinIndex, 'attachments', slot, attachment, 'skin'], value: name })
      }
    }
  })
  const animations = isObject(document.animations) ? document.animations : {}
  for (const [animation, data] of Object.entries(animations)) {
    if (isObject(data) && isObject(data.attachments) && Object.prototype.hasOwnProperty.call(data.attachments, from)) {
      ops.push({ kind: 'rename', path: ['animations', animation, 'attachments'], from, to: name })
    }
  }
  return { label: `重新命名皮膚 ${from} 為 ${name}`, ops }
}

export interface AttachmentSource {
  readonly skin: string
  readonly slot: string
  readonly name: string
  readonly data: JsonObject
}

export function attachmentSources(document: SkeletonDocument): AttachmentSource[] {
  const result: AttachmentSource[] = []
  const skins = Array.isArray(document.skins) ? document.skins : []
  for (const skin of skins) {
    if (!isObject(skin) || typeof skin.name !== 'string' || !isObject(skin.attachments)) continue
    for (const [slot, map] of Object.entries(skin.attachments)) {
      if (!isObject(map)) continue
      for (const [name, data] of Object.entries(map)) if (isObject(data)) result.push({ skin: skin.name, slot, name, data })
    }
  }
  return result
}

export function addSkinAttachment(document: SkeletonDocument, skin: string, slot: string, name: string, from: string): EditCommand {
  const index = indexOfNamed(document, 'skins', skin)
  if (index < 0) throw new EditError(`找不到皮膚：${skin}`)
  if (indexOfNamed(document, 'slots', slot) < 0) throw new EditError(`找不到插槽：${slot}`)
  const source = attachmentSources(document).find((item) => item.skin === from && item.slot === slot && item.name === name)
  if (!source) throw new EditError(`找不到部件：${from} / ${slot} / ${name}`)
  const target = (document.skins as JsonValue[])[index] as JsonObject
  const attachments = isObject(target.attachments) ? target.attachments : null
  const slotMap = attachments && isObject(attachments[slot]) ? (attachments[slot] as JsonObject) : null
  if (slotMap && Object.prototype.hasOwnProperty.call(slotMap, name)) throw new EditError(`皮膚 ${skin} 已有部件：${slot} / ${name}`)
  const value = cloneJson(source.data)
  const ops: PatchOp[] = !attachments
    ? [{ kind: 'set', path: ['skins', index, 'attachments'], value: { [slot]: { [name]: value } } }]
    : !slotMap
      ? [{ kind: 'set', path: ['skins', index, 'attachments', slot], value: { [name]: value } }]
      : [{ kind: 'set', path: ['skins', index, 'attachments', slot, name], value }]
  return { label: `皮膚 ${skin}：加入部件 ${slot} / ${name}`, ops }
}

export function removeSkinAttachment(document: SkeletonDocument, skin: string, slot: string, name: string): EditCommand {
  const index = indexOfNamed(document, 'skins', skin)
  if (index < 0) throw new EditError(`找不到皮膚：${skin}`)
  const target = (document.skins as JsonValue[])[index] as JsonObject
  const slotMap = isObject(target.attachments) && isObject(target.attachments[slot]) ? (target.attachments[slot] as JsonObject) : null
  if (!slotMap || !Object.prototype.hasOwnProperty.call(slotMap, name)) throw new EditError(`皮膚 ${skin} 沒有部件：${slot} / ${name}`)
  const ops: PatchOp[] =
    Object.keys(slotMap).length === 1 ? [{ kind: 'set', path: ['skins', index, 'attachments', slot], value: undefined }] : [{ kind: 'set', path: ['skins', index, 'attachments', slot, name], value: undefined }]
  return { label: `皮膚 ${skin}：移除部件 ${slot} / ${name}`, ops }
}

export function setConstraintField(document: SkeletonDocument, type: ConstraintType, constraint: string, field: IkField | TransformField, value: number | boolean): EditCommand {
  const index = indexOfNamed(document, type, constraint)
  if (index < 0) throw new EditError(`找不到${type === 'ik' ? ' IK ' : '變換'}限制器：${constraint}`)
  const allowed: readonly string[] = type === 'ik' ? IK_FIELDS : TRANSFORM_FIELDS
  if (!allowed.includes(field)) throw new EditError(`不支援的限制器欄位：${field}`)
  const entry = (document[type] as JsonValue[])[index] as JsonObject
  let normalized: JsonValue
  if (field in BOOLEAN_DEFAULTS) {
    if (typeof value !== 'boolean') throw new EditError(`${CONSTRAINT_FIELD_LABEL[field]}必須是開或關`)
    normalized = value
  } else {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new EditError(`${CONSTRAINT_FIELD_LABEL[field]}必須是有效數字`)
    if (field !== 'softness' && (value < 0 || value > 1)) throw new EditError(`${CONSTRAINT_FIELD_LABEL[field]}須介於 0 到 1`)
    if (field === 'softness' && value < 0) throw new EditError('柔軟度不可小於 0')
    normalized = value
  }
  const ops: PatchOp[] = entry[field] === normalized ? [] : [{ kind: 'set', path: [type, index, field], value: normalized }]
  return { label: `限制器 ${constraint}：${CONSTRAINT_FIELD_LABEL[field]} ${String(normalized)}`, ops, mergeKey: `constraint:${type}:${constraint}:${field}` }
}
