import {
  AnimationState,
  AnimationStateData,
  MixBlend,
  Physics,
  Skeleton,
  Skin,
  type AnimationStateListener,
  type SkeletonData,
  type TrackEntry,
} from '@esotericsoftware/spine-core'
import type {
  Bounds,
  EventKind,
  EventRecord,
  MixBlendMode,
  PlaybackSnapshot,
  SlotOverride,
  TrackRuntimeState,
} from '../types'
import { frameAt, frameCountOf } from '../playback/timeMath'
import { DEFAULT_FPS } from './summarize'
import { attachmentBoxes, focusBounds } from '../render/focusBounds'

export type InstanceEvent = Omit<EventRecord, 'id' | 'wallTime'>

export type InstanceEventHandler = (event: InstanceEvent) => void

export interface TrackOptions {
  readonly loop: boolean
  readonly alpha?: number
  readonly blend?: MixBlendMode
  readonly mixDuration?: number
  readonly resetPose?: boolean
}

export type PoseField = 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY'
export type PoseOverride = Partial<Record<PoseField, number>>

const COMPOSITE_SKIN = '__inspector_composite__'
const LOOP_END_EPSILON = 1e-4

export class SpineInstance {
  readonly data: SkeletonData
  readonly skeleton: Skeleton
  readonly stateData: AnimationStateData
  readonly state: AnimationState
  readonly fps: number
  paused = false
  private readonly handlers = new Set<InstanceEventHandler>()
  private readonly overrides = new Map<string, SlotOverride>()
  private readonly poseOverrides = new Map<string, PoseOverride>()
  private readonly deformOverrides = new Map<string, readonly number[]>()
  private skinNames: readonly string[] = []
  private physics: Physics = Physics.reset

  constructor(data: SkeletonData, fps?: number) {
    this.data = data
    this.fps = fps && fps > 0 ? fps : data.fps > 0 ? data.fps : DEFAULT_FPS
    this.skeleton = new Skeleton(data)
    this.stateData = new AnimationStateData(data)
    this.state = new AnimationState(this.stateData)
    this.state.addListener(this.createListener())
    this.skeleton.setToSetupPose()
    this.skeleton.updateWorldTransform(Physics.reset)
  }

  private createListener(): AnimationStateListener {
    const emit = (kind: EventKind, entry: TrackEntry) => {
      this.dispatch({
        kind,
        name: kind,
        animation: entry.animation?.name ?? '',
        track: entry.trackIndex,
        animationTime: entry.getAnimationTime(),
        intValue: 0,
        floatValue: 0,
        stringValue: '',
        audioPath: null,
        volume: 1,
        balance: 0,
      })
    }
    return {
      start: (entry) => emit('start', entry),
      interrupt: (entry) => emit('interrupt', entry),
      end: (entry) => emit('end', entry),
      complete: (entry) => emit('complete', entry),
      event: (entry, event) =>
        this.dispatch({
          kind: 'custom',
          name: event.data.name,
          animation: entry.animation?.name ?? '',
          track: entry.trackIndex,
          animationTime: event.time,
          intValue: event.intValue,
          floatValue: event.floatValue,
          stringValue: event.stringValue ?? '',
          audioPath: event.data.audioPath || null,
          volume: event.volume,
          balance: event.balance,
        }),
    }
  }

  private dispatch(event: InstanceEvent): void {
    for (const handler of this.handlers) handler(event)
  }

