import type { SpineInstance, PoseOverride } from '@/core/spine/SpineInstance'
import type { SetupField, SetupValues } from '@/core/gizmo/types'
import { DEFORM_CHANNEL, DRAW_ORDER_CHANNEL, DRAW_ORDER_TARGET, EVENT_CHANNEL, EVENTS_TARGET, formatColor, KEYABLE_CHANNELS, parseColor, type KeyableChannel } from '@/core/animation/channels'
import { drawOrderOffsets, moveInOrder } from '@/core/animation/drawOrder'
import { deformExtra } from '@/core/animation/meshDeform'
import { channelForField, channelValues } from '@/core/animation/poseKeys'
import { channelKeys, copyKeyRefs, deleteKeys, moveKeyRefs, parseKeyId, pasteKeys, setCurves, setKeys, updateKeyExtra, type ClipKey, type KeyEdit, type KeyRef, type KeyValue } from '@/core/animation/keyCommands'
import type { CurveSpec } from '@/core/animation/curveShape'
import { isObject, type JsonObject, type JsonValue } from '@/core/editor/json'
import { EditError } from '@/core/editor/commands'
import type { SkeletonDocument } from '@/core/editor/document'
import type { EditCommand } from '@/core/editor/session'
import { patchState, pushNotice, useInspectorStore } from '@/store/inspectorStore'
import type { EditorFeature } from './editorFeature'
import type { LoadedAsset } from './host'

export interface AnimateHost<TImage> {
  asset(): LoadedAsset<TImage> | null
  readonly editor: EditorFeature<TImage>
  publishLive(): void
}

export type SelectMode = 'replace' | 'add' | 'toggle'

export class AnimateFeature<TImage> {
  private readonly host: AnimateHost<TImage>
  private readonly pending = new Map<string, PoseOverride>()
  private clip: ClipKey[] = []

  constructor(host: AnimateHost<TImage>) {
    this.host = host
    useInspectorStore.subscribe((state, previous) => {
      if (state.editor.document !== previous.editor.document) this.pruneSelection()
    })
  }

  reset(): void {
    this.pending.clear()
    patchState({ pendingPose: [], keySelection: [] })
  }

  get clipboardSize(): number {
    return this.clip.length
  }

  private instance(): SpineInstance | null {
    return this.host.asset()?.instance ?? null
  }

  private animation(): string | null {
    const state = useInspectorStore.getState()
    return state.animateMode ? state.animation : null
  }

  frameTime(): number {
    const instance = this.instance()
    if (!instance) return 0
    return instance.snapshot().frame / instance.fps
  }

  private setupValues(bone: string): SetupValues | null {
    const data = this.instance()?.data.findBone(bone)
    return data ? { x: data.x, y: data.y, rotation: data.rotation, scaleX: data.scaleX, scaleY: data.scaleY } : null
  }

  poseValues(bone: string): SetupValues | null {
    const pose = this.instance()?.skeleton.findBone(bone)
    return pose ? { x: pose.x, y: pose.y, rotation: pose.rotation, scaleX: pose.scaleX, scaleY: pose.scaleY } : null
  }

  private publishPending(): void {
    patchState({ pendingPose: [...this.pending.keys()] })
  }

  private run(build: (document: SkeletonDocument, animation: string) => KeyEdit, fallbackSelection?: readonly string[]): boolean {
    const animation = this.animation()
    if (!animation) {
      pushNotice('warning', '請先進入動畫模式並選擇動畫')
      return false
    }
    let selection: readonly string[] | null = null
    const ok = this.host.editor.edit((document): EditCommand => {
      const result = build(document, animation)
      selection = result.selection
      return result.command
    })
    if (ok && selection) patchState({ keySelection: [...(selection as readonly string[])] })
    else if (!ok && fallbackSelection) patchState({ keySelection: [...fallbackSelection] })
    return ok
  }

  private itemsFor(bone: string, channels: readonly KeyableChannel[], pose: SetupValues): KeyValue[] {
    const setup = this.setupValues(bone)
    if (!setup) return []
    const time = this.frameTime()
    return channels.map((channel) => ({ target: bone, channel, time, values: channelValues(channel, setup, pose) }))
  }

  private commitKeys(items: readonly KeyValue[], bones: readonly string[], label: string): boolean {
    if (items.length === 0) return false
    const saved = new Map(bones.flatMap((bone) => (this.pending.has(bone) ? [[bone, this.pending.get(bone) as PoseOverride] as const] : [])))
    for (const bone of bones) this.pending.delete(bone)
    const ok = this.run((document, animation) => setKeys(document, animation, items, label))
    if (!ok) for (const [bone, values] of saved) this.pending.set(bone, values)
    this.reapply()
    this.publishPending()
    return ok
  }

