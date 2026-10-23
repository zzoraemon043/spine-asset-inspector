import type { Texture } from '@esotericsoftware/spine-core'
import type {
  AssetSource,
  AssetSummary,
  DebugFlag,
  EventRecord,
  MixPair,
  SlotOverride,
  TrackLayer,
  VirtualFile,
} from '@/core/types'
import { SpineInstance, type InstanceEvent } from '@/core/spine/SpineInstance'
import { buildSkeleton } from '@/core/spine/skeletonFactory'
import { summarize } from '@/core/spine/summarize'
import { clampSpeed } from '@/core/playback/timeMath'
import { fitView, panBy as panView, zoomAt, screenToWorld } from '@/core/render/camera'
import { DEMO_SKINS } from '@/core/demo/demoAsset'
import {
  appendEvents,
  patchState,
  pushNotice,
  useInspectorStore,
  type ExportSettings,
  type InspectorState,
  type TransitionConfig,
} from '@/store/inspectorStore'
import { useLiveStore, EMPTY_SNAPSHOT } from '@/store/liveStore'
import { createLayer, DEFAULT_DEBUG, MAX_LAYERS, type BackgroundMode, type ExportKind, type PanelTab, type Selection } from '@/store/defaults'
import type { CancelSignal, ControllerEnvironment, ExportJobContext, ExportJobResult, StageAdapter } from './types'
import type { LoadedAsset } from './features/host'
import { AtlasFeature } from './features/atlasFeature'
import { AudioFeature } from './features/audioFeature'
import { AuditFeature } from './features/auditFeature'
import { EditorFeature, type EditorHost } from './features/editorFeature'
import { GizmoFeature } from './features/gizmoFeature'
import { AnimateFeature } from './features/animateFeature'
import { MeshFeature } from './features/meshFeature'
import { ExportPreviewFeature } from './features/exportPreviewFeature'
import { sanitizeCrop } from '@/core/export/previewDrag'
import { readFiles } from '@/core/assets/browserFiles'
import type { DeleteTarget } from '@/core/editor/deleteCommands'
import { applySetup } from '@/core/gizmo/runtimePose'
import type { SetupPatch } from '@/core/gizmo/types'
import type { PoseOverride } from '@/core/spine/SpineInstance'
import { setBoneTransform } from '@/core/editor/commands'
import type { GizmoMode } from '@/core/gizmo/types'
import { readSkeletonData } from '@/core/editor/serialize'
import type { SkeletonDocument } from '@/core/editor/document'

interface PendingTransition {
  readonly from: string
  readonly to: string
  readonly duration: number
  readonly hold: number
}

const ATTACHMENT_PUBLISH_INTERVAL = 8
const FRAME_SEEK_EPSILON = 1e-6

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function pickInitialSkins(source: AssetSource<unknown>, instance: SpineInstance): string[] {
  const names = instance.data.skins.map((skin) => skin.name)
  if (source.origin === 'demo') return DEMO_SKINS.filter((name) => names.includes(name))
  const defaultSkin = instance.data.defaultSkin
  const others = names.filter((name) => name !== 'default')
  if ((!defaultSkin || defaultSkin.getAttachments().length === 0) && others.length > 0) return [others[0]]
  return []
}

function initialTreeExpansion(summary: AssetSummary): Record<string, boolean> {
  const expanded: Record<string, boolean> = { skeleton: true, bones: true, animations: true, skins: true, constraints: true }
  const depth = new Map<string, number>()
  for (const bone of summary.bones) {
    const level = bone.parent === null ? 0 : (depth.get(bone.parent) ?? 0) + 1
    depth.set(bone.name, level)
    if (summary.bones.length <= 40 || level < 2) expanded[`bone:${bone.name}`] = true
  }
  return expanded
}

function selectionExists(selection: Selection | null, summary: AssetSummary): boolean {
  if (!selection) return true
  if (selection.kind === 'skeleton') return true
  if (selection.kind === 'bone') return summary.bones.some((bone) => bone.name === selection.name)
  if (selection.kind === 'slot') return summary.slots.some((slot) => slot.name === selection.name)
  if (selection.kind === 'attachment') return summary.slots.some((slot) => slot.name === selection.slot && slot.attachments.some((item) => item.name === selection.name))
  if (selection.kind === 'skin') return summary.skins.includes(selection.name)
  if (selection.kind === 'animation') return summary.animations.some((animation) => animation.name === selection.name)
  if (selection.kind === 'constraint') return summary.constraints.some((constraint) => constraint.name === selection.name && constraint.type === selection.group)
  return summary.events.some((event) => event.name === selection.name)
}

function pickInitialAnimation(names: readonly string[]): string | null {
  return names.find((name) => name.toLowerCase() === 'idle') ?? names[0] ?? null
}

export class InspectorController<TImage> {
  private readonly env: ControllerEnvironment<TImage>
  private stage: StageAdapter<TImage> | null = null
  private asset: LoadedAsset<TImage> | null = null
  private files: readonly VirtualFile[] | null = null
  private frameHandle: number | null = null
  private lastFrameTime: number | null = null
  private pendingEvents: EventRecord[] = []
  private eventId = 0
  private pendingTransition: PendingTransition | null = null
  private scrubResume: boolean | null = null
  private exportSignal: CancelSignal | null = null
  private frameCounter = 0
  private fpsWindowStart = 0
  private fpsFrames = 0
  private loadToken = 0
  readonly atlas: AtlasFeature<TImage>
  readonly audio: AudioFeature<TImage>
  readonly audit: AuditFeature<TImage>
  readonly editor: EditorFeature<TImage>
  readonly gizmo: GizmoFeature<TImage>
  readonly animate: AnimateFeature<TImage>
  readonly mesh: MeshFeature<TImage>
  readonly exportPreview: ExportPreviewFeature<TImage>

