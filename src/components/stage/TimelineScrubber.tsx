import { useMemo, useRef, type PointerEvent } from 'react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import { useLiveStore } from '@/store/liveStore'
import { ratioToTime, timeToRatio } from '@/core/playback/timeMath'
import { eventColor } from './eventColor'
import { WaveformCanvas } from './WaveformCanvas'

export function TimelineScrubber() {
  const controller = useController()
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<number | null>(null)
  const animationName = useInspectorStore((state) => state.animation)
  const animations = useInspectorStore((state) => state.asset?.animations)
  const fps = useInspectorStore((state) => state.asset?.fps ?? 30)
  const time = useLiveStore((state) => state.snapshot.time)
  const duration = useLiveStore((state) => state.snapshot.duration)
  const info = useMemo(() => animations?.find((animation) => animation.name === animationName) ?? null, [animations, animationName])
  const frameCount = Math.max(0, Math.round(duration * fps))
  const syncClip = useInspectorStore((state) => state.audioClips.find((clip) => clip.id === state.syncClipId) ?? null)
  const syncOffset = useInspectorStore((state) => state.syncOffset)

  const seekFrom = (clientX: number) => {
    const track = trackRef.current
    if (!track || duration <= 0) return
    const rect = track.getBoundingClientRect()
    controller.seek(ratioToTime((clientX - rect.left) / rect.width, duration))
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = event.pointerId
    controller.beginScrub()
    seekFrom(event.clientX)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current === event.pointerId) seekFrom(event.clientX)
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current !== event.pointerId) return
    dragging.current = null
    controller.endScrub()
  }

  const ratio = timeToRatio(time, duration)
  const tickBackground = frameCount > 0 && frameCount <= 240 ? `repeating-linear-gradient(to right, rgba(138,148,167,0.22) 0 1px, transparent 1px calc(100% / ${frameCount}))` : undefined

  return (
    <div className="px-3 pb-2">
      <div
        ref={trackRef}
        role="slider"
        aria-label="時間軸，拖曳可跳到指定時間"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={time}
        tabIndex={0}
        data-testid="timeline"
        className="relative h-9 cursor-ew-resize select-none rounded border border-ink-700 bg-ink-900"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {syncClip && duration > 0 && (
          <WaveformCanvas
            peaks={syncClip.peaks}
            clipDuration={syncClip.duration}
            offset={syncOffset}
            windowDuration={duration}
            color="rgba(167, 139, 250, 0.45)"
            className="pointer-events-none absolute inset-0 h-full w-full"
            testId="timeline-waveform"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-2" style={{ backgroundImage: tickBackground }} />
        <div className="absolute inset-y-0 left-0 bg-accent-500/10" style={{ width: `${ratio * 100}%` }} />
        {info?.events.map((event, index) => (
          <div
            key={`${event.name}-${event.time}-${index}`}
            data-testid="timeline-marker"
            data-event={event.name}
            title={`${event.name} @ ${event.time.toFixed(3)}s  int=${event.intValue} float=${event.floatValue} string=${event.stringValue}`}
            className="absolute top-1 h-3 w-1.5 -translate-x-1/2 rounded-sm"
            style={{ left: `${timeToRatio(event.time, duration) * 100}%`, backgroundColor: eventColor(event.name) }}
          />
        ))}
        {info?.events.map((event, index) => (
          <span
            key={`label-${event.name}-${index}`}
            className="pointer-events-none absolute top-[15px] -translate-x-1/2 font-mono text-[9px] leading-none"
            style={{ left: `${timeToRatio(event.time, duration) * 100}%`, color: eventColor(event.name) }}
          >
            {event.name}
          </span>
        ))}
        <div className="pointer-events-none absolute inset-y-0 w-px bg-accent-400" style={{ left: `${ratio * 100}%` }} data-testid="playhead">
          <div className="absolute -left-1 -top-px h-2 w-2 rotate-45 bg-accent-400" />
        </div>
      </div>
    </div>
  )
}
