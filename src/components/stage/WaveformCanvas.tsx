import { useEffect, useRef } from 'react'
import type { WaveformPeaks } from '@/core/audio/waveform'

export interface WaveformCanvasProps {
  readonly peaks: WaveformPeaks
  readonly clipDuration: number
  readonly offset: number
  readonly windowDuration: number
  readonly color: string
  readonly className?: string
  readonly testId?: string
}

export function drawWaveform(canvas: HTMLCanvasElement, props: WaveformCanvasProps): void {
  const ratio = Math.min(2, window.devicePixelRatio || 1)
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, width, height)
  const buckets = props.peaks.max.length
  if (buckets === 0 || props.clipDuration <= 0 || props.windowDuration <= 0) return
  context.fillStyle = props.color
  const middle = height / 2
  for (let x = 0; x < width; x++) {
    const audioTime = (x / width) * props.windowDuration - props.offset
    if (audioTime < 0 || audioTime >= props.clipDuration) continue
    const bucket = Math.min(buckets - 1, Math.floor((audioTime / props.clipDuration) * buckets))
    const top = middle - props.peaks.max[bucket] * middle
    const bottom = middle - props.peaks.min[bucket] * middle
    context.fillRect(x, top, 1, Math.max(1, bottom - top))
  }
}

export function WaveformCanvas(props: WaveformCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { peaks, clipDuration, offset, windowDuration, color } = props
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const input = { peaks, clipDuration, offset, windowDuration, color }
    drawWaveform(canvas, input)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => drawWaveform(canvas, input))
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [peaks, clipDuration, offset, windowDuration, color])
  return <canvas ref={ref} data-testid={props.testId} className={props.className} />
}