  constructor(env: ControllerEnvironment<TImage>) {
    this.env = env
    const host: EditorHost<TImage> = {
      env,
      asset: () => this.asset,
      stage: () => this.stage,
      runExport: (kind, job) => this.runJob(kind, job),
      refreshAudit: () => this.audit.refresh(),
      publishLive: () => this.publishLive(true),
      rebuildFromDocument: (document) => this.rebuildFromDocument(document),
    }
    this.atlas = new AtlasFeature(host)
    this.audio = new AudioFeature(host)
    this.audit = new AuditFeature(host)
    this.editor = new EditorFeature(host)
    this.animate = new AnimateFeature({ asset: () => this.asset, editor: this.editor, publishLive: () => this.publishLive(true) })
    this.exportPreview = new ExportPreviewFeature({
      exporter: () => this.env.exporter ?? null,
      context: () => this.exportContext(),
      job: () => {
        const settings = this.state.exportSettings
        if (settings.format === 'frame') return this.outputJob(settings)
        try {
          return this.sequenceJob()
        } catch {
          return null
        }
      },
      pose: () => (this.state.exportSettings.format === 'frame' ? this.instance?.skeleton ?? null : null),
      key: () => `${this.loadToken}:${this.state.editor.revision}:${this.state.activeSkins.join(',')}:${JSON.stringify(this.state.slotOverrides)}:${Object.keys(this.state.regionOverrides).join(',')}`,
    })
    this.mesh = new MeshFeature({ asset: () => this.asset, stage: () => this.stage, animate: this.animate, publishLive: () => this.publishLive(true) })
    this.gizmo = new GizmoFeature({
      asset: () => this.asset,
      stage: () => this.stage,
      target: () => (this.state.setupMode ? 'setup' : this.state.animateMode && !this.state.playing ? 'pose' : null),
      snapshot: (bone) => {
        const instance = this.instance
        if (!instance) return null
        if (this.state.setupMode) {
          const data = instance.data.findBone(bone)
          return data ? { x: data.x, y: data.y, rotation: data.rotation, scaleX: data.scaleX, scaleY: data.scaleY } : null
        }
        return instance.getPoseOverrides().get(bone) ?? null
      },
      preview: (bone, values, snapshot) => this.previewBone(bone, values, snapshot),
      release: (bone, snapshot) => this.releaseBone(bone, snapshot),
      commit: (bone, values, label) =>
        this.state.setupMode ? this.editor.edit((document) => setBoneTransform(document, bone, values, label)) : this.animate.applyPose(bone, values, label),
      selectBone: (name) => this.revealBone(name),
      publishLive: () => this.publishLive(true),
    })
  }

  private get state(): InspectorState {
    return useInspectorStore.getState()
  }

  get instance(): SpineInstance | null {
    return this.asset?.instance ?? null
  }

  attachStage(stage: StageAdapter<TImage>): void {
    this.stage = stage
    this.lastFrameTime = null
    this.scheduleFrame()
  }

  detachStage(): void {
    this.audio.stopSync()
    if (this.frameHandle !== null) this.env.cancelFrame(this.frameHandle)
    this.frameHandle = null
    this.disposeAsset()
    this.stage?.dispose()
    this.stage = null
  }

  private scheduleFrame(): void {
    if (this.frameHandle !== null || !this.stage) return
    this.frameHandle = this.env.requestFrame((time) => {
      this.frameHandle = null
      const delta = this.lastFrameTime === null ? 0 : Math.min(0.1, Math.max(0, (time - this.lastFrameTime) / 1000))
      this.lastFrameTime = time
      this.tick(delta)
      this.measureFps(time)
      this.scheduleFrame()
    })
  }

  private measureFps(time: number): void {
    this.fpsFrames += 1
    if (this.fpsWindowStart === 0) this.fpsWindowStart = time
    const elapsed = time - this.fpsWindowStart
    if (elapsed >= 500) {
      useLiveStore.setState({ renderFps: Math.round((this.fpsFrames * 1000) / elapsed) })
      this.fpsFrames = 0
      this.fpsWindowStart = time
    }
  }

  tick(delta: number): void {
    const asset = this.asset
    if (asset) {
      asset.instance.advance(delta)
      this.processTransition()
    }
    this.flushEvents()
    this.audio.flush()
    this.publishLive()
    if (this.stage) {
      const state = this.state
      this.stage.render({
        skeleton: asset?.instance.skeleton ?? null,
        premultipliedAlpha: asset?.premultipliedAlpha ?? false,
        debug: state.debug,
        highlightSlot: state.selectedSlot ?? (state.selection?.kind === 'slot' ? state.selection.name : state.selection?.kind === 'attachment' ? state.selection.slot ?? null : null),
        highlightBone: state.selection?.kind === 'bone' ? state.selection.name : null,
        showAxes: state.showAxes,
        gizmo: this.gizmo.renderState(),
        mesh: this.mesh.renderState(),
      })
    }
  }

  private processTransition(): void {
    const pending = this.pendingTransition
    const instance = this.instance
    if (!pending || !instance) return
    const current = instance.state.getCurrent(0)
    if (!current || current.animation?.name !== pending.from) {
      this.pendingTransition = null
      return
    }
    if (current.trackTime < pending.hold) return
    this.pendingTransition = null
    instance.setTrack(0, pending.to, { loop: this.state.loop, mixDuration: pending.duration })
    patchState({ animation: pending.to })
  }

