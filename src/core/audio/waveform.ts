export interface WaveformPeaks {
  readonly min: number[]
  readonly max: number[]
}

export function mixdown(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0)
  if (channels.length === 1) return channels[0]
  const length = Math.min(...channels.map((channel) => channel.length))
  const out = new Float32Array(length)
  for (const channel of channels) for (let i = 0; i < length; i++) out[i] += channel[i] / channels.length
  return out
}

export function computePeaks(samples: Float32Array, buckets: number): WaveformPeaks {
  const count = Math.max(1, Math.floor(buckets))
  const min = new Array<number>(count).fill(0)
  const max = new Array<number>(count).fill(0)
  if (samples.length === 0) return { min, max }
  for (let bucket = 0; bucket < count; bucket++) {
    const start = Math.floor((bucket * samples.length) / count)
    const end = Math.max(start + 1, Math.floor(((bucket + 1) * samples.length) / count))
    let low = 1
    let high = -1
    for (let i = start; i < end && i < samples.length; i++) {
      const value = samples[i]
      if (value < low) low = value
      if (value > high) high = value
    }
    min[bucket] = Math.round(Math.max(-1, Math.min(1, low)) * 1000) / 1000
    max[bucket] = Math.round(Math.max(-1, Math.min(1, high)) * 1000) / 1000
  }
  return { min, max }
}

export interface OnsetOptions {
  readonly windowSeconds: number
  readonly ratio: number
  readonly floor: number
  readonly minGapSeconds: number
}

export const DEFAULT_ONSET_OPTIONS: OnsetOptions = { windowSeconds: 0.005, ratio: 4, floor: 0.02, minGapSeconds: 0.05 }

export function detectOnsets(samples: Float32Array, sampleRate: number, options: OnsetOptions = DEFAULT_ONSET_OPTIONS): number[] {
  if (sampleRate <= 0 || samples.length === 0) return []
  const window = Math.max(1, Math.round(options.windowSeconds * sampleRate))
  const windows = Math.floor(samples.length / window)
  const energy = new Float32Array(windows)
  for (let w = 0; w < windows; w++) {
    let sum = 0
    for (let i = w * window; i < (w + 1) * window; i++) sum += samples[i] * samples[i]
    energy[w] = Math.sqrt(sum / window)
  }
  const onsets: number[] = []
  let background = 0
  let lastOnset = -Infinity
  for (let w = 0; w < windows; w++) {
    const value = energy[w]
    const time = (w * window) / sampleRate
    if (value > options.floor && value > background * options.ratio && time - lastOnset >= options.minGapSeconds) {
      onsets.push(Math.round(time * 10000) / 10000)
      lastOnset = time
    }
    background = background * 0.8 + value * 0.2
  }
  return onsets
}
