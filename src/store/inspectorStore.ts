import { create } from 'zustand'
import type {
  AssetSummary,
  DebugFlags,
  EventRecord,
  MixPair,
  SlotOverride,
  TrackLayer,
} from '@/core/types'
import type { AtlasInfo } from '@/core/atlas/atlasModel'
import type { AuditReport } from '@/core/audit/performanceAudit'
import type { WaveformPeaks } from '@/core/audio/waveform'
import type { SkeletonDocument } from '@/core/editor/document'
import type { HistoryItem } from '@/core/editor/session'
import type { GizmoMode } from '@/core/gizmo/types'
import {
  DEFAULT_DEBUG,
  DEFAULT_MIX,
  EVENT_LOG_LIMIT,
  type BackgroundMode,
  type ExportFormat,
  type ExportKind,
  type PanelTab,
  type Selection,
} from './defaults'

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface TransitionConfig {
  readonly from: string | null
  readonly to: string | null
  readonly duration: number
  readonly hold: number
}

export interface ExportSettings {
  readonly format: ExportFormat
  readonly fps: number
  readonly sizeMode: 'scale' | 'fixed' | 'crop'
  readonly scale: number
  readonly width: number
  readonly height: number
  readonly padding: number
  readonly loops: number
  readonly animation: string | null
  readonly startFrame: number
  readonly endFrame: number | null
  readonly background: string | null
  readonly columns: number
  readonly align: 'center' | 'bottom'
  readonly offsetX: number
  readonly offsetY: number
  readonly crop: CropRect | null
}

export interface CropRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface ExportPreviewState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly frame: number
  readonly error: string | null
}

export interface ExportStatus {
  readonly busy: boolean
  readonly kind: ExportKind | null
  readonly progress: number
  readonly message: string | null
  readonly error: string | null
}

export type NoticeLevel = 'info' | 'success' | 'warning' | 'error'

export interface Notice {
  readonly id: number
  readonly level: NoticeLevel
  readonly text: string
}

export interface RegionOverrideInfo {
  readonly fileName: string
  readonly width: number
  readonly height: number
  readonly attachments: number
}

export interface AudioClipInfo {
  readonly id: string
  readonly name: string
  readonly baseName: string
  readonly duration: number
  readonly sampleRate: number
  readonly channels: number
  readonly peaks: WaveformPeaks
  readonly onsets: readonly number[]
}

export interface EditorState {
  readonly enabled: boolean
  readonly reason: string | null
  readonly document: SkeletonDocument | null
  readonly revision: number
  readonly dirty: boolean
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly undoLabel: string | null
  readonly redoLabel: string | null
  readonly entries: readonly HistoryItem[]
  readonly index: number
  readonly savedIndex: number | null
}

export const EMPTY_EDITOR: EditorState = {
  enabled: false,
  reason: null,
  document: null,
  revision: 0,
  dirty: false,
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  entries: [],
  index: 0,
  savedIndex: 0,
}

export interface InspectorState {
  status: LoadStatus
  error: string | null
  asset: AssetSummary | null
  animation: string | null
  playing: boolean
  loop: boolean
  speed: number
  mixOnSwitch: boolean
  defaultMix: number
  transition: TransitionConfig
  mixPairs: MixPair[]
  layers: TrackLayer[]
  activeSkins: string[]
  slotOverrides: Record<string, SlotOverride>
  selectedSlot: string | null
  slotFilter: string
  debug: DebugFlags
  showAxes: boolean
  background: BackgroundMode
  eventLog: EventRecord[]
  eventFilter: string
  eventCapture: boolean
  showLifecycle: boolean
  activeTab: PanelTab
  exportSettings: ExportSettings
  exportStatus: ExportStatus
  notices: Notice[]
  atlas: AtlasInfo | null
  regionOverrides: Record<string, RegionOverrideInfo>
  selectedRegion: string | null
  regionFilter: string
  restoreWhitespace: boolean
  audit: AuditReport | null
  audioClips: AudioClipInfo[]
  syncClipId: string | null
  syncOffset: number
  audioBindings: Record<string, string>
  audioEnabled: boolean
  audioVolume: number
  audioTriggers: number
  syncPlaying: boolean
  selection: Selection | null
  treeExpanded: Record<string, boolean>
  treeFilter: string
  advancedOpen: boolean
  exportOpen: boolean
  editor: EditorState
  setupMode: boolean
  animateMode: boolean
  autoKey: boolean
  keySelection: string[]
  pendingPose: string[]
  keyClipboard: number
  dopesheetCollapsed: string[]
  meshSelection: number[]
  exportPreview: ExportPreviewState
  gizmoMode: GizmoMode
  gizmoSnap: boolean
}