  private publishLive(force = false): void {
    const instance = this.instance
    if (!instance) {
      if (force) useLiveStore.setState({ snapshot: EMPTY_SNAPSHOT, attachments: {} })
      return
    }
    this.frameCounter += 1
    const patch: { snapshot: ReturnType<SpineInstance['snapshot']>; attachments?: Record<string, string | null>; zoom?: number } = {
      snapshot: instance.snapshot(),
    }
    if (force || this.frameCounter % ATTACHMENT_PUBLISH_INTERVAL === 0) patch.attachments = instance.currentAttachments()
    if (this.stage) patch.zoom = this.stage.getView().scale
    const selection = this.state.selection
    const bone = selection?.kind === 'bone' ? instance.skeleton.findBone(selection.name) : null
    useLiveStore.setState({
      ...patch,
      bone: bone
        ? {
            x: bone.x,
            y: bone.y,
            rotation: bone.rotation,
            scaleX: bone.scaleX,
            scaleY: bone.scaleY,
            worldX: bone.worldX,
            worldY: bone.worldY,
            worldRotation: bone.getWorldRotationX(),
          }
        : null,
    })
  }

  private recordEvent(event: InstanceEvent): void {
    this.audio.handleEvent(event)
    const state = this.state
    if (!state.eventCapture) return
    if (event.kind !== 'custom' && !state.showLifecycle) return
    this.eventId += 1
    this.pendingEvents.push({ ...event, id: this.eventId, wallTime: this.env.now() })
  }

  private flushEvents(): void {
    if (this.pendingEvents.length === 0) return
    const records = this.pendingEvents
    this.pendingEvents = []
    appendEvents(records)
  }

  private disposeAsset(): void {
    if (!this.asset) return
    this.atlas.disposeAll()
    for (const texture of this.asset.textures) texture.dispose()
    this.env.releaseSource?.(this.asset.source)
    this.asset = null
    this.pendingTransition = null
  }

  async loadDemo(): Promise<boolean> {
    return this.load(() => this.env.createDemoSource(), null)
  }

  async readInput(files: readonly File[]): Promise<VirtualFile[] | null> {
    try {
      return await readFiles(files)
    } catch (error) {
      pushNotice('error', describeError(error))
      return null
    }
  }

  async loadFiles(files: readonly VirtualFile[], preferredSkeleton?: string): Promise<boolean> {
    return this.load(() => this.env.createLocalSource(files, preferredSkeleton), files)
  }

  async switchSkeleton(path: string): Promise<boolean> {
    if (!this.files) return false
    return this.loadFiles(this.files, path)
  }

  private async load(factory: () => Promise<AssetSource<TImage>>, files: readonly VirtualFile[] | null): Promise<boolean> {
    this.loadToken += 1
    const token = this.loadToken
    patchState({ status: 'loading', error: null })
    try {
      const source = await factory()
      if (token !== this.loadToken) return false
      this.applySource(source)
      this.files = files
      const warnings = this.state.asset?.warnings ?? []
      pushNotice(warnings.length > 0 ? 'warning' : 'success', warnings.length > 0 ? `已載入 ${source.name}（${warnings.length} 則警告）` : `已載入 ${source.name}`)
      return true
    } catch (error) {
      if (token !== this.loadToken) return false
      const message = describeError(error)
      patchState({ status: this.asset ? 'ready' : 'error', error: message })
      pushNotice('error', message)
      return false
    }
  }

  applySource(source: AssetSource<TImage>): void {
    const textures: Texture[] = []
    const createTexture = (image: TImage) => {
      if (!this.stage) throw new Error('繪圖舞台尚未就緒')
      const texture = this.stage.createTexture(image)
      textures.push(texture)
      return texture
    }
    let build
    try {
      build = buildSkeleton(source, createTexture)
    } catch (error) {
      for (const texture of textures) texture.dispose()
      throw error
    }
    this.disposeAsset()
    const instance = new SpineInstance(build.data)
    instance.onEvent((event) => this.recordEvent(event))
    this.asset = {
      source,
      instance,
      data: build.data,
      atlas: build.atlas,
      premultipliedAlpha: build.premultipliedAlpha,
      textures,
      version: build.version,
      legacy: build.legacy,
    }
    this.audio.stopSync()
    this.gizmo.reset()
    this.animate.reset()
    this.mesh.reset()
    const summary = this.summarizeAsset(this.asset)
    const skins = pickInitialSkins(source, instance)
    instance.setSkins(skins)
    const names = summary.animations.map((animation) => animation.name)
    const animation = pickInitialAnimation(names)
    const previous = this.state
    instance.setDefaultMix(previous.defaultMix)
    instance.setTimeScale(previous.speed)
    instance.paused = false
    if (animation) instance.setTrack(0, animation, { loop: true, resetPose: true })
    const transitionTo = names.find((name) => name !== animation) ?? animation
    const transition: TransitionConfig = { ...previous.transition, from: animation, to: transitionTo }
    const exportSettings: ExportSettings = { ...previous.exportSettings, animation, fps: summary.fps }
    this.eventId = 0
    this.pendingEvents = []
    patchState({
      status: 'ready',
      error: null,
      asset: summary,
      animation,
      playing: true,
      loop: true,
      mixPairs: [],
      layers: [],
      activeSkins: skins,
      slotOverrides: {},
      selectedSlot: null,
      slotFilter: '',
      eventLog: [],
      transition,
      exportSettings,
      selection: { kind: 'skeleton', name: summary.name },
      treeExpanded: initialTreeExpansion(summary),
      treeFilter: '',
      setupMode: false,
      animateMode: false,
    })
    this.atlas.onAssetLoaded()
    this.editor.onAssetLoaded(build.document, build.documentReason)
    this.audio.autoBind()
    this.audio.resetTriggers()
    this.audit.refresh()
    this.fitView()
    this.publishLive(true)
  }

