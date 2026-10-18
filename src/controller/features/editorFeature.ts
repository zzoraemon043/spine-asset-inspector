import type { AssetSource } from '@/core/types'
import type { SkeletonDocument } from '@/core/editor/document'
import { EditSession, type EditCommand } from '@/core/editor/session'
import { applyOps } from '@/core/editor/patch'
import { serializeDocument } from '@/core/editor/serialize'
import { buildProjectArchive } from '@/core/editor/projectArchive'
import {
  deleteAnimation,
  duplicateAnimation,
  renameAnimation,
  renameBone,
  renameEvent,
  renameSlot,
  setBoneField,
  setEventField,
  setSkeletonFps,
  setSlotAttachment,
  setSlotBlend,
  setSlotColor,
  type BoneNumericField,
  type EventField,
  type SlotColorField,
} from '@/core/editor/commands'
import { sanitizeFileStem } from '@/core/export/exportPlan'
import { deleteObject, type DeleteTarget } from '@/core/editor/deleteCommands'
import { addAnimation, addSkin, addSkinAttachment, removeSkinAttachment, renameSkin, setConstraintField, type ConstraintType, type IkField, type TransformField } from '@/core/editor/structureCommands'
import { EMPTY_EDITOR, patchState, pushNotice, useInspectorStore } from '@/store/inspectorStore'
import type { Selection } from '@/store/defaults'
import type { FeatureHost } from './host'

export interface EditorHost<TImage> extends FeatureHost<TImage> {
  rebuildFromDocument(document: SkeletonDocument): void
}

