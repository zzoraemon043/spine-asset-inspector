import type { VirtualFile } from '@/core/types'
import type { InstanceEvent } from '@/core/spine/SpineInstance'
import { computePeaks, detectOnsets } from '@/core/audio/waveform'
import { suggestOffset } from '@/core/audio/alignment'
import { patchState, pushNotice, useInspectorStore, type AudioClipInfo } from '@/store/inspectorStore'
import { SYNC_OFFSET_LIMIT, WAVEFORM_BUCKETS } from '@/store/defaults'
import type { FeatureHost } from './host'

function baseNameOf(path: string | null): string {
  if (!path) return ''
  const name = path.replace(/\\/g, '/').split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  return (dot > 0 ? name.slice(0, dot) : name).toLowerCase()
}

export class AudioFeature<TImage> {
  private readonly host: FeatureHost<TImage>
  private stopSyncSource: (() => void) | null = null
  private pendingTriggers = 0

  constructor(host: FeatureHost<TImage>) {
    this.host = host
  }

  private get state() {
    return useInspectorStore.getState()
  }

  supported(): boolean {
    return this.host.env.audio?.supported() ?? false
  }

  async loadFiles(files: readonly VirtualFile[]): Promise<number> {
    const backend = this.host.env.audio
    if (!backend || !backend.supported()) {
      pushNotice('error', '此瀏覽器不支援 Web Audio')
      return 0
    }
    const loaded: AudioClipInfo[] = []
    for (const file of files) {
      try {
        const decoded = await backend.decode(file.bytes)
        loaded.push({
          id: decoded.handle,
          name: file.name,
          baseName: file.baseName,
          duration: decoded.duration,
          sampleRate: decoded.sampleRate,
          channels: decoded.channels,
          peaks: computePeaks(decoded.samples, WAVEFORM_BUCKETS),
          onsets: detectOnsets(decoded.samples, decoded.sampleRate),
        })
      } catch {
        pushNotice('error', `音效解碼失敗：${file.name}`)
      }
    }
    if (loaded.length === 0) return 0
    const clips = [...this.state.audioClips, ...loaded]
    patchState({ audioClips: clips, syncClipId: this.state.syncClipId ?? loaded[0].id })
    this.autoBind()
    pushNotice('success', `已載入 ${loaded.length} 個音效`)
    return loaded.length
  }

  autoBind(): void {
    const asset = this.host.asset()
    if (!asset) return
    const bindings = { ...this.state.audioBindings }
    const clips = this.state.audioClips
    for (const event of asset.data.events) {
      if (bindings[event.name]) continue
      const audioName = baseNameOf(event.audioPath)
      const match = clips.find((clip) => clip.baseName.toLowerCase() === event.name.toLowerCase() || (audioName && clip.baseName.toLowerCase() === audioName))
      if (match) bindings[event.name] = match.id
    }
    patchState({ audioBindings: bindings })
  }

  removeClip(id: string): void {
    const state = this.state
    if (state.syncClipId === id) this.stopSync()
    this.host.env.audio?.release(id)
    const clips = state.audioClips.filter((clip) => clip.id !== id)
    const bindings = Object.fromEntries(Object.entries(state.audioBindings).filter(([, clip]) => clip !== id))
    patchState({ audioClips: clips, audioBindings: bindings, syncClipId: state.syncClipId === id ? clips[0]?.id ?? null : state.syncClipId })
  }

  setSyncClip(id: string | null): void {
    this.stopSync()
    patchState({ syncClipId: id })
  }

  setSyncOffset(seconds: number): void {
    const value = Math.round(Math.min(SYNC_OFFSET_LIMIT, Math.max(-SYNC_OFFSET_LIMIT, seconds)) * 1000) / 1000
    patchState({ syncOffset: value })
  }

  applySuggestedOffset(): number | null {
    const state = this.state
    const clip = state.audioClips.find((item) => item.id === state.syncClipId)
    const animation = state.asset?.animations.find((item) => item.name === state.animation)
    if (!clip || !animation) return null
    const offset = suggestOffset(animation.events, clip.onsets)
    if (offset !== null) this.setSyncOffset(offset)
    return offset
  }

  bind(eventName: string, clipId: string | null): void {
    const bindings = { ...this.state.audioBindings }
    if (clipId) bindings[eventName] = clipId
    else delete bindings[eventName]
    patchState({ audioBindings: bindings })
  }

  setEnabled(enabled: boolean): void {
    patchState({ audioEnabled: enabled })
  }

  setVolume(volume: number): void {
    patchState({ audioVolume: Math.round(Math.min(2, Math.max(0, volume)) * 100) / 100 })
  }

  preview(id: string): void {
    this.host.env.audio?.play(id, { offset: 0, delay: 0, rate: 1, volume: this.state.audioVolume })
  }

  startSyncAt(animationTime: number): void {
    const backend = this.host.env.audio
    const state = this.state
    const clip = state.syncClipId
    if (!backend || !clip) return
    this.stopSyncSource?.()
    const position = animationTime - state.syncOffset
    const rate = Math.max(0.1, state.speed)
    this.stopSyncSource = backend.play(clip, {
      offset: Math.max(0, position),
      delay: position < 0 ? -position / rate : 0,
      rate,
      volume: state.audioVolume,
    })
    patchState({ syncPlaying: true })
  }

  stopSync(): void {
    this.stopSyncSource?.()
    this.stopSyncSource = null
    if (this.state.syncPlaying) patchState({ syncPlaying: false })
  }

  handleEvent(event: InstanceEvent): void {
    const state = this.state
    if (event.kind === 'complete' && event.track === 0 && state.syncPlaying) {
      if (state.loop) this.startSyncAt(0)
      return
    }
    if (event.kind !== 'custom' || !state.audioEnabled) return
    const clip = state.audioBindings[event.name]
    const backend = this.host.env.audio
    if (!clip || !backend) return
    backend.play(clip, { offset: 0, delay: 0, rate: Math.max(0.1, state.speed), volume: state.audioVolume * (event.volume || 1) })
    this.pendingTriggers += 1
  }

  flush(): void {
    if (this.pendingTriggers === 0) return
    patchState({ audioTriggers: this.state.audioTriggers + this.pendingTriggers })
    this.pendingTriggers = 0
  }

  resetTriggers(): void {
    this.pendingTriggers = 0
    patchState({ audioTriggers: 0 })
  }
}
