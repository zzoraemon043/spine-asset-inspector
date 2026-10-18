export interface ClickTrack {
  readonly sampleRate: number
  readonly duration: number
  readonly clicks: readonly number[]
  readonly channels?: number
}

export function synthesizeClicks(track: ClickTrack): Float32Array {
  const length = Math.round(track.duration * track.sampleRate)
  const samples = new Float32Array(length)
  for (const click of track.clicks) {
    const start = Math.round(click * track.sampleRate)
    const span = Math.round(0.03 * track.sampleRate)
    for (let i = 0; i < span && start + i < length; i++) {
      samples[start + i] = Math.sin((2 * Math.PI * 880 * i) / track.sampleRate) * 0.8 * (1 - i / span)
    }
  }
  return samples
}

export function encodeWav(samples: Float32Array, sampleRate: number, channels = 1): Uint8Array {
  const frames = samples.length
  const bytes = new Uint8Array(44 + frames * channels * 2)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i)
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + frames * channels * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, frames * channels * 2, true)
  for (let i = 0; i < frames; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]))
    for (let c = 0; c < channels; c++) view.setInt16(44 + (i * channels + c) * 2, Math.round(value * 32767), true)
  }
  return bytes
}

export function decodeWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number; channels: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const channels = view.getUint16(22, true)
  const sampleRate = view.getUint32(24, true)
  const dataBytes = view.getUint32(40, true)
  const frames = dataBytes / (channels * 2)
  const samples = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    let sum = 0
    for (let c = 0; c < channels; c++) sum += view.getInt16(44 + (i * channels + c) * 2, true) / 32767
    samples[i] = sum / channels
  }
  return { samples, sampleRate, channels }
}