  onEvent(handler: InstanceEventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  hasAnimation(name: string): boolean {
    return this.data.findAnimation(name) !== null
  }

  get skins(): readonly string[] {
    return this.skinNames
  }

  setSkins(names: readonly string[]): void {
    const skins = names.map((name) => this.data.findSkin(name)).filter((skin): skin is Skin => skin !== null)
    this.skinNames = skins.map((skin) => skin.name)
    if (skins.length === 0) {
      this.skeleton.setSkin(null)
    } else if (skins.length === 1) {
      this.skeleton.setSkin(skins[0])
    } else {
      const composite = new Skin(COMPOSITE_SKIN)
      for (const skin of skins) composite.addSkin(skin)
      this.skeleton.setSkin(composite)
    }
    this.skeleton.setSlotsToSetupPose()
    this.refresh()
  }

  setTrack(index: number, animation: string, options: TrackOptions): TrackEntry | null {
    if (!this.hasAnimation(animation)) return null
    if (options.resetPose) this.skeleton.setToSetupPose()
    const entry = this.state.setAnimation(index, animation, options.loop)
    if (options.mixDuration !== undefined) entry.mixDuration = Math.max(0, options.mixDuration)
    entry.alpha = options.alpha ?? 1
    entry.mixBlend = options.blend === 'add' ? MixBlend.add : MixBlend.replace
    if (options.resetPose) this.physics = Physics.reset
    this.refresh()
    return entry
  }

  clearTrack(index: number, mixDuration = 0): void {
    if (!this.state.getCurrent(index)) return
    if (mixDuration > 0) this.state.setEmptyAnimation(index, mixDuration)
    else {
      this.state.clearTrack(index)
      if (index === 0) this.skeleton.setToSetupPose()
    }
    this.refresh()
  }

  clearAll(): void {
    this.state.clearTracks()
    this.skeleton.setToSetupPose()
    this.physics = Physics.reset
    this.refresh()
  }

  setTrackLoop(index: number, loop: boolean): void {
    const entry = this.state.getCurrent(index)
    if (entry) entry.loop = loop
  }

  setTrackAlpha(index: number, alpha: number): void {
    const entry = this.state.getCurrent(index)
    if (entry) entry.alpha = Math.min(1, Math.max(0, alpha))
  }

  setTrackBlend(index: number, blend: MixBlendMode): void {
    const entry = this.state.getCurrent(index)
    if (entry) entry.mixBlend = blend === 'add' ? MixBlend.add : MixBlend.replace
  }

  setTimeScale(scale: number): void {
    this.state.timeScale = Math.max(0, scale)
  }

  get timeScale(): number {
    return this.state.timeScale
  }

  setDefaultMix(duration: number): void {
    this.stateData.defaultMix = Math.max(0, duration)
  }

  setMix(from: string, to: string, duration: number): void {
    if (!this.hasAnimation(from) || !this.hasAnimation(to)) return
    this.stateData.setMix(from, to, Math.max(0, duration))
  }

  resetMixes(pairs: ReadonlyArray<{ from: string; to: string; duration: number }>, defaultMix: number): void {
    this.stateData.animationToMixTime = {}
    this.stateData.defaultMix = Math.max(0, defaultMix)
    for (const pair of pairs) this.setMix(pair.from, pair.to, pair.duration)
  }

  getMix(from: string, to: string): number {
    const a = this.data.findAnimation(from)
    const b = this.data.findAnimation(to)
    if (!a || !b) return this.stateData.defaultMix
    return this.stateData.getMix(a, b)
  }

  setSlotOverride(slotName: string, override: SlotOverride | null): void {
    const slot = this.skeleton.findSlot(slotName)
    if (!slot) return
    if (override === null || (override.visible && override.attachment === undefined)) this.overrides.delete(slotName)
    else this.overrides.set(slotName, override)
    const setup = slot.data.attachmentName
    slot.setAttachment(setup ? this.skeleton.getAttachment(slot.data.index, setup) : null)
    this.refresh()
  }

  clearSlotOverrides(): void {
    const names = [...this.overrides.keys()]
    this.overrides.clear()
    for (const name of names) {
      const slot = this.skeleton.findSlot(name)
      if (!slot) continue
      const setup = slot.data.attachmentName
      slot.setAttachment(setup ? this.skeleton.getAttachment(slot.data.index, setup) : null)
    }
    this.refresh()
  }

  getSlotOverrides(): ReadonlyMap<string, SlotOverride> {
    return this.overrides
  }

  private applyOverrides(): void {
    for (const [slotName, override] of this.overrides) {
      const slot = this.skeleton.findSlot(slotName)
      if (!slot) continue
      if (!override.visible) {
        slot.setAttachment(null)
        continue
      }
      if (override.attachment === undefined) continue
      slot.setAttachment(override.attachment === null ? null : this.skeleton.getAttachment(slot.data.index, override.attachment))
    }
  }

  setPoseOverride(boneName: string, values: PoseOverride | null): void {
    if (values === null || Object.keys(values).length === 0) this.poseOverrides.delete(boneName)
    else this.poseOverrides.set(boneName, { ...values })
    this.refresh()
  }

  clearPoseOverrides(): void {
    if (this.poseOverrides.size === 0) return
    this.poseOverrides.clear()
    this.refresh()
  }

  getPoseOverrides(): ReadonlyMap<string, PoseOverride> {
    return this.poseOverrides
  }

  setDeformOverride(slotName: string, values: readonly number[] | null): void {
    if (values === null) this.deformOverrides.delete(slotName)
    else this.deformOverrides.set(slotName, [...values])
    this.refresh()
  }

  private applyDeformOverrides(): void {
    for (const [name, values] of this.deformOverrides) {
      const slot = this.skeleton.findSlot(name)
      if (!slot) continue
      slot.deform.length = 0
      for (const value of values) slot.deform.push(value)
    }
  }

  private applyPoseOverrides(): void {
    for (const [name, values] of this.poseOverrides) {
      const bone = this.skeleton.findBone(name)
      if (!bone) continue
      for (const field of Object.keys(values) as PoseField[]) {
        const value = values[field]
        if (value !== undefined) bone[field] = value
      }
    }
  }

  private pose(): void {
    this.state.apply(this.skeleton)
    this.applyOverrides()
    this.applyPoseOverrides()
    this.applyDeformOverrides()
    this.skeleton.updateWorldTransform(this.physics)
    this.physics = Physics.update
  }

  advance(delta: number, ignoreTimeScale = false): void {
    const step = this.paused && !ignoreTimeScale ? 0 : Math.max(0, delta)
    const previousScale = this.state.timeScale
    if (ignoreTimeScale) this.state.timeScale = 1
    this.state.update(step)
    if (ignoreTimeScale) this.state.timeScale = previousScale
    this.skeleton.update(ignoreTimeScale ? step : step * previousScale)
    this.pose()
  }

  refresh(): void {
    this.state.update(0)
    this.pose()
  }

  step(frames: number): void {
    if (frames === 0) return
    const current = this.state.getCurrent(0)
    if (frames > 0) {
      this.advance(frames / this.fps, true)
      return
    }
    if (!current) return
    this.seek(Math.max(0, current.getAnimationTime() + frames / this.fps))
  }

  seek(time: number): void {
    const entry = this.state.getCurrent(0)
    if (!entry) return
    const duration = entry.animationEnd - entry.animationStart
    const limit = entry.loop ? Math.max(0, duration - LOOP_END_EPSILON) : Math.max(0, duration)
    const bounded = Math.min(Math.max(0, time), limit)
    const stored = Math.fround(bounded)
    const clamped = stored > bounded && stored <= limit ? stored : bounded
    entry.trackTime = clamped
    entry.trackLast = clamped
    entry.nextTrackLast = clamped
    entry.setAnimationLast(entry.animationStart + clamped)
    if (entry.mixingFrom) entry.mixTime = entry.mixDuration
    this.physics = Physics.reset
    this.refresh()
  }

  private describeTrack(entry: TrackEntry): TrackRuntimeState {
    const duration = entry.animationEnd - entry.animationStart
    const mixing = entry.mixingFrom !== null && entry.mixDuration > 0 && entry.mixTime < entry.mixDuration
    const mixDuration = mixing ? entry.mixDuration : 0
    return {
      index: entry.trackIndex,
      animation: entry.animation?.name ?? null,
      trackTime: entry.trackTime,
      animationTime: entry.getAnimationTime() - entry.animationStart,
      duration,
      loop: entry.loop,
      mixingFrom: mixing ? entry.mixingFrom?.animation?.name ?? null : null,
      mixProgress: mixDuration > 0 ? Math.min(1, entry.mixTime / mixDuration) : 1,
      mixDuration,
    }
  }

  snapshot(): PlaybackSnapshot {
    const tracks: TrackRuntimeState[] = []
    for (const entry of this.state.tracks) if (entry) tracks.push(this.describeTrack(entry))
    const main = tracks.find((track) => track.index === 0)
    const time = main?.animationTime ?? 0
    const duration = main?.duration ?? 0
    return {
      time,
      duration,
      frame: frameAt(time, this.fps),
      frameCount: frameCountOf(duration, this.fps),
      tracks,
    }
  }

  currentAttachments(): Record<string, string | null> {
    const result: Record<string, string | null> = {}
    for (const slot of this.skeleton.slots) result[slot.data.name] = slot.getAttachment()?.name ?? null
    return result
  }

  focusBounds(): Bounds {
    return focusBounds(attachmentBoxes(this.skeleton), this.bounds())
  }

  bounds(): Bounds {
    const rect = this.skeleton.getBoundsRect()
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
      return { x: -100, y: -100, width: 200, height: 200 }
    }
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }
}