  applyPose(bone: string, values: PoseOverride, label: string): boolean {
    const pose = this.poseValues(bone)
    if (!this.animation() || !pose) return false
    const merged: SetupValues = { ...pose, ...values }
    if (useInspectorStore.getState().autoKey) {
      const channels = [...new Set((Object.keys(values) as SetupField[]).map(channelForField))]
      return this.commitKeys(this.itemsFor(bone, channels, merged), [bone], label)
    }
    this.pending.set(bone, { ...this.pending.get(bone), ...values })
    this.instance()?.setPoseOverride(bone, this.pending.get(bone) ?? null)
    this.publishPending()
    this.host.publishLive()
    return true
  }

  keyBones(bones: readonly string[], label: string): boolean {
    const items = bones.flatMap((bone) => {
      const pose = this.poseValues(bone)
      return pose ? this.itemsFor(bone, KEYABLE_CHANNELS, pose) : []
    })
    return this.commitKeys(items, bones, label)
  }

  keySelected(): boolean {
    const selection = useInspectorStore.getState().selection
    if (selection?.kind === 'slot') return this.keySlot(selection.name)
    if (selection?.kind !== 'bone') {
      pushNotice('warning', '請先選取要 K 幀的骨骼或插槽')
      return false
    }
    return this.keyBones([selection.name], `K 幀：${selection.name}`)
  }

  keyAll(): boolean {
    const instance = this.instance()
    if (!instance) return false
    return this.keyBones(
      instance.skeleton.bones.map((bone) => bone.data.name),
      `K 幀：全部骨骼`,
    )
  }

  clearPending(): void {
    if (this.pending.size === 0) return
    this.pending.clear()
    this.instance()?.clearPoseOverrides()
    this.publishPending()
  }

  reapply(instance: SpineInstance | null = this.instance()): void {
    if (!instance) return
    instance.clearPoseOverrides()
    for (const [bone, values] of this.pending) if (instance.skeleton.findBone(bone)) instance.setPoseOverride(bone, values)
  }

  setAutoKey(enabled: boolean): void {
    patchState({ autoKey: enabled })
  }

  selectedRefs(): KeyRef[] {
    return useInspectorStore
      .getState()
      .keySelection.map(parseKeyId)
      .filter((ref): ref is KeyRef => ref !== null)
  }

  selectKeys(ids: readonly string[], mode: SelectMode = 'replace'): void {
    const current = useInspectorStore.getState().keySelection
    let next: string[]
    if (mode === 'replace') next = [...new Set(ids)]
    else if (mode === 'add') next = [...new Set([...current, ...ids])]
    else {
      const set = new Set(current)
      for (const id of ids) {
        if (set.has(id)) set.delete(id)
        else set.add(id)
      }
      next = [...set]
    }
    patchState({ keySelection: next })
  }

  clearSelection(): void {
    if (useInspectorStore.getState().keySelection.length > 0) patchState({ keySelection: [] })
  }

  deleteSelected(): boolean {
    const refs = this.selectedRefs()
    if (refs.length === 0) return false
    return this.run((document, animation) => deleteKeys(document, animation, refs))
  }

  moveSelected(frames: number): boolean {
    const refs = this.selectedRefs()
    const instance = this.instance()
    if (refs.length === 0 || frames === 0 || !instance) return false
    return this.run((document, animation) => moveKeyRefs(document, animation, refs, frames / instance.fps), useInspectorStore.getState().keySelection)
  }

  copySelected(): number {
    const refs = this.selectedRefs()
    const animation = this.animation()
    const document = useInspectorStore.getState().editor.document
    if (refs.length === 0 || !animation || !document) return 0
    this.clip = copyKeyRefs(document, animation, refs)
    patchState({ keyClipboard: this.clip.length })
    pushNotice('info', `已複製 ${this.clip.length} 個關鍵影格`)
    return this.clip.length
  }

  paste(): boolean {
    if (this.clip.length === 0) return false
    const clip = this.clip
    const at = this.frameTime()
    return this.run((document, animation) => pasteKeys(document, animation, clip, at))
  }

