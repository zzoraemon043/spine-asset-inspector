import { cloneJson, isObject, jsonEqual, type JsonObject, type JsonValue } from './json'
import type { PatchOp } from './patch'
import type { EditCommand } from './session'
import type { SkeletonDocument } from './document'
import { EditError } from './commands'
import { applyDrawOrderOffsets, drawOrderOffsets } from '../animation/drawOrder'

export type ConstraintGroup = 'ik' | 'transform' | 'path' | 'physics'

export type DeleteTarget =
  | { readonly kind: 'bone'; readonly name: string }
  | { readonly kind: 'slot'; readonly name: string }
  | { readonly kind: 'attachment'; readonly slot: string; readonly name: string }
  | { readonly kind: 'constraint'; readonly group: ConstraintGroup; readonly name: string }
  | { readonly kind: 'skin'; readonly name: string }
  | { readonly kind: 'event'; readonly name: string }
  | { readonly kind: 'animation'; readonly name: string }

const CONSTRAINT_GROUPS: readonly ConstraintGroup[] = ['ik', 'transform', 'path', 'physics']
const CONSTRAINT_LABEL: Record<ConstraintGroup, string> = { ik: 'IK 限制器', transform: '變換限制器', path: '路徑限制器', physics: '物理限制器' }
const TOP_LEVEL = ['bones', 'slots', 'ik', 'transform', 'path', 'physics', 'skins', 'events', 'animations'] as const

function list(doc: JsonObject, key: string): JsonObject[] {
  const value = doc[key]
  return Array.isArray(value) ? value.filter(isObject) : []
}

function nameOf(item: JsonObject): string {
  return typeof item.name === 'string' ? item.name : ''
}

function objectAt(parent: JsonObject, key: string): JsonObject | null {
  const value = parent[key]
  return isObject(value) ? value : null
}

function animations(doc: JsonObject): JsonObject[] {
  const map = objectAt(doc, 'animations')
  return map ? Object.values(map).filter(isObject) : []
}

function dropKeys(target: JsonObject | null, names: ReadonlySet<string>): void {
  if (!target) return
  for (const name of names) delete target[name]
}

function pruneEmpty(parent: JsonObject, key: string): void {
  const value = parent[key]
  if (isObject(value) && Object.keys(value).length === 0) delete parent[key]
}

interface AttachmentRef {
  readonly skin: JsonObject
  readonly slot: string
  readonly name: string
  readonly data: JsonObject
}

function attachmentRefs(doc: JsonObject): AttachmentRef[] {
  const result: AttachmentRef[] = []
  for (const skin of list(doc, 'skins')) {
    const attachments = objectAt(skin, 'attachments')
    if (!attachments) continue
    for (const [slot, map] of Object.entries(attachments)) {
      if (!isObject(map)) continue
      for (const [name, data] of Object.entries(map)) if (isObject(data)) result.push({ skin, slot, name, data })
    }
  }
  return result
}

function weightedVertices(data: JsonObject): number[] | null {
  const vertices = data.vertices
  if (!Array.isArray(vertices) || vertices.some((value) => typeof value !== 'number')) return null
  const numbers = vertices as number[]
  const type = data.type ?? 'region'
  if (type === 'mesh') {
    const uvs = Array.isArray(data.uvs) ? data.uvs.length : 0
    return numbers.length > uvs ? numbers : null
  }
  if (type === 'path' || type === 'boundingbox' || type === 'clipping') {
    const count = typeof data.vertexCount === 'number' ? data.vertexCount : 0
    return numbers.length > count * 2 ? numbers : null
  }
  return null
}

function weightedBones(vertices: readonly number[]): number[] {
  const bones: number[] = []
  for (let index = 0; index < vertices.length; ) {
    const count = vertices[index++]
    for (let item = 0; item < count; item++) {
      bones.push(vertices[index])
      index += 4
    }
  }
  return bones
}