  private summarizeAsset(asset: LoadedAsset<TImage>): AssetSummary {
    const source = asset.source
    return summarize({
      name: source.name,
      origin: source.origin,
      format: source.skeleton.format,
      fileName: source.skeleton.fileName,
      data: asset.data,
      atlas: asset.atlas,
      version: asset.version,
      upgradedFrom: asset.legacy?.sourceVersion ?? null,
      legacyWarnings: asset.legacy?.warnings ?? [],
      premultipliedAlpha: asset.premultipliedAlpha,
      skeletonCandidates: source.skeletonCandidates,
      warnings: source.warnings,
    })
  }

  private rebuildFromDocument(document: SkeletonDocument): void {
    const asset = this.asset
    if (!asset) throw new Error('尚未載入資產')
    const data = readSkeletonData(document, asset.atlas, asset.source.name)
    const state = this.state
    const time = asset.instance.snapshot().time
    const instance = new SpineInstance(data)
    this.atlas.rebind(data)
    const next: LoadedAsset<TImage> = { ...asset, instance, data }
    this.asset = next
    this.pendingTransition = null
    const summary = this.summarizeAsset(next)
    const names = summary.animations.map((animation) => animation.name)
    const has = (name: string | null): name is string => name !== null && names.includes(name)
    const skins = state.activeSkins.filter((name) => summary.skins.includes(name))
    instance.setSkins(skins)
    instance.setDefaultMix(state.defaultMix)
    instance.setTimeScale(state.speed)
    const mixPairs = state.mixPairs.filter((pair) => has(pair.from) && has(pair.to))
    instance.resetMixes(mixPairs, state.defaultMix)
    const animation = has(state.animation) ? state.animation : pickInitialAnimation(names)
    const layers = state.layers.map((layer) => (layer.animation !== null && !has(layer.animation) ? { ...layer, animation: null } : layer))
    if (state.setupMode) {
      instance.skeleton.setToSetupPose()
    } else if (state.animateMode && animation) {
      instance.setTrack(0, animation, { loop: state.loop, mixDuration: 0, resetPose: true })
      instance.seek(animation === state.animation ? time : 0)
      this.animate.reapply(instance)
    } else {
      if (animation) {
        instance.setTrack(0, animation, { loop: state.loop, mixDuration: 0, resetPose: true })
        instance.seek(animation === state.animation ? time : 0)
      }
      for (const layer of layers) this.applyLayer(null, layer)
    }
    const slotOverrides: Record<string, SlotOverride> = {}
    for (const [slot, override] of Object.entries(state.slotOverrides)) {
      if (!data.findSlot(slot)) continue
      instance.setSlotOverride(slot, override)
      const stored = instance.getSlotOverrides().get(slot)
      if (stored) slotOverrides[slot] = stored
    }
    instance.paused = state.setupMode || (state.animateMode && !state.playing) || !state.playing
    instance.refresh()
    instance.onEvent((event) => this.recordEvent(event))
    const settings = state.exportSettings
    patchState({
      asset: summary,
      animation,
      activeSkins: skins,
      mixPairs,
      layers,
      slotOverrides,
      selectedSlot: state.selectedSlot && data.findSlot(state.selectedSlot) ? state.selectedSlot : null,
      selection: selectionExists(state.selection, summary) ? state.selection : { kind: 'skeleton', name: summary.name },
      transition: { ...state.transition, from: has(state.transition.from) ? state.transition.from : animation, to: has(state.transition.to) ? state.transition.to : animation },
      exportSettings: { ...settings, animation: has(settings.animation) ? settings.animation : animation },
    })
    this.audit.refresh()
    this.publishLive(true)
  }

  private previewBone(bone: string, values: SetupPatch, snapshot: unknown): void {
    const instance = this.instance
    if (!instance) return
    if (this.state.setupMode) {
      applySetup(instance.skeleton, bone, values)
      instance.refresh()
      return
    }
    instance.setPoseOverride(bone, { ...((snapshot as PoseOverride | null) ?? {}), ...values })
  }

  private releaseBone(bone: string, snapshot: unknown): void {
    const instance = this.instance
    if (!instance) return
    if (this.state.setupMode) {
      if (snapshot) applySetup(instance.skeleton, bone, snapshot as SetupPatch)
      instance.refresh()
      return
    }
    instance.setPoseOverride(bone, (snapshot as PoseOverride | null) ?? null)
  }

  setAnimateMode(enabled: boolean): boolean {
    const instance = this.instance
    const state = this.state
    if (!instance || enabled === state.animateMode) return false
    this.gizmo.cancel()
    if (enabled) {
      if (!state.editor.enabled) {
        pushNotice('warning', state.editor.reason ?? '目前的資產無法編輯')
        return false
      }
      if (!state.animation || !instance.hasAnimation(state.animation)) {
        pushNotice('warning', '請先選擇要編輯的動畫')
        return false
      }
      if (state.setupMode) patchState({ setupMode: false })
      this.audio.stopSync()
      this.pendingTransition = null
      const time = instance.snapshot().frame / instance.fps + FRAME_SEEK_EPSILON
      instance.clearAll()
      instance.setTrack(0, state.animation, { loop: state.loop, mixDuration: 0, resetPose: true })
      instance.seek(state.setupMode ? 0 : time)
      instance.paused = true
      patchState({ animateMode: true, playing: false, keySelection: [] })
    } else {
      this.animate.clearPending()
      patchState({ animateMode: false, keySelection: [] })
      for (const layer of state.layers) this.applyLayer(null, layer)
      instance.refresh()
    }
    this.publishLive(true)
    return true
  }