  pruneSelection(): void {
    const state = useInspectorStore.getState()
    if (state.keySelection.length === 0) return
    const document = state.editor.document
    const animation = state.animation
    const counts = new Map<string, number>()
    const valid = state.keySelection.filter((id) => {
      const ref = parseKeyId(id)
      if (!ref || !document || !animation) return false
      const key = `${ref.channel}::${ref.target}`
      if (!counts.has(key)) {
        try {
          counts.set(key, channelKeys(document, animation, ref.target, ref.channel).length)
        } catch {
          counts.set(key, 0)
        }
      }
      return ref.index < (counts.get(key) ?? 0)
    })
    if (valid.length !== state.keySelection.length) patchState({ keySelection: valid })
  }

  setCurve(spec: CurveSpec, label: string): boolean {
    const refs = this.selectedRefs()
    if (refs.length === 0) {
      pushNotice('warning', '請先在律動表選取關鍵影格')
      return false
    }
    return this.run((document, animation) => setCurves(document, animation, refs, spec, label), useInspectorStore.getState().keySelection)
  }

  private slotColorItems(slot: string, rgba: readonly number[], time: number, document: SkeletonDocument, animation: string): KeyValue[] {
    const runtime = this.instance()?.skeleton.findSlot(slot)
    const dark = runtime?.darkColor ? [runtime.darkColor.r, runtime.darkColor.g, runtime.darkColor.b] : [0, 0, 0]
    const has = (channel: string) => channelKeys(document, animation, slot, channel).length > 0
    if (has('rgba2')) return [{ target: slot, channel: 'rgba2', time, values: [...rgba, ...dark] }]
    if (has('rgb2')) return [{ target: slot, channel: 'rgb2', time, values: [...rgba.slice(0, 3), ...dark] }]
    if ((has('rgb') || has('alpha')) && !has('rgba')) {
      return [
        { target: slot, channel: 'rgb', time, values: rgba.slice(0, 3) },
        { target: slot, channel: 'alpha', time, values: [rgba[3]] },
      ]
    }
    return [{ target: slot, channel: 'rgba', time, values: [...rgba] }]
  }

  currentSlotColor(slot: string): string | null {
    const color = this.instance()?.skeleton.findSlot(slot)?.color
    return color ? formatColor([color.r, color.g, color.b, color.a]) : null
  }

  currentSlotAttachment(slot: string): string | null {
    return this.instance()?.skeleton.findSlot(slot)?.getAttachment()?.name ?? null
  }

  keySlotColor(slot: string, hex: string): boolean {
    const rgba = parseColor(hex, 4) ?? (parseColor(hex, 3) ? [...(parseColor(hex, 3) as number[]), 1] : null)
    if (!rgba) {
      pushNotice('error', '顏色格式須為 RRGGBB 或 RRGGBBAA')
      return false
    }
    const time = this.frameTime()
    return this.run((document, animation) => setKeys(document, animation, this.slotColorItems(slot, rgba.map((value) => Math.round(value * 255) / 255), time, document, animation), `插槽 ${slot}：顏色 ${formatColor(rgba)}`))
  }

  keySlotAttachment(slot: string, attachment: string | null): boolean {
    const time = this.frameTime()
    return this.run((document, animation) =>
      setKeys(document, animation, [{ target: slot, channel: 'attachment', time, values: [], extra: attachment === null ? {} : { name: attachment } }], `插槽 ${slot}：部件 ${attachment ?? '隱藏'}`),
    )
  }

  keySlot(slot: string): boolean {
    const color = this.currentSlotColor(slot)
    if (!color) return false
    const attachment = this.currentSlotAttachment(slot)
    const time = this.frameTime()
    const rgba = parseColor(color, 4) as number[]
    return this.run((document, animation) =>
      setKeys(
        document,
        animation,
        [{ target: slot, channel: 'attachment', time, values: [], extra: attachment === null ? {} : { name: attachment } }, ...this.slotColorItems(slot, rgba, time, document, animation)],
        `K 幀：插槽 ${slot}`,
      ),
    )
  }

  constraintValues(type: 'ik' | 'transform', name: string): Record<string, number | boolean> | null {
    const skeleton = this.instance()?.skeleton
    if (!skeleton) return null
    if (type === 'ik') {
      const constraint = skeleton.findIkConstraint(name)
      return constraint ? { mix: constraint.mix, softness: constraint.softness, bendPositive: constraint.bendDirection > 0, compress: constraint.compress, stretch: constraint.stretch } : null
    }
    const constraint = skeleton.findTransformConstraint(name)
    return constraint
      ? { mixRotate: constraint.mixRotate, mixX: constraint.mixX, mixY: constraint.mixY, mixScaleX: constraint.mixScaleX, mixScaleY: constraint.mixScaleY, mixShearY: constraint.mixShearY }
      : null
  }