function remapWeighted(vertices: readonly number[], map: ReadonlyMap<number, number>): number[] {
  const result = [...vertices]
  for (let index = 0; index < result.length; ) {
    const count = result[index++]
    for (let item = 0; item < count; item++) {
      result[index] = map.get(result[index]) ?? result[index]
      index += 4
    }
  }
  return result
}

function removeConstraints(doc: JsonObject, group: ConstraintGroup, names: ReadonlySet<string>): void {
  if (names.size === 0) return
  if (Array.isArray(doc[group])) doc[group] = list(doc, group).filter((item) => !names.has(nameOf(item)))
  for (const skin of list(doc, 'skins')) {
    const refs = skin[group]
    if (Array.isArray(refs)) skin[group] = refs.filter((value) => typeof value !== 'string' || !names.has(value))
  }
  for (const animation of animations(doc)) {
    dropKeys(objectAt(animation, group), names)
    pruneEmpty(animation, group)
  }
}

function removeAttachments(doc: JsonObject, refs: readonly AttachmentRef[]): void {
  const removed = new Set<AttachmentRef>(refs)
  let changed = true
  while (changed) {
    changed = false
    for (const ref of attachmentRefs(doc)) {
      if ([...removed].some((item) => item.skin === ref.skin && item.slot === ref.slot && item.name === ref.name)) continue
      const parent = typeof ref.data.parent === 'string' ? ref.data.parent : null
      if (!parent || ref.data.type !== 'linkedmesh') continue
      const parentSkin = typeof ref.data.skin === 'string' ? ref.data.skin : 'default'
      if ([...removed].some((item) => item.slot === ref.slot && item.name === parent && nameOf(item.skin) === parentSkin)) {
        removed.add(ref)
        changed = true
      }
    }
  }
  for (const ref of removed) {
    const attachments = objectAt(ref.skin, 'attachments')
    const slotMap = attachments ? objectAt(attachments, ref.slot) : null
    if (!attachments || !slotMap) continue
    delete slotMap[ref.name]
    pruneEmpty(attachments, ref.slot)
    const skinName = nameOf(ref.skin)
    for (const animation of animations(doc)) {
      const deform = objectAt(animation, 'attachments')
      const skin = deform ? objectAt(deform, skinName) : null
      const slot = skin ? objectAt(skin, ref.slot) : null
      if (!deform || !skin || !slot) continue
      delete slot[ref.name]
      pruneEmpty(skin, ref.slot)
      pruneEmpty(deform, skinName)
      pruneEmpty(animation, 'attachments')
    }
  }
  const remaining = attachmentRefs(doc)
  for (const slot of list(doc, 'slots')) {
    const attachment = slot.attachment
    if (typeof attachment !== 'string') continue
    if ([...removed].some((ref) => ref.slot === nameOf(slot) && ref.name === attachment) && !remaining.some((ref) => ref.slot === nameOf(slot) && ref.name === attachment)) delete slot.attachment
  }
}

function rewriteDrawOrder(animation: JsonObject, before: readonly string[], after: readonly string[]): void {
  const keys = animation.drawOrder
  if (!Array.isArray(keys)) return
  const kept = new Set(after)
  for (const key of keys) {
    if (!isObject(key) || !Array.isArray(key.offsets)) continue
    const offsets = key.offsets.filter(isObject).map((entry) => ({ slot: String(entry.slot), offset: Number(entry.offset) }))
    const order = applyDrawOrderOffsets(before, offsets).filter((slot) => kept.has(slot))
    const next = drawOrderOffsets(after, order)
    if (next.length > 0) key.offsets = next.map((entry) => ({ slot: entry.slot, offset: entry.offset }))
    else delete key.offsets
  }
}