  toggleAnimateMode(): boolean {
    return this.setAnimateMode(!this.state.animateMode)
  }

  setSetupMode(enabled: boolean): boolean {
    const instance = this.instance
    const state = this.state
    if (!instance || enabled === state.setupMode) return false
    this.gizmo.cancel()
    if (enabled) {
      if (!state.editor.enabled) {
        pushNotice('warning', state.editor.reason ?? '目前的資產無法編輯')
        return false
      }
      if (state.animateMode) {
        this.animate.clearPending()
        patchState({ animateMode: false, keySelection: [] })
      }
      this.audio.stopSync()
      this.pendingTransition = null
      instance.clearAll()
      instance.paused = true
      patchState({ setupMode: true, playing: false })
    } else {
      patchState({ setupMode: false })
      instance.skeleton.setToSetupPose()
      if (state.animation && instance.hasAnimation(state.animation)) instance.setTrack(0, state.animation, { loop: state.loop, mixDuration: 0, resetPose: true })
      for (const layer of state.layers) this.applyLayer(null, layer)
      instance.paused = false
      instance.refresh()
      patchState({ playing: true })
    }
    this.publishLive(true)
    return true
  }

  toggleSetupMode(): boolean {
    return this.setSetupMode(!this.state.setupMode)
  }

  setGizmoMode(mode: GizmoMode): void {
    this.gizmo.cancel()
    patchState({ gizmoMode: mode })
  }

  toggleGizmoSnap(): void {
    patchState({ gizmoSnap: !this.state.gizmoSnap })
  }

  revealBone(name: string): void {
    const asset = this.state.asset
    if (!asset) return
    const parents = new Map(asset.bones.map((bone) => [bone.name, bone.parent]))
    const expanded: Record<string, boolean> = { ...this.state.treeExpanded, bones: true }
    let parent = parents.get(name) ?? null
    while (parent) {
      expanded[`bone:${parent}`] = true
      parent = parents.get(parent) ?? null
    }
    patchState({ treeExpanded: expanded })
    this.select({ kind: 'bone', name })
  }

  playSync(): boolean {
    const state = this.state
    if (!this.instance || !state.syncClipId || !state.animation) return false
    this.seek(0)
    this.setPlaying(true)
    this.audio.startSyncAt(0)
    return true
  }

  selectAnimation(name: string): void {
    const instance = this.instance
    if (!instance || !instance.hasAnimation(name)) return
    if (this.state.setupMode) this.setSetupMode(false)
    if (this.state.animateMode) {
      this.gizmo.cancel()
      this.animate.clearPending()
      instance.setTrack(0, name, { loop: this.state.loop, mixDuration: 0, resetPose: true })
      instance.seek(0)
      patchState({ animation: name, keySelection: [], exportSettings: { ...this.state.exportSettings, animation: name } })
      this.publishLive(true)
      return
    }
    const state = this.state
    const hasCurrent = instance.state.getCurrent(0) !== null
    const useMix = state.mixOnSwitch && hasCurrent
    this.pendingTransition = null
    this.audio.stopSync()
    instance.setTrack(0, name, { loop: state.loop, mixDuration: useMix ? undefined : 0, resetPose: !useMix })
    patchState({ animation: name, exportSettings: { ...state.exportSettings, animation: name } })
    this.publishLive(true)
  }

  setPlaying(playing: boolean): void {
    const instance = this.instance
    if (!instance) return
    if (playing && this.state.setupMode) {
      this.setSetupMode(false)
      return
    }
    if (playing && this.state.animateMode) {
      this.gizmo.cancel()
      this.animate.clearPending()
    }
    if (playing) {
      const snapshot = instance.snapshot()
      if (!this.state.loop && snapshot.duration > 0 && snapshot.time >= snapshot.duration - 1e-4) instance.seek(0)
    }
    instance.paused = !playing
    if (!playing) this.audio.stopSync()
    patchState({ playing })
    this.publishLive(true)
  }

  togglePlay(): void {
    this.setPlaying(!this.state.playing)
  }

  setLoop(loop: boolean): void {
    this.instance?.setTrackLoop(0, loop)
    patchState({ loop })
  }

  setSpeed(speed: number): void {
    const value = clampSpeed(speed)
    this.instance?.setTimeScale(value)
    patchState({ speed: value })
  }

  step(frames: number): void {
    const instance = this.instance
    if (!instance) return
    if (this.state.playing) this.setPlaying(false)
    this.animate.clearPending()
    instance.step(frames)
    this.flushEvents()
    this.publishLive(true)
  }

  seek(time: number): void {
    const instance = this.instance
    if (!instance) return
    this.animate.clearPending()
    instance.seek(time)
    this.publishLive(true)
  }

  seekFrame(frame: number): void {
    const instance = this.instance
    if (!instance) return
    this.seek(frame / instance.fps + FRAME_SEEK_EPSILON)
  }

  beginScrub(): void {
    if (this.scrubResume !== null) return
    this.audio.stopSync()
    this.scrubResume = this.state.playing
    if (this.state.playing) this.setPlaying(false)
  }

  endScrub(): void {
    const resume = this.scrubResume
    this.scrubResume = null
    if (resume) this.setPlaying(true)
  }

  setMixOnSwitch(enabled: boolean): void {
    patchState({ mixOnSwitch: enabled })
  }

