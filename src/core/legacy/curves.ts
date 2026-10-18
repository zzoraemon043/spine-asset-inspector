export type LegacyCurve = 'linear' | 'stepped' | readonly [number, number, number, number]

export interface LegacyKey {
  readonly time: number
  readonly values: readonly number[]
  curve: LegacyCurve
}

export function roundValue(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

export function absoluteCurve(current: LegacyKey, next: LegacyKey): 'stepped' | number[] | null {
  const curve = current.curve
  if (curve === 'linear') return null
  if (curve === 'stepped') return 'stepped'
  const [c1x, c1y, c2x, c2y] = curve
  const span = next.time - current.time
  const result: number[] = []
  for (let channel = 0; channel < current.values.length; channel++) {
    const from = current.values[channel]
    const to = next.values[channel] ?? from
    result.push(roundValue(current.time + c1x * span), roundValue(from + c1y * (to - from)), roundValue(current.time + c2x * span), roundValue(from + c2y * (to - from)))
  }
  return result
}

export function unwrapRotations(values: readonly number[]): number[] {
  const result: number[] = []
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      result.push(values[0])
      continue
    }
    const previous = result[i - 1]
    let delta = values[i] - values[i - 1]
    delta -= (16384 - Math.trunc(16384.499999999996 - delta / 360)) * 360
    result.push(previous + delta)
  }
  return result
}

export function attachCurves<T extends Record<string, unknown>>(keys: readonly LegacyKey[], build: (key: LegacyKey, index: number) => T): T[] {
  return keys.map((key, index) => {
    const json: Record<string, unknown> = { ...build(key, index) }
    const next = keys[index + 1]
    if (next) {
      const curve = absoluteCurve(key, next)
      if (curve !== null) json.curve = curve
    }
    return json as T
  })
}

export function rgba8888(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0')
}

export function rgb888(value: number): string {
  return ((value >>> 0) & 0xffffff).toString(16).padStart(6, '0')
}

export function rgbaChannels(value: number): number[] {
  const v = value >>> 0
  return [((v >>> 24) & 0xff) / 255, ((v >>> 16) & 0xff) / 255, ((v >>> 8) & 0xff) / 255, (v & 0xff) / 255]
}

export function rgbChannels(value: number): number[] {
  const v = value >>> 0
  return [((v >>> 16) & 0xff) / 255, ((v >>> 8) & 0xff) / 255, (v & 0xff) / 255]
}
