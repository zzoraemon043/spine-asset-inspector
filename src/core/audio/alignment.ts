import type { TimelineEventMarker } from '../types'

export type AlignmentStatus = 'aligned' | 'near' | 'off' | 'missing'

export interface AlignmentRow {
  readonly event: string
  readonly eventTime: number
  readonly onsetTime: number | null
  readonly deltaMs: number | null
  readonly status: AlignmentStatus
}

export function nearestOnset(onsets: readonly number[], time: number): number | null {
  let best: number | null = null
  for (const onset of onsets) if (best === null || Math.abs(onset - time) < Math.abs(best - time)) best = onset
  return best
}

export function classifyDelta(deltaSeconds: number, fps: number): AlignmentStatus {
  const frame = 1 / Math.max(1, fps)
  const distance = Math.abs(deltaSeconds)
  if (distance <= frame / 2 + 1e-6) return 'aligned'
  if (distance <= frame * 2 + 1e-6) return 'near'
  return 'off'
}

export function alignEvents(markers: readonly TimelineEventMarker[], onsets: readonly number[], offsetSeconds: number, fps: number, searchSeconds = 0.25): AlignmentRow[] {
  const shifted = onsets.map((onset) => onset + offsetSeconds)
  return markers.map((marker) => {
    const onset = nearestOnset(shifted, marker.time)
    if (onset === null || Math.abs(onset - marker.time) > searchSeconds) {
      return { event: marker.name, eventTime: marker.time, onsetTime: null, deltaMs: null, status: 'missing' }
    }
    const delta = onset - marker.time
    return {
      event: marker.name,
      eventTime: marker.time,
      onsetTime: Math.round(onset * 10000) / 10000,
      deltaMs: Math.round(delta * 10000) / 10,
      status: classifyDelta(delta, fps),
    }
  })
}

export function suggestOffset(markers: readonly TimelineEventMarker[], onsets: readonly number[]): number | null {
  if (markers.length === 0 || onsets.length === 0) return null
  const deltas = markers.map((marker) => marker.time - (nearestOnset(onsets, marker.time) ?? marker.time)).sort((a, b) => a - b)
  return Math.round(deltas[Math.floor(deltas.length / 2)] * 1000) / 1000
}