  setDefaultMix(duration: number): void {
    const value = Math.round(Math.min(2, Math.max(0, duration)) * 100) / 100
    this.instance?.setDefaultMix(value)
    patchState({ defaultMix: value })
  }

  setTransition(patch: Partial<TransitionConfig>): void {
    const next = { ...this.state.transition, ...patch }
    patchState({
      transition: {
        ...next,
        duration: Math.round(Math.min(2, Math.max(0, next.duration)) * 100) / 100,
        hold: Math.round(Math.min(5, Math.max(0, next.hold)) * 100) / 100,
      },
    })
  }

  runTransition(reverse = false): void {
    const instance = this.instance
    const transition = this.state.transition
    const from = reverse ? transition.to : transition.from
    const to = reverse ? transition.from : transition.to
    if (!instance || !from || !to || !instance.hasAnimation(from) || !instance.hasAnimation(to)) return
    this.audio.stopSync()
    instance.setTrack(0, from, { loop: true, mixDuration: 0, resetPose: true })
    instance.paused = false
    this.pendingTransition = { from, to, duration: transition.duration, hold: transition.hold }
    patchState({ animation: from, playing: true })
    this.publishLive(true)
  }

  isTransitionPending(): boolean {
    return this.pendingTransition !== null
  }

  upsertMixPair(pair: MixPair): void {
    const state = this.state
    const duration = Math.round(Math.min(2, Math.max(0, pair.duration)) * 100) / 100
    const pairs = state.mixPairs.filter((item) => !(item.from === pair.from && item.to === pair.to))
    pairs.push({ ...pair, duration })
    this.instance?.resetMixes(pairs, state.defaultMix)
    patchState({ mixPairs: pairs })
  }

  removeMixPair(from: string, to: string): void {
    const state = this.state
    const pairs = state.mixPairs.filter((item) => !(item.from === from && item.to === to))
    this.instance?.resetMixes(pairs, state.defaultMix)
    patchState({ mixPairs: pairs })
  }

  addLayer(): void {
    const state = this.state
    if (!state.asset || state.layers.length >= MAX_LAYERS - 1) return
    const used = new Set(state.layers.map((layer) => layer.index))
    let index = 1
    while (used.has(index)) index += 1
    const names = state.asset.animations.map((animation) => animation.name)
    const preferred = names.find((name) => name.toLowerCase() === 'shoot') ?? null
    const layer: TrackLayer = { ...createLayer(index), animation: preferred }
    this.applyLayer(null, layer)
    patchState({ layers: [...state.layers, layer].sort((a, b) => a.index - b.index) })
  }

  updateLayer(index: number, patch: Partial<Omit<TrackLayer, 'index'>>): void {
    const state = this.state
    const current = state.layers.find((layer) => layer.index === index)
    if (!current) return
    const next: TrackLayer = { ...current, ...patch, alpha: Math.min(1, Math.max(0, patch.alpha ?? current.alpha)) }
    this.applyLayer(current, next)
    patchState({ layers: state.layers.map((layer) => (layer.index === index ? next : layer)) })
  }

  removeLayer(index: number): void {
    const state = this.state
    this.instance?.clearTrack(index, state.defaultMix)
    patchState({ layers: state.layers.filter((layer) => layer.index !== index) })
  }

  restartLayer(index: number): void {
    const layer = this.state.layers.find((item) => item.index === index)
    if (layer) this.applyLayer(null, layer)
  }

  private applyLayer(previous: TrackLayer | null, next: TrackLayer): void {
    const instance = this.instance
    if (!instance) return
    const mix = this.state.defaultMix
    if (!next.enabled || !next.animation) {
      instance.clearTrack(next.index, mix)
      return
    }
    const restart = !previous || previous.animation !== next.animation || !previous.enabled || previous.blend !== next.blend
    if (restart) {
      instance.setTrack(next.index, next.animation, { loop: next.loop, alpha: next.alpha, blend: next.blend, mixDuration: previous ? mix : 0 })
      return
    }
    instance.setTrackLoop(next.index, next.loop)
    instance.setTrackAlpha(next.index, next.alpha)
  }

  setSkins(names: readonly string[]): void {
    const instance = this.instance
    const asset = this.state.asset
    if (!instance || !asset) return
    const ordered = asset.skins.filter((skin) => names.includes(skin))
    instance.setSkins(ordered)
    patchState({ activeSkins: ordered })
    this.audit.refresh()
    this.publishLive(true)
  }

  toggleSkin(name: string): void {
    const active = this.state.activeSkins
    this.setSkins(active.includes(name) ? active.filter((skin) => skin !== name) : [...active, name])
  }

  soloSkin(name: string): void {
    this.setSkins([name])
  }

  private writeOverride(slot: string, override: SlotOverride | null): void {
    const instance = this.instance
    if (!instance) return
    instance.setSlotOverride(slot, override)
    const overrides = { ...this.state.slotOverrides }
    const stored = instance.getSlotOverrides().get(slot)
    if (stored) overrides[slot] = stored
    else delete overrides[slot]
    patchState({ slotOverrides: overrides })
    this.audit.refresh()
    this.publishLive(true)
  }

  setSlotVisible(slot: string, visible: boolean): void {
    const current = this.state.slotOverrides[slot]
    this.writeOverride(slot, { visible, attachment: current?.attachment })
  }

  setSlotAttachment(slot: string, attachment: string | null | undefined): void {
    const current = this.state.slotOverrides[slot]
    this.writeOverride(slot, { visible: current?.visible ?? true, attachment })
  }

  resetSlot(slot: string): void {
    this.writeOverride(slot, null)
  }

