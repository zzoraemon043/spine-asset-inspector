import { mixdown } from '@/core/audio/waveform'
import type { AudioBackend, DecodedAudio } from './types'

export function createWebAudioBackend(): AudioBackend {
  let context: AudioContext | null = null
  const buffers = new Map<string, AudioBuffer>()
  const playing = new Set<AudioBufferSourceNode>()
  let counter = 0

  const ensure = (): AudioContext => {
    if (!context) context = new AudioContext()
    if (context.state === 'suspended') void context.resume()
    return context
  }

  return {
    supported: () => typeof AudioContext !== 'undefined',
    async decode(bytes: Uint8Array): Promise<DecodedAudio> {
      const ctx = ensure()
      const copy = bytes.slice().buffer
      const buffer = await ctx.decodeAudioData(copy)
      counter += 1
      const handle = `audio-${counter}`
      buffers.set(handle, buffer)
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index))
      return { handle, samples: mixdown(channels), sampleRate: buffer.sampleRate, duration: buffer.duration, channels: buffer.numberOfChannels }
    },
    play(handle, options) {
      const buffer = buffers.get(handle)
      if (!buffer) return () => undefined
      const ctx = ensure()
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = Math.max(0.0625, options.rate)
      const gain = ctx.createGain()
      gain.gain.value = Math.max(0, Math.min(2, options.volume))
      source.connect(gain).connect(ctx.destination)
      source.onended = () => playing.delete(source)
      playing.add(source)
      const stop = () => {
        try {
          source.stop()
        } catch {
          playing.delete(source)
        }
      }
      source.start(ctx.currentTime + Math.max(0, options.delay), Math.max(0, Math.min(buffer.duration, options.offset)))
      return stop
    },
    stopAll() {
      for (const source of playing) {
        try {
          source.stop()
        } catch {
          playing.delete(source)
        }
      }
      playing.clear()
    },
    release(handle) {
      buffers.delete(handle)
    },
  }
}
