import { useMemo, useRef } from 'react'
import { AudioLines, Play, Square, Trash, Upload, Volume2, Wand2 } from 'lucide-react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import { useLiveStore } from '@/store/liveStore'
import { alignEvents, type AlignmentStatus } from '@/core/audio/alignment'
import { timeToRatio } from '@/core/playback/timeMath'
import { Panel, EmptyState } from '../ui/Panel'
import { Badge, type BadgeTone } from '../ui/Badge'
import { Button, IconButton } from '../ui/Button'
import { Select } from '../ui/Select'
import { Slider } from '../ui/Slider'
import { Toggle } from '../ui/Toggle'
import { WaveformCanvas } from '../stage/WaveformCanvas'
import { eventColor } from '../stage/eventColor'
import { cx } from '../ui/cx'

const STATUS_TONE: Record<AlignmentStatus, BadgeTone> = { aligned: 'green', near: 'amber', off: 'red', missing: 'neutral' }
const STATUS_LABEL: Record<AlignmentStatus, string> = { aligned: '對齊', near: '接近', off: '偏離', missing: '無聲音' }

function ClipsSection() {
  const controller = useController()
  const clips = useInspectorStore((state) => state.audioClips)
  const syncClipId = useInspectorStore((state) => state.syncClipId)
  const input = useRef<HTMLInputElement>(null)
  return (
    <Panel
      title="音效"
      tag={<Badge>{clips.length}</Badge>}
      actions={
        <Button size="xs" icon={<Upload size={12} />} onClick={() => input.current?.click()} disabled={!controller.audio.supported()} testId="audio-open">
          載入音效
        </Button>
      }
    >
      <input
        ref={input}
        type="file"
        multiple
        accept=".wav,.mp3,.ogg,.oga,.m4a,.aac,.flac"
        className="hidden"
        data-testid="audio-input"
        onChange={async (event) => {
          const files = event.target.files ? Array.from(event.target.files) : []
          event.target.value = ''
          const virtual = files.length > 0 ? await controller.readInput(files) : null
          if (virtual) await controller.audio.loadFiles(virtual)
        }}
      />
      {clips.length === 0 ? (
        <EmptyState>拖曳 WAV / MP3 / OGG 至舞台或按「載入音效」。檔名與事件同名（例如 step.wav）會自動綁定。</EmptyState>
      ) : (
        <ul className="py-1">
          {clips.map((clip) => (
            <li key={clip.id} className={cx('flex items-center gap-1.5 border-l-2 px-2 py-1', clip.id === syncClipId ? 'border-signal-violet bg-signal-violet/10' : 'border-transparent')} data-testid={`audio-clip-${clip.baseName}`}>
              <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={() => controller.audio.setSyncClip(clip.id)} data-testid={`audio-sync-select-${clip.baseName}`}>
                <span className="truncate font-mono text-xs text-ink-100">{clip.name}</span>
                <span className="font-mono text-[10px] text-ink-400">{`${clip.duration.toFixed(3)} 秒  ${clip.sampleRate}Hz  ${clip.channels} 聲道  起音點 ${clip.onsets.length}`}</span>
              </button>
              {clip.id === syncClipId && <Badge tone="violet">同步軌</Badge>}
              <IconButton size="xs" label={`試聽 ${clip.name}`} icon={<Volume2 size={12} />} onClick={() => controller.audio.preview(clip.id)} />
              <IconButton size="xs" label={`移除 ${clip.name}`} icon={<Trash size={12} />} onClick={() => controller.audio.removeClip(clip.id)} testId={`audio-remove-${clip.baseName}`} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function SyncSection() {
  const controller = useController()
  const clip = useInspectorStore((state) => state.audioClips.find((item) => item.id === state.syncClipId) ?? null)
  const offset = useInspectorStore((state) => state.syncOffset)
  const syncPlaying = useInspectorStore((state) => state.syncPlaying)
  const animationName = useInspectorStore((state) => state.animation)
  const animation = useInspectorStore((state) => state.asset?.animations.find((item) => item.name === state.animation) ?? null)
  const fps = useInspectorStore((state) => state.asset?.fps ?? 30)
  const time = useLiveStore((state) => state.snapshot.time)
  const duration = animation?.duration ?? 0
  const rows = useMemo(() => (clip && animation ? alignEvents(animation.events, clip.onsets, offset, fps) : []), [clip, animation, offset, fps])
  if (!clip) {
    return (
      <Panel title="時間軸同步">
        <EmptyState>尚未選擇同步音軌</EmptyState>
      </Panel>
    )
  }
  return (
    <>
      <Panel title="時間軸同步" tag={<Badge tone={syncPlaying ? 'green' : 'neutral'} testId="audio-sync-state">{syncPlaying ? '播放中' : '待命'}</Badge>} testId="audio-sync">
        <div className="flex flex-col gap-3 p-3">
          <div className="flex items-center justify-between text-[11px] text-ink-400">
            <span>{`${animationName ?? '--'} ${duration.toFixed(3)} 秒`}</span>
            <span>{clip.name}</span>
          </div>
          <div className="relative h-20 overflow-hidden rounded border border-ink-700 bg-ink-950">
            <WaveformCanvas peaks={clip.peaks} clipDuration={clip.duration} offset={offset} windowDuration={duration} color="rgba(167, 139, 250, 0.85)" className="absolute inset-0 h-full w-full" testId="audio-waveform" />
            {clip.onsets.map((onset) => {
              const at = onset + offset
              if (at < 0 || at > duration) return null
              return <div key={onset} className="absolute bottom-0 h-2 w-px bg-ink-200" style={{ left: `${timeToRatio(at, duration) * 100}%` }} data-testid="audio-onset" />
            })}
            {animation?.events.map((event, index) => (
              <div key={`${event.name}-${index}`} className="absolute inset-y-0 w-px" style={{ left: `${timeToRatio(event.time, duration) * 100}%`, backgroundColor: eventColor(event.name) }} title={`${event.name} @ ${event.time.toFixed(3)}s`} />
            ))}
            <div className="absolute inset-y-0 w-px bg-accent-400" style={{ left: `${timeToRatio(time, duration) * 100}%` }} data-testid="audio-playhead" />
          </div>
          <Slider label="音效偏移" value={offset} min={-1} max={1} step={0.001} format={(value) => `${value >= 0 ? '+' : ''}${(value * 1000).toFixed(0)}ms`} onChange={(value) => controller.audio.setSyncOffset(value)} testId="audio-offset" />
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" icon={<Play size={13} />} disabled={!animation} onClick={() => controller.playSync()} testId="audio-play-sync">
              從 0 秒同步試聽
            </Button>
            <Button icon={<Square size={13} />} onClick={() => controller.audio.stopSync()} testId="audio-stop-sync">
              停止
            </Button>
            <IconButton size="sm" label="依事件自動建議偏移" icon={<Wand2 size={13} />} onClick={() => controller.audio.applySuggestedOffset()} testId="audio-suggest-offset" />
          </div>
        </div>
      </Panel>
      <Panel title="對齊檢查" tag={<Badge>{`1 格 = ${(1000 / fps).toFixed(1)}ms`}</Badge>} testId="audio-alignment">
        {rows.length === 0 ? (
          <EmptyState>目前動作沒有事件可對齊</EmptyState>
        ) : (
          <table className="w-full table-fixed font-mono text-[11px]">
            <thead>
              <tr className="border-b border-ink-700 text-left text-[10px] text-ink-500">
                <th className="py-1 pl-3 font-medium">事件</th>
                <th className="font-medium">時間</th>
                <th className="font-medium">起音</th>
                <th className="font-medium">差距</th>
                <th className="pr-3 font-medium">狀態</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.event}-${index}`} className="border-b border-ink-800" data-testid="audio-alignment-row" data-status={row.status}>
                  <td className="py-1 pl-3" style={{ color: eventColor(row.event) }}>
                    {row.event}
                  </td>
                  <td className="tabular-nums text-ink-200">{`${row.eventTime.toFixed(3)}s`}</td>
                  <td className="tabular-nums text-ink-300">{row.onsetTime === null ? '--' : `${row.onsetTime.toFixed(3)}s`}</td>
                  <td className="tabular-nums text-ink-100">{row.deltaMs === null ? '--' : `${row.deltaMs > 0 ? '+' : ''}${row.deltaMs.toFixed(1)}ms`}</td>
                  <td className="pr-3">
                    <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  )
}

function TriggerSection() {
  const controller = useController()
  const clips = useInspectorStore((state) => state.audioClips)
  const eventNames = useInspectorStore((state) => state.asset?.eventNames ?? [])
  const bindings = useInspectorStore((state) => state.audioBindings)
  const enabled = useInspectorStore((state) => state.audioEnabled)
  const volume = useInspectorStore((state) => state.audioVolume)
  const triggers = useInspectorStore((state) => state.audioTriggers)
  return (
    <Panel title="事件觸發音效" tag={<Badge tone="accent" testId="audio-trigger-count">{`觸發 ${triggers} 次`}</Badge>} className="border-b-0" testId="audio-triggers">
      <div className="flex flex-col gap-2 p-3">
        <Toggle label="事件觸發音效" description="播放中每次觸發事件即播放綁定的音效" checked={enabled} onChange={(value) => controller.audio.setEnabled(value)} testId="audio-enabled" />
        <Slider label="音量" value={volume} min={0} max={2} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => controller.audio.setVolume(value)} testId="audio-volume" />
        {eventNames.length === 0 && <span className="text-[11px] text-ink-400">此骨架未定義自訂事件</span>}
        {eventNames.map((name) => (
          <div key={name} className="grid grid-cols-[96px_1fr] items-center gap-2">
            <span className="flex items-center gap-1.5 font-mono text-xs">
              <AudioLines size={12} style={{ color: eventColor(name) }} />
              <span className="truncate text-ink-100">{name}</span>
            </span>
            <Select
              label={`${name} 綁定音效`}
              value={bindings[name] ?? null}
              placeholder="（未綁定）"
              options={clips.map((clip) => ({ value: clip.id, label: clip.name }))}
              onChange={(value) => controller.audio.bind(name, value || null)}
              testId={`audio-bind-${name}`}
            />
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function AudioPanel() {
  return (
    <div data-testid="audio-panel">
      <ClipsSection />
      <SyncSection />
      <TriggerSection />
    </div>
  )
}
