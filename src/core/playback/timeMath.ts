export const SPEED_MIN = 0.1
export const SPEED_MAX = 2
export const SPEED_PRESETS = [0.1, 0.25, 0.5, 1, 1.5, 2] as const

const EPSILON = 1e-6

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1
  return Math.round(clamp(speed, SPEED_MIN, SPEED_MAX) * 100) / 100
}

export function frameAt(time: number, fps: number): number {
  if (fps <= 0 || time <= 0) return 0
  return Math.floor(time * fps + EPSILON)
}

export function frameCountOf(duration: number, fps: number): number {
  if (fps <= 0 || duration <= 0) return 0
  return Math.max(1, Math.round(duration * fps))
}

export function timeOfFrame(frame: number, fps: number): number {
  return fps > 0 ? Math.max(0, frame) / fps : 0
}

export function formatSeconds(seconds: number, digits = 3): string {
  return `${Math.max(0, seconds).toFixed(digits)}s`
}

export function ratioToTime(ratio: number, duration: number): number {
  return clamp(ratio, 0, 1) * Math.max(0, duration)
}

export function timeToRatio(time: number, duration: number): number {
  return duration > 0 ? clamp(time / duration, 0, 1) : 0
}

export function sampleTimes(duration: number, fps: number): number[] {
  const count = frameCountOf(duration, fps)
  if (count === 0) return [0]
  const times: number[] = []
  for (let frame = 0; frame < count; frame++) times.push(Math.min(duration, frame / fps))
  return times
}