function removeSlots(doc: JsonObject, slots: ReadonlySet<string>): void {
  if (slots.size === 0) return
  const before = list(doc, 'slots').map(nameOf)
  removeAttachments(
    doc,
    attachmentRefs(doc).filter((ref) => slots.has(ref.slot)),
  )
  for (const skin of list(doc, 'skins')) dropKeys(objectAt(skin, 'attachments'), slots)
  doc.slots = list(doc, 'slots').filter((slot) => !slots.has(nameOf(slot)))
  const after = before.filter((slot) => !slots.has(slot))
  for (const ref of attachmentRefs(doc)) if (typeof ref.data.end === 'string' && slots.has(ref.data.end)) delete ref.data.end
  removeConstraints(doc, 'path', new Set(list(doc, 'path').filter((item) => typeof item.target === 'string' && slots.has(item.target)).map(nameOf)))
  for (const animation of animations(doc)) {
    dropKeys(objectAt(animation, 'slots'), slots)
    pruneEmpty(animation, 'slots')
    rewriteDrawOrder(animation, before, after)
  }
}

function constraintUsesBones(item: JsonObject, bones: ReadonlySet<string>, group: ConstraintGroup): boolean {
  const members = Array.isArray(item.bones) ? item.bones : []
  if (members.some((bone) => typeof bone === 'string' && bones.has(bone))) return true
  if (typeof item.bone === 'string' && bones.has(item.bone)) return true
  return group !== 'path' && typeof item.target === 'string' && bones.has(item.target)
}

function deleteBones(doc: JsonObject, name: string): string {
  const bones = list(doc, 'bones')
  const index = bones.findIndex((bone) => nameOf(bone) === name)
  if (index < 0) throw new EditError(`找不到骨骼：${name}`)
  if (index === 0 || typeof bones[index].parent !== 'string') throw new EditError('根骨骼不可刪除')
  const removed = new Set([name])
  for (const bone of bones) if (typeof bone.parent === 'string' && removed.has(bone.parent)) removed.add(nameOf(bone))
  const slots = new Set(list(doc, 'slots').filter((slot) => typeof slot.bone === 'string' && removed.has(slot.bone)).map(nameOf))
  const names = bones.map(nameOf)
  const removedIndices = new Set(names.flatMap((bone, position) => (removed.has(bone) ? [position] : [])))
  for (const ref of attachmentRefs(doc)) {
    if (slots.has(ref.slot)) continue
    const vertices = weightedVertices(ref.data)
    if (vertices && weightedBones(vertices).some((bone) => removedIndices.has(bone))) throw new EditError(`部件 ${ref.slot} / ${ref.name} 的網格權重綁定到要刪除的骨骼，請先移除權重或部件`)
  }
  removeSlots(doc, slots)
  for (const group of CONSTRAINT_GROUPS) removeConstraints(doc, group, new Set(list(doc, group).filter((item) => constraintUsesBones(item, removed, group)).map(nameOf)))
  const map = new Map<number, number>()
  let next = 0
  names.forEach((bone, position) => {
    if (!removed.has(bone)) map.set(position, next++)
  })
  for (const ref of attachmentRefs(doc)) {
    const vertices = weightedVertices(ref.data)
    if (vertices) ref.data.vertices = remapWeighted(vertices, map)
  }
  doc.bones = bones.filter((bone) => !removed.has(nameOf(bone)))
  for (const skin of list(doc, 'skins')) if (Array.isArray(skin.bones)) skin.bones = skin.bones.filter((bone) => typeof bone !== 'string' || !removed.has(bone))
  for (const animation of animations(doc)) {
    dropKeys(objectAt(animation, 'bones'), removed)
    pruneEmpty(animation, 'bones')
  }
  const extra = [removed.size > 1 ? `${removed.size - 1} 個子骨骼` : '', slots.size > 0 ? `${slots.size} 個插槽` : ''].filter(Boolean)
  return `刪除骨骼 ${name}${extra.length > 0 ? `（含 ${extra.join('、')}）` : ''}`
}