  resetAllSlots(): void {
    this.instance?.clearSlotOverrides()
    patchState({ slotOverrides: {} })
    this.audit.refresh()
    this.publishLive(true)
  }

  selectSlot(slot: string | null): void {
    patchState({ selectedSlot: this.state.selectedSlot === slot ? null : slot })
  }

  setSlotFilter(filter: string): void {
    patchState({ slotFilter: filter })
  }

  toggleDebug(flag: DebugFlag): void {
    const debug = this.state.debug
    patchState({ debug: { ...debug, [flag]: !debug[flag] } })
  }

  setAllDebug(enabled: boolean): void {
    const next = Object.fromEntries(Object.keys(DEFAULT_DEBUG).map((key) => [key, enabled])) as unknown as InspectorState['debug']
    patchState({ debug: next })
  }

  setBackground(background: BackgroundMode): void {
    patchState({ background })
  }

  toggleAxes(): void {
    patchState({ showAxes: !this.state.showAxes })
  }

  setActiveTab(tab: PanelTab): void {
    patchState({ activeTab: tab, advancedOpen: true })
  }

  select(selection: Selection | null): void {
    const previous = this.state.selection
    if (previous?.kind !== selection?.kind || previous?.name !== selection?.name || previous?.slot !== selection?.slot) patchState({ meshSelection: [] })
    patchState({ selection })
    if (selection?.kind === 'animation') this.selectAnimation(selection.name)
    this.publishLive(true)
  }

  deletableSelection(): DeleteTarget | null {
    const selection = this.state.selection
    if (!selection || !this.state.editor.enabled) return null
    switch (selection.kind) {
      case 'bone':
      case 'slot':
      case 'skin':
      case 'event':
      case 'animation':
        return { kind: selection.kind, name: selection.name }
      case 'attachment':
        return selection.slot ? { kind: 'attachment', slot: selection.slot, name: selection.name } : null
      case 'constraint':
        return selection.group ? { kind: 'constraint', group: selection.group, name: selection.name } : null
      default:
        return null
    }
  }

  deleteSelection(): boolean {
    const target = this.deletableSelection()
    if (!target || this.gizmo.dragging || this.mesh.dragging) return false
    if (!this.editor.deleteObject(target)) return false
    this.select(null)
    return true
  }

  toggleTreeNode(key: string, expanded?: boolean): void {
    const current = this.state.treeExpanded
    patchState({ treeExpanded: { ...current, [key]: expanded ?? !current[key] } })
  }

  setTreeFilter(filter: string): void {
    patchState({ treeFilter: filter })
  }

  setAdvancedOpen(open: boolean, tab?: PanelTab): void {
    patchState(tab ? { advancedOpen: open, activeTab: tab } : { advancedOpen: open })
  }

  setExportOpen(open: boolean, animation?: string): void {
    const settings = this.state.exportSettings
    patchState({ exportOpen: open, exportSettings: animation ? { ...settings, animation } : settings })
    if (!open) this.exportPreview.close()
  }

  clearEvents(): void {
    this.pendingEvents = []
    patchState({ eventLog: [] })
  }

  setEventCapture(enabled: boolean): void {
    patchState({ eventCapture: enabled })
  }

  setShowLifecycle(enabled: boolean): void {
    patchState({ showLifecycle: enabled })
  }

  setEventFilter(filter: string): void {
    patchState({ eventFilter: filter })
  }

  fitView(): void {
    const stage = this.stage
    const instance = this.instance
    if (!stage) return
    if (!instance) {
      stage.setView({ centerX: 0, centerY: 150, scale: 1 })
      return
    }
    const viewport = stage.viewport
    stage.setView(fitView(instance.focusBounds(), viewport.width > 2 && viewport.height > 2 ? viewport : { width: 960, height: 720 }))
    useLiveStore.setState({ zoom: stage.getView().scale })
  }

  resetZoom(): void {
    const stage = this.stage
    if (!stage) return
    stage.setView({ ...stage.getView(), scale: 1 })
    useLiveStore.setState({ zoom: 1 })
  }

  zoomBy(factor: number, screenX?: number, screenY?: number): void {
    const stage = this.stage
    if (!stage) return
    const viewport = stage.viewport
    const view = zoomAt(stage.getView(), viewport, factor, screenX ?? viewport.width / 2, screenY ?? viewport.height / 2)
    stage.setView(view)
    useLiveStore.setState({ zoom: view.scale })
  }

  panBy(deltaX: number, deltaY: number): void {
    const stage = this.stage
    if (!stage) return
    stage.setView(panView(stage.getView(), deltaX, deltaY))
  }

  updatePointer(screenX: number | null, screenY: number | null): void {
    const stage = this.stage
    if (!stage || screenX === null || screenY === null) {
      useLiveStore.setState({ pointer: null })
      return
    }
    const point = screenToWorld(stage.getView(), stage.viewport, screenX, screenY)
    useLiveStore.setState({ pointer: { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 } })
  }