export const initialInspectorState: InspectorState = {
  status: 'idle',
  error: null,
  asset: null,
  animation: null,
  playing: true,
  loop: true,
  speed: 1,
  mixOnSwitch: true,
  defaultMix: DEFAULT_MIX,
  transition: { from: null, to: null, duration: DEFAULT_MIX, hold: 0.6 },
  mixPairs: [],
  layers: [],
  activeSkins: [],
  slotOverrides: {},
  selectedSlot: null,
  slotFilter: '',
  debug: DEFAULT_DEBUG,
  showAxes: true,
  background: 'checker',
  eventLog: [],
  eventFilter: '',
  eventCapture: true,
  showLifecycle: false,
  activeTab: 'mix',
  exportSettings: { format: 'sequence', fps: 30, sizeMode: 'scale', scale: 1, width: 512, height: 512, padding: 8, loops: 1, animation: null, startFrame: 0, endFrame: null, background: null, columns: 0, align: 'center', offsetX: 0, offsetY: 0, crop: null },
  exportStatus: { busy: false, kind: null, progress: 0, message: null, error: null },
  notices: [],
  atlas: null,
  regionOverrides: {},
  selectedRegion: null,
  regionFilter: '',
  restoreWhitespace: true,
  audit: null,
  audioClips: [],
  syncClipId: null,
  syncOffset: 0,
  audioBindings: {},
  audioEnabled: true,
  audioVolume: 1,
  audioTriggers: 0,
  syncPlaying: false,
  selection: null,
  treeExpanded: {},
  treeFilter: '',
  advancedOpen: false,
  exportOpen: false,
  editor: EMPTY_EDITOR,
  setupMode: false,
  animateMode: false,
  autoKey: true,
  keySelection: [],
  pendingPose: [],
  keyClipboard: 0,
  dopesheetCollapsed: [],
  meshSelection: [],
  exportPreview: { status: 'idle', frame: 0, error: null },
  gizmoMode: 'translate',
  gizmoSnap: false,
}

export const useInspectorStore = create<InspectorState>()(() => ({ ...initialInspectorState }))

export function patchState(patch: Partial<InspectorState>): void {
  useInspectorStore.setState(patch)
}

export function appendEvents(records: readonly EventRecord[]): void {
  if (records.length === 0) return
  useInspectorStore.setState((state) => {
    const merged = state.eventLog.concat(records)
    return { eventLog: merged.length > EVENT_LOG_LIMIT ? merged.slice(merged.length - EVENT_LOG_LIMIT) : merged }
  })
}

let noticeId = 0

export function pushNotice(level: NoticeLevel, text: string): number {
  noticeId += 1
  const id = noticeId
  useInspectorStore.setState((state) => ({ notices: [...state.notices.slice(-4), { id, level, text }] }))
  return id
}

export function dismissNotice(id: number): void {
  useInspectorStore.setState((state) => ({ notices: state.notices.filter((notice) => notice.id !== id) }))
}

export function resetInspectorStore(): void {
  useInspectorStore.setState({ ...initialInspectorState })
}
