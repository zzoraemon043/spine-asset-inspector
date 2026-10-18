import type { DebugFlags, TrackLayer } from '@/core/types'

export const DEFAULT_DEBUG: DebugFlags = {
  bones: false,
  slots: false,
  meshHull: false,
  meshTriangles: false,
  regions: false,
  boundingBoxes: false,
  paths: false,
  clipping: false,
}

export const MAX_LAYERS = 4
export const EVENT_LOG_LIMIT = 1000
export const DEFAULT_MIX = 0.2

export function createLayer(index: number): TrackLayer {
  return { index, animation: null, loop: true, alpha: 1, blend: 'replace', enabled: true }
}

export type BackgroundMode = 'checker' | 'dark' | 'light' | 'chroma'

export const BACKGROUND_MODES: readonly BackgroundMode[] = ['checker', 'dark', 'light', 'chroma']

export type PanelTab = 'mix' | 'slots' | 'debug' | 'events' | 'audio' | 'atlas' | 'audit' | 'history'

export type SelectionKind = 'skeleton' | 'bone' | 'slot' | 'attachment' | 'skin' | 'animation' | 'event' | 'constraint'

export interface Selection {
  readonly kind: SelectionKind
  readonly name: string
  readonly slot?: string
  readonly group?: 'ik' | 'transform'
}

export type ExportKind = 'screenshot' | 'sequence' | 'sheet' | 'webm' | 'atlas' | 'region' | 'project'

export type ExportFormat = 'sequence' | 'sheet' | 'frame' | 'webm'

export const WAVEFORM_BUCKETS = 2000
export const SYNC_OFFSET_LIMIT = 5