type Follow = { readonly kind: Selection['kind']; readonly from: string; readonly to: string }

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class EditorFeature<TImage> {
  private readonly host: EditorHost<TImage>
  private session: EditSession | null = null

  constructor(host: EditorHost<TImage>) {
    this.host = host
  }

  get document(): SkeletonDocument | null {
    return this.session?.document ?? null
  }

  get changed(): boolean {
    return (this.session?.state().index ?? 0) !== 0
  }

  onAssetLoaded(document: SkeletonDocument | null, reason: string | null): void {
    this.session = document ? new EditSession(document, { now: () => this.host.env.now() }) : null
    if (!this.session) {
      patchState({ editor: { ...EMPTY_EDITOR, reason } })
      return
    }
    this.publish()
  }

  reset(): void {
    this.session = null
    patchState({ editor: EMPTY_EDITOR })
  }

  private publish(): void {
    const session = this.session
    if (!session) return
    patchState({ editor: { enabled: true, reason: null, document: session.document, ...session.state() } })
  }

  private followAnimation(from: string, to: string): void {
    const state = useInspectorStore.getState()
    const map = (name: string | null) => (name === from ? to : name)
    patchState({
      animation: map(state.animation),
      exportSettings: { ...state.exportSettings, animation: map(state.exportSettings.animation) },
      transition: { ...state.transition, from: map(state.transition.from), to: map(state.transition.to) },
      layers: state.layers.map((layer) => ({ ...layer, animation: map(layer.animation) })),
      mixPairs: state.mixPairs.map((pair) => ({ ...pair, from: map(pair.from) ?? pair.from, to: map(pair.to) ?? pair.to })),
    })
  }

  private followSelection(follow: Follow | undefined): void {
    if (!follow) return
    if (follow.kind === 'animation') this.followAnimation(follow.from, follow.to)
    if (follow.kind === 'skin') {
      const skins = useInspectorStore.getState().activeSkins
      patchState({ activeSkins: skins.map((skin) => (skin === follow.from ? follow.to : skin)) })
    }
    const selection = useInspectorStore.getState().selection
    if (!selection) return
    if (selection.kind === follow.kind && selection.name === follow.from) patchState({ selection: { ...selection, name: follow.to } })
    if (follow.kind === 'slot' && selection.kind === 'attachment' && selection.slot === follow.from) patchState({ selection: { ...selection, slot: follow.to } })
  }

  edit(factory: (document: SkeletonDocument) => EditCommand, follow?: Follow): boolean {
    const session = this.session
    if (!session) {
      pushNotice('warning', useInspectorStore.getState().editor.reason ?? '目前的資產無法編輯')
      return false
    }
    const previous = useInspectorStore.getState()
    try {
      const command = factory(session.document)
      if (command.ops.length === 0) return false
      const next = applyOps(session.document, command.ops).document
      this.followSelection(follow)
      this.host.rebuildFromDocument(next)
      session.execute(command)
      this.publish()
      return true
    } catch (error) {
      patchState({
        selection: previous.selection,
        animation: previous.animation,
        exportSettings: previous.exportSettings,
        transition: previous.transition,
        layers: previous.layers,
        mixPairs: previous.mixPairs,
      })
      pushNotice('error', describe(error))
      return false
    }
  }

  private travel(move: (session: EditSession) => boolean, revert: (session: EditSession) => void): boolean {
    const session = this.session
    if (!session || !move(session)) return false
    try {
      this.host.rebuildFromDocument(session.document)
    } catch (error) {
      revert(session)
      pushNotice('error', describe(error))
      return false
    }
    this.publish()
    return true
  }

  undo(): boolean {
    return this.travel(
      (session) => session.undo(),
      (session) => session.redo(),
    )
  }

  redo(): boolean {
    return this.travel(
      (session) => session.redo(),
      (session) => session.undo(),
    )
  }

  jump(index: number): boolean {
    const origin = this.session?.state().index ?? 0
    return this.travel(
      (session) => session.jump(index),
      (session) => session.jump(origin),
    )
  }

  setBoneField(bone: string, field: BoneNumericField, value: number): boolean {
    return this.edit((document) => setBoneField(document, bone, field, value))
  }

  renameBone(from: string, to: string): boolean {
    return this.edit((document) => renameBone(document, from, to), { kind: 'bone', from, to: to.trim() })
  }

  renameSlot(from: string, to: string): boolean {
    return this.edit((document) => renameSlot(document, from, to), { kind: 'slot', from, to: to.trim() })
  }

  setSlotColor(slot: string, field: SlotColorField, value: string | null): boolean {
    return this.edit((document) => setSlotColor(document, slot, field, value))
  }

  setSlotAttachment(slot: string, attachment: string | null): boolean {
    return this.edit((document) => setSlotAttachment(document, slot, attachment))
  }

  setSlotBlend(slot: string, blend: string): boolean {
    return this.edit((document) => setSlotBlend(document, slot, blend))
  }

  renameEvent(from: string, to: string): boolean {
    return this.edit((document) => renameEvent(document, from, to), { kind: 'event', from, to: to.trim() })
  }

  setEventField(event: string, field: EventField, value: number | string): boolean {
    return this.edit((document) => setEventField(document, event, field, value))
  }

  renameAnimation(from: string, to: string): boolean {
    return this.edit((document) => renameAnimation(document, from, to), { kind: 'animation', from, to: to.trim() })
  }

  duplicateAnimation(name: string): boolean {
    return this.edit((document) => duplicateAnimation(document, name))
  }

  deleteAnimation(name: string): boolean {
    return this.edit((document) => deleteAnimation(document, name))
  }

  addAnimation(name: string): boolean {
    return this.edit((document) => addAnimation(document, name))
  }

  addSkin(name: string): boolean {
    return this.edit((document) => addSkin(document, name))
  }

  renameSkin(from: string, to: string): boolean {
    return this.edit((document) => renameSkin(document, from, to), { kind: 'skin', from, to: to.trim() })
  }

  addSkinAttachment(skin: string, slot: string, name: string, from: string): boolean {
    return this.edit((document) => addSkinAttachment(document, skin, slot, name, from))
  }

  deleteObject(target: DeleteTarget): boolean {
    return this.edit((document) => deleteObject(document, target))
  }

  removeSkinAttachment(skin: string, slot: string, name: string): boolean {
    return this.edit((document) => removeSkinAttachment(document, skin, slot, name))
  }

  setConstraintField(type: ConstraintType, name: string, field: IkField | TransformField, value: number | boolean): boolean {
    return this.edit((document) => setConstraintField(document, type, name, field, value))
  }

  setFps(fps: number): boolean {
    return this.edit((document) => setSkeletonFps(document, fps))
  }

  exportSource(source: AssetSource<TImage>): AssetSource<TImage> {
    const document = this.session?.document
    if (!document || !this.changed) return source
    return { ...source, skeleton: { fileName: source.skeleton.fileName, format: 'json', data: serializeDocument(document) } }
  }

  private stem(): string {
    return sanitizeFileStem(this.host.asset()?.source.name ?? 'skeleton')
  }

  saveJson(): boolean {
    const session = this.session
    const exporter = this.host.env.exporter
    if (!session || !exporter) {
      pushNotice('warning', useInspectorStore.getState().editor.reason ?? '目前無法儲存')
      return false
    }
    const fileName = `${this.stem()}.json`
    exporter.save(new Blob([serializeDocument(session.document)], { type: 'application/json' }), fileName)
    session.markSaved()
    this.publish()
    pushNotice('success', `已儲存 ${fileName}（Spine 4.2 JSON）`)
    return true
  }

  async exportProject(): Promise<boolean> {
    const session = this.session
    if (!session) {
      pushNotice('warning', useInspectorStore.getState().editor.reason ?? '目前無法匯出專案')
      return false
    }
    const saved = await this.host.runExport('project', async () => {
      const asset = this.host.asset()
      if (!asset) throw new Error('尚未載入資產')
      const pages = new Map([...asset.source.pages].map(([name, image]) => [name, this.host.env.imaging.readPixels(image)] as const))
      const stem = this.stem()
      const archive = buildProjectArchive({ stem, document: session.document, atlasText: asset.source.atlasText, pages })
      const first = [...pages.values()][0]
      return {
        blob: new Blob([archive.zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
        fileName: `${stem}_project.zip`,
        width: first?.width ?? 0,
        height: first?.height ?? 0,
        frames: archive.files.length,
      }
    })
    if (saved) {
      session.markSaved()
      this.publish()
    }
    return saved
  }
}