  updateExportSettings(patch: Partial<ExportSettings>): void {
    const next = { ...this.state.exportSettings, ...patch }
    patchState({
      exportSettings: {
        ...next,
        fps: Math.round(Math.min(120, Math.max(1, next.fps || 1))),
        scale: Math.round(Math.min(8, Math.max(0.1, next.scale || 0.1)) * 100) / 100,
        width: Math.round(Math.min(4096, Math.max(1, next.width || 1))),
        height: Math.round(Math.min(4096, Math.max(1, next.height || 1))),
        padding: Math.round(Math.min(256, Math.max(0, next.padding || 0))),
        loops: Math.round(Math.min(10, Math.max(1, next.loops || 1))),
        startFrame: Math.round(Math.max(0, next.startFrame || 0)),
        endFrame: next.endFrame === null || next.endFrame === undefined || !Number.isFinite(next.endFrame) ? null : Math.round(Math.max(Math.max(0, next.startFrame || 0), next.endFrame)),
        background: next.background && /^#[0-9a-fA-F]{6}$/.test(next.background) ? next.background.toLowerCase() : null,
        columns: Math.round(Math.min(64, Math.max(0, next.columns || 0))),
        align: next.align === 'bottom' ? 'bottom' : 'center',
        offsetX: Math.round(Math.min(4096, Math.max(-4096, next.offsetX || 0))),
        offsetY: Math.round(Math.min(4096, Math.max(-4096, next.offsetY || 0))),
        sizeMode: next.sizeMode === 'fixed' || next.sizeMode === 'crop' ? next.sizeMode : 'scale',
        crop: sanitizeCrop(next.crop),
      },
    })
  }

  supportsWebm(): boolean {
    return this.env.exporter?.supportsWebm() ?? false
  }

  cancelExport(): void {
    if (this.exportSignal) this.exportSignal.cancelled = true
  }

  async exportScreenshot(): Promise<boolean> {
    return this.runExport('screenshot', async (context) => {
      const exporter = this.env.exporter
      const instance = this.instance
      if (!exporter || !instance) throw new Error('匯出功能無法使用')
      const settings = this.state.exportSettings
      return exporter.screenshot(context, instance.skeleton, this.outputJob(settings))
    })
  }

  async exportSequence(): Promise<boolean> {
    return this.runExport('sequence', (context, signal) => {
      const exporter = this.env.exporter
      if (!exporter) throw new Error('匯出功能無法使用')
      return exporter.sequence(context, this.sequenceJob(), (ratio) => this.reportProgress(ratio), signal)
    })
  }

  async exportSheet(): Promise<boolean> {
    return this.runExport('sheet', (context, signal) => {
      const exporter = this.env.exporter
      if (!exporter) throw new Error('匯出功能無法使用')
      return exporter.sheet(context, this.sequenceJob(), (ratio) => this.reportProgress(ratio), signal)
    })
  }

  async exportSelected(): Promise<boolean> {
    const format = this.state.exportSettings.format
    if (format === 'frame') return this.exportScreenshot()
    if (format === 'sheet') return this.exportSheet()
    if (format === 'webm') return this.exportWebm()
    return this.exportSequence()
  }

  async exportWebm(): Promise<boolean> {
    return this.runExport('webm', (context, signal) => {
      const exporter = this.env.exporter
      if (!exporter) throw new Error('匯出功能無法使用')
      if (!exporter.supportsWebm()) throw new Error('此瀏覽器不支援 WebM 錄製')
      return exporter.webm(context, this.sequenceJob(), (ratio) => this.reportProgress(ratio), signal)
    })
  }

  private sequenceJob() {
    const settings = this.state.exportSettings
    const animation = settings.animation ?? this.state.animation
    if (!animation) throw new Error('請先選擇要匯出的動作')
    return { ...this.outputJob(settings), animation, fps: settings.fps, startFrame: settings.startFrame, endFrame: settings.endFrame, loops: settings.loops, columns: settings.columns }
  }

  private outputJob(settings: ExportSettings) {
    return {
      sizeMode: settings.sizeMode,
      scale: settings.scale,
      width: settings.width,
      height: settings.height,
      padding: settings.padding,
      background: settings.background,
      align: settings.align,
      offsetX: settings.offsetX,
      offsetY: settings.offsetY,
      crop: settings.crop,
    }
  }

  private reportProgress(ratio: number): void {
    const status = this.state.exportStatus
    patchState({ exportStatus: { ...status, progress: Math.min(1, Math.max(0, ratio)) } })
  }

  private async runExport(
    kind: ExportKind,
    job: (context: ExportJobContext<TImage>, signal: CancelSignal) => Promise<ExportJobResult>,
  ): Promise<boolean> {
    return this.runJob(kind, (signal) => {
      const context = this.exportContext()
      if (!context) throw new Error('尚未載入資產')
      return job(context, signal)
    })
  }

  private exportContext(): ExportJobContext<TImage> | null {
    const asset = this.asset
    if (!asset) return null
    return {
      source: this.editor.exportSource(asset.source),
      skins: asset.instance.skins,
      overrides: new Map(asset.instance.getSlotOverrides()),
      regionOverrides: this.atlas.overridesForExport(),
    }
  }

  private async runJob(kind: ExportKind, job: (signal: CancelSignal) => Promise<ExportJobResult>): Promise<boolean> {
    const exporter = this.env.exporter
    if (!this.asset || !exporter || this.state.exportStatus.busy) return false
    const signal: CancelSignal = { cancelled: false }
    this.exportSignal = signal
    patchState({ exportStatus: { busy: true, kind, progress: 0, message: null, error: null } })
    try {
      const result = await job(signal)
      exporter.save(result.blob, result.fileName)
      const unit = kind === 'atlas' ? '張碎圖' : kind === 'project' ? '個檔案' : '影格'
      const message = `${result.fileName}（${result.width}x${result.height}，${result.frames} ${unit}）`
      patchState({ exportStatus: { busy: false, kind, progress: 1, message, error: null } })
      pushNotice('success', `匯出完成：${result.fileName}`)
      return true
    } catch (error) {
      const message = describeError(error)
      patchState({ exportStatus: { busy: false, kind, progress: 0, message: null, error: message } })
      pushNotice(signal.cancelled ? 'warning' : 'error', message)
      return false
    } finally {
      this.exportSignal = null
    }
  }
}