function deleteSlot(doc: JsonObject, name: string): string {
  if (!list(doc, 'slots').some((slot) => nameOf(slot) === name)) throw new EditError(`找不到插槽：${name}`)
  removeSlots(doc, new Set([name]))
  return `刪除插槽 ${name}`
}

function deleteAttachment(doc: JsonObject, slot: string, name: string): string {
  const refs = attachmentRefs(doc).filter((ref) => ref.slot === slot && ref.name === name)
  if (refs.length === 0) throw new EditError(`找不到部件：${slot} / ${name}`)
  removeAttachments(doc, refs)
  return `刪除部件 ${slot} / ${name}`
}

function deleteConstraint(doc: JsonObject, group: ConstraintGroup, name: string): string {
  if (!list(doc, group).some((item) => nameOf(item) === name)) throw new EditError(`找不到${CONSTRAINT_LABEL[group]}：${name}`)
  removeConstraints(doc, group, new Set([name]))
  return `刪除${CONSTRAINT_LABEL[group]} ${name}`
}

function deleteSkin(doc: JsonObject, name: string): string {
  if (name === 'default') throw new EditError('default 皮膚不可刪除')
  const skins = list(doc, 'skins')
  if (!skins.some((skin) => nameOf(skin) === name)) throw new EditError(`找不到皮膚：${name}`)
  const linked = attachmentRefs(doc).find((ref) => nameOf(ref.skin) !== name && ref.data.type === 'linkedmesh' && ref.data.skin === name)
  if (linked) throw new EditError(`皮膚 ${nameOf(linked.skin)} 的連結網格 ${linked.slot} / ${linked.name} 引用此皮膚，請先移除`)
  doc.skins = skins.filter((skin) => nameOf(skin) !== name)
  for (const animation of animations(doc)) {
    dropKeys(objectAt(animation, 'attachments'), new Set([name]))
    pruneEmpty(animation, 'attachments')
  }
  return `刪除皮膚 ${name}`
}

function deleteEvent(doc: JsonObject, name: string): string {
  const events = objectAt(doc, 'events')
  if (!events || !Object.prototype.hasOwnProperty.call(events, name)) throw new EditError(`找不到事件：${name}`)
  delete events[name]
  for (const animation of animations(doc)) {
    const keys = animation.events
    if (!Array.isArray(keys)) continue
    const kept = keys.filter((key) => !isObject(key) || key.name !== name)
    if (kept.length > 0) animation.events = kept
    else delete animation.events
  }
  return `刪除事件 ${name}`
}

function deleteAnimationEntry(doc: JsonObject, name: string): string {
  const map = objectAt(doc, 'animations')
  if (!map || !Object.prototype.hasOwnProperty.call(map, name)) throw new EditError(`找不到動畫：${name}`)
  delete map[name]
  return `刪除動畫 ${name}`
}

function apply(doc: JsonObject, target: DeleteTarget): string {
  switch (target.kind) {
    case 'bone':
      return deleteBones(doc, target.name)
    case 'slot':
      return deleteSlot(doc, target.name)
    case 'attachment':
      return deleteAttachment(doc, target.slot, target.name)
    case 'constraint':
      return deleteConstraint(doc, target.group, target.name)
    case 'skin':
      return deleteSkin(doc, target.name)
    case 'event':
      return deleteEvent(doc, target.name)
    case 'animation':
      return deleteAnimationEntry(doc, target.name)
  }
}

export function deleteObject(document: SkeletonDocument, target: DeleteTarget): EditCommand {
  const doc = cloneJson(document as JsonValue) as JsonObject
  const label = apply(doc, target)
  const ops: PatchOp[] = []
  for (const key of TOP_LEVEL) {
    const before = (document as JsonObject)[key]
    const after = doc[key]
    if (!jsonEqual(before, after)) ops.push({ kind: 'set', path: [key], value: after })
  }
  return { label, ops }
}