  keyConstraint(type: 'ik' | 'transform', name: string, patch: Readonly<Record<string, number | boolean>> = {}): boolean {
    const current = this.constraintValues(type, name)
    if (!current) {
      pushNotice('error', `找不到限制器：${name}`)
      return false
    }
    const merged = { ...current, ...patch }
    const time = this.frameTime()
    const round = (value: number | boolean) => Math.round(Math.min(type === 'ik' ? 1e9 : 1, Math.max(0, Number(value))) * 1e4) / 1e4
    const item: KeyValue =
      type === 'ik'
        ? {
            target: name,
            channel: 'ik',
            time,
            values: [Math.min(1, round(merged.mix)), round(merged.softness)],
            extra: { ...(merged.bendPositive ? {} : { bendPositive: false }), ...(merged.compress ? { compress: true } : {}), ...(merged.stretch ? { stretch: true } : {}) },
          }
        : { target: name, channel: 'transform', time, values: ['mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY'].map((field) => round(merged[field])) }
    return this.run((document, animation) => setKeys(document, animation, [item], `K 幀：${type === 'ik' ? 'IK' : '變換'}限制器 ${name}`))
  }

  setupDrawOrder(): string[] {
    return this.instance()?.data.slots.map((slot) => slot.name) ?? []
  }

  currentDrawOrder(): string[] {
    return this.instance()?.skeleton.drawOrder.map((slot) => slot.data.name) ?? []
  }

  keyDrawOrder(order: readonly string[], label: string): boolean {
    const offsets = drawOrderOffsets(this.setupDrawOrder(), order)
    const time = this.frameTime()
    const extra: JsonObject = offsets.length > 0 ? { offsets: offsets.map((entry) => ({ slot: entry.slot, offset: entry.offset })) } : {}
    return this.run((document, animation) => setKeys(document, animation, [{ target: DRAW_ORDER_TARGET, channel: DRAW_ORDER_CHANNEL, time, values: [], extra }], label))
  }

  moveDrawOrder(slot: string, delta: number): boolean {
    const current = this.currentDrawOrder()
    const next = moveInOrder(current, slot, delta)
    if (next.every((name, index) => name === current[index])) return false
    return this.keyDrawOrder(next, `繪製順序：${slot} ${delta > 0 ? '往前' : '往後'}`)
  }

  resetDrawOrder(): boolean {
    return this.keyDrawOrder(this.setupDrawOrder(), '繪製順序：還原設置順序')
  }

  keyDeform(target: string, offsets: readonly number[], label: string): boolean {
    const time = this.frameTime()
    return this.run((document, animation) => setKeys(document, animation, [{ target, channel: DEFORM_CHANNEL, time, values: [], extra: deformExtra(offsets) }], label))
  }

  addEvent(name: string): boolean {
    const document = useInspectorStore.getState().editor.document
    const events = document && isObject(document.events) ? document.events : {}
    if (!Object.prototype.hasOwnProperty.call(events, name)) {
      pushNotice('error', `找不到事件定義：${name}`)
      return false
    }
    const time = this.frameTime()
    return this.run((current, animation) => setKeys(current, animation, [{ target: EVENTS_TARGET, channel: EVENT_CHANNEL, time, values: [], extra: { name } }], `新增事件 ${name}`))
  }

  updateEventKey(ref: KeyRef, patch: Readonly<Record<string, JsonValue | undefined>>): boolean {
    if (ref.channel !== EVENT_CHANNEL) return false
    const document = useInspectorStore.getState().editor.document
    const events = document && isObject(document.events) ? document.events : {}
    const name = patch.name
    if (typeof name === 'string' && !Object.prototype.hasOwnProperty.call(events, name)) {
      pushNotice('error', `找不到事件定義：${name}`)
      return false
    }
    for (const [field, value] of Object.entries(patch)) {
      if (field === 'int' && value !== undefined && !(typeof value === 'number' && Number.isInteger(value))) {
        pushNotice('error', '整數欄位不可有小數')
        return false
      }
      if ((field === 'float' || field === 'volume' || field === 'balance') && value !== undefined && !(typeof value === 'number' && Number.isFinite(value))) {
        pushNotice('error', '數值無效')
        return false
      }
    }
    const label = `事件關鍵影格：${Object.keys(patch).join('、')}`
    return this.run((current, animation) => {
      const result = updateKeyExtra(current, animation, ref, patch, label)
      if (result.command.ops.length === 0) throw new EditError('沒有變更')
      return result
    })
  }
}
