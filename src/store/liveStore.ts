import { create } from 'zustand'
import type { PlaybackSnapshot } from '@/core/types'
import type { GizmoHandle, GizmoMode, SetupPatch } from '@/core/gizmo/types'
import type { PreviewJobResult } from '@/controller/types'

export interface BoneLive {
  readonly x: number
  readonly y: number
  readonly rotation: number
  readonly scaleX: number
  readonly scaleY: number
  readonly worldX: number
  readonly worldY: number
  readonly worldRotation: number
}

export interface GizmoScreen {
  readonly bone: string
  readonly mode: GizmoMode
  readonly origin: readonly [number, number]
  readonly tip: readonly [number, number]
  readonly handles: Partial<Record<GizmoHandle, readonly [number, number]>>
}

export interface GizmoPreview {
  readonly bone: string
  readonly handle: GizmoHandle
  readonly values: SetupPatch
}

export interface LiveState {
  snapshot: PlaybackSnapshot
  renderFps: number
  zoom: number
  pointer: { x: number; y: number } | null
  attachments: Record<string, string | null>
  bone: BoneLive | null
  gizmo: GizmoScreen | null
  gizmoHover: GizmoHandle | null
  gizmoPreview: GizmoPreview | null
  meshScreen: Array<readonly [number, number]> | null
  exportPreview: PreviewJobResult | null
}

export const EMPTY_SNAPSHOT: PlaybackSnapshot = { time: 0, duration: 0, frame: 0, frameCount: 0, tracks: [] }

export const useLiveStore = create<LiveState>()(() => ({
  snapshot: EMPTY_SNAPSHOT,
  renderFps: 0,
  zoom: 1,
  pointer: null,
  attachments: {},
  bone: null,
  gizmo: null,
  gizmoHover: null,
  gizmoPreview: null,
  meshScreen: null,
  exportPreview: null,
}))
