import { Pause, Play, Repeat, StepBack, StepForward } from 'lucide-react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import { useLiveStore } from '@/store/liveStore'
import { SPEED_MAX, SPEED_MIN, SPEED_PRESETS } from '@/core/playback/timeMath'
import { Button, IconButton } from '../ui/Button'
import { Select } from '../ui/Select'
import { TimelineScrubber } from './TimelineScrubber'

export function PlaybackBar() {
  const controller = useController()
  const playing = useInspectorStore((state) => state.playing)
  const loop = useInspectorStore((state) => state.loop)
  const speed = useInspectorStore((state) => state.speed)
  const animation = useInspectorStore((state) => state.animation)
  const animations = useInspectorStore((state) => state.asset?.animations)
  const time = useLiveStore((state) => state.snapshot.time)
  const duration = useLiveStore((state) => state.snapshot.duration)
  const frame = useLiveStore((state) => state.snapshot.frame)
  const frameCount = useLiveStore((state) => state.snapshot.frameCount)
  const fps = useInspectorStore((state) => state.asset?.fps ?? 30)
  const hasAnimation = animation !== null

  return (
    <div className="shrink-0 border-t border-ink-700 bg-ink-850" data-testid="playback-bar">
      <div className="flex min-h-11 flex-wrap items-center gap-2 px-3 py-1 lg:h-11 lg:flex-nowrap lg:py-0">
        <div className="w-44">
          <Select label="目前動畫" value={animation} options={(animations ?? []).map((item) => ({ value: item.name, label: item.name }))} onChange={(value) => value && controller.selectAnimation(value)} testId="animation-picker" />
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton size="sm" label="上一格 (左方向鍵)" icon={<StepBack size={14} />} disabled={!hasAnimation} onClick={() => controller.step(-1)} testId="step-back" />
          <IconButton
            size="md"
            label={playing ? '暫停 (空白鍵)' : '播放 (空白鍵)'}
            variant="primary"
            icon={playing ? <Pause size={15} /> : <Play size={15} />}
            disabled={!hasAnimation}
            onClick={() => controller.togglePlay()}
            testId="play-toggle"
            data-state={playing ? 'playing' : 'paused'}
          />
          <IconButton size="sm" label="下一格 (右方向鍵)" icon={<StepForward size={14} />} disabled={!hasAnimation} onClick={() => controller.step(1)} testId="step-forward" />
        </div>
        <IconButton size="sm" label="循環播放 (L)" active={loop} icon={<Repeat size={14} />} onClick={() => controller.setLoop(!loop)} testId="loop-toggle" aria-pressed={loop} />
        <div className="mx-1 h-5 w-px bg-ink-700" />
        <span className="text-[11px] text-ink-400">速度</span>
        <div className="flex items-center gap-0.5">
          {SPEED_PRESETS.map((preset) => (
            <Button key={preset} size="xs" variant={Math.abs(speed - preset) < 1e-3 ? 'active' : 'ghost'} onClick={() => controller.setSpeed(preset)} testId={`speed-${preset}`} className="font-mono">
              {`${preset}x`}
            </Button>
          ))}
        </div>
        <input
          type="range"
          aria-label="播放速度"
          className="range-input w-24"
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={0.05}
          value={speed}
          data-testid="speed-slider"
          onChange={(event) => controller.setSpeed(Number(event.target.value))}
        />
        <span className="w-12 font-mono text-xs tabular-nums text-accent-400" data-testid="speed-value">{`${speed.toFixed(2)}x`}</span>
        <div className="ml-auto flex items-center gap-3 text-xs tabular-nums">
          <span className="text-ink-400">
            時間 <span className="font-mono text-ink-100" data-testid="time-display">{`${time.toFixed(3)}s`}</span>
            <span className="font-mono text-ink-500">{` / ${duration.toFixed(3)}s`}</span>
          </span>
          <span className="text-ink-400">
            影格 <span className="font-mono text-ink-100" data-testid="frame-display">{frame}</span>
            <span className="font-mono text-ink-500"> / {frameCount}</span>
          </span>
          <span className="text-ink-500">{fps} fps</span>
        </div>
      </div>
      <TimelineScrubber />
    </div>
  )
}
