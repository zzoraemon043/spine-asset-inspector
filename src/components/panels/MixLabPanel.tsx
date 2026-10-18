import { ArrowRightLeft, Play, Plus, RotateCcw, Trash, X } from 'lucide-react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import { useLiveStore } from '@/store/liveStore'
import { MAX_LAYERS } from '@/store/defaults'
import type { MixBlendMode, TrackLayer } from '@/core/types'
import { Panel, FieldLabel, EmptyState } from '../ui/Panel'
import { Badge } from '../ui/Badge'
import { Button, IconButton } from '../ui/Button'
import { Select, type SelectOption } from '../ui/Select'
import { Slider } from '../ui/Slider'
import { Toggle } from '../ui/Toggle'

const seconds = (value: number) => `${value.toFixed(2)}s`

function useAnimationOptions(): SelectOption[] {
  const animations = useInspectorStore((state) => state.asset?.animations)
  return (animations ?? []).map((animation) => ({ value: animation.name, label: animation.name }))
}

function MixProgress() {
  const main = useLiveStore((state) => state.snapshot.tracks.find((track) => track.index === 0))
  const mixing = Boolean(main?.mixingFrom)
  const progress = mixing ? main?.mixProgress ?? 0 : 1
  return (
    <div className="flex flex-col gap-1" data-testid="mix-progress">
      <div className="flex items-center justify-between text-[11px] text-ink-400">
        <span>{mixing ? `過渡中：${main?.mixingFrom} 到 ${main?.animation}` : `目前：${main?.animation ?? '--'}`}</span>
        <span className={mixing ? 'text-signal-violet' : 'text-ink-500'} data-testid="mix-progress-value">{`${Math.round(progress * 100)}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
        <div className={mixing ? 'h-full bg-signal-violet transition-[width] duration-75' : 'h-full bg-ink-500'} style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  )
}

function TransitionSection() {
  const controller = useController()
  const options = useAnimationOptions()
  const transition = useInspectorStore((state) => state.transition)
  const defaultMix = useInspectorStore((state) => state.defaultMix)
  const mixOnSwitch = useInspectorStore((state) => state.mixOnSwitch)
  const ready = Boolean(transition.from && transition.to)
  return (
    <Panel title="動作過渡測試" tag={<Badge tone="violet">A 到 B</Badge>} testId="transition-lab">
      <div className="flex flex-col gap-3 p-3">
        <Toggle label="切換動作時套用混合" description="切換動畫時平滑過渡，避免動作跳接" checked={mixOnSwitch} onChange={(value) => controller.setMixOnSwitch(value)} testId="mix-on-switch" />
        <Slider label="預設過渡時間" value={defaultMix} min={0} max={2} step={0.01} format={seconds} onChange={(value) => controller.setDefaultMix(value)} testId="default-mix" />
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div>
            <FieldLabel>動作 A</FieldLabel>
            <Select label="過渡起始動作" value={transition.from} options={options} onChange={(value) => controller.setTransition({ from: value })} testId="transition-from" />
          </div>
          <IconButton size="sm" label="交換 A 與 B" icon={<ArrowRightLeft size={13} />} onClick={() => controller.setTransition({ from: transition.to, to: transition.from })} testId="transition-swap" />
          <div>
            <FieldLabel>動作 B</FieldLabel>
            <Select label="過渡目標動作" value={transition.to} options={options} onChange={(value) => controller.setTransition({ to: value })} testId="transition-to" />
          </div>
        </div>
        <Slider label="這次過渡時間" value={transition.duration} min={0} max={2} step={0.01} format={seconds} onChange={(value) => controller.setTransition({ duration: value })} testId="transition-duration" />
        <Slider label="先播放 A 多久" value={transition.hold} min={0} max={5} step={0.05} format={seconds} onChange={(value) => controller.setTransition({ hold: value })} testId="transition-hold" />
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" icon={<Play size={13} />} disabled={!ready} onClick={() => controller.runTransition(false)} testId="run-transition">
            執行 A 至 B
          </Button>
          <Button className="flex-1" icon={<RotateCcw size={13} />} disabled={!ready} onClick={() => controller.runTransition(true)} testId="run-transition-reverse">
            執行 B 至 A
          </Button>
        </div>
        <Button
          size="xs"
          variant="ghost"
          icon={<Plus size={12} />}
          disabled={!ready}
          onClick={() => transition.from && transition.to && controller.upsertMixPair({ from: transition.from, to: transition.to, duration: transition.duration })}
          testId="save-mix-pair"
        >
          把目前 A 到 B 的過渡時間存成個別設定
        </Button>
        <MixProgress />
      </div>
    </Panel>
  )
}

function MixPairsSection() {
  const controller = useController()
  const pairs = useInspectorStore((state) => state.mixPairs)
  return (
    <Panel title="個別過渡設定" tag={<Badge>{pairs.length}</Badge>} testId="mix-pairs">
      {pairs.length === 0 ? (
        <EmptyState>尚未設定，所有切換都使用預設過渡時間</EmptyState>
      ) : (
        <ul className="py-1">
          {pairs.map((pair) => (
            <li key={`${pair.from}-${pair.to}`} className="flex items-center gap-2 px-3 py-1 font-mono text-xs" data-testid="mix-pair-row">
              <span className="truncate text-ink-100">{pair.from}</span>
              <span className="text-ink-500">到</span>
              <span className="truncate text-ink-100">{pair.to}</span>
              <span className="ml-auto tabular-nums text-accent-400">{seconds(pair.duration)}</span>
              <IconButton size="xs" label="移除配對" icon={<X size={12} />} onClick={() => controller.removeMixPair(pair.from, pair.to)} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function LayerRow({ layer, options }: { layer: TrackLayer; options: SelectOption[] }) {
  const controller = useController()
  const runtime = useLiveStore((state) => state.snapshot.tracks.find((track) => track.index === layer.index))
  return (
    <div className="flex flex-col gap-2 border-b border-ink-700/60 px-3 py-2.5" data-testid={`layer-${layer.index}`}>
      <div className="flex items-center gap-2">
        <Badge tone="violet">{`軌道 ${layer.index}`}</Badge>
        <Select label={`軌道 ${layer.index} 動作`} value={layer.animation} placeholder="（空）" options={options} onChange={(value) => controller.updateLayer(layer.index, { animation: value || null })} testId={`layer-${layer.index}-animation`} />
        <IconButton size="xs" label="重新播放此軌道" icon={<RotateCcw size={12} />} onClick={() => controller.restartLayer(layer.index)} />
        <IconButton size="xs" label="移除軌道" icon={<Trash size={12} />} onClick={() => controller.removeLayer(layer.index)} testId={`layer-${layer.index}-remove`} />
      </div>
      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
        <Slider label="疊加強度" value={layer.alpha} min={0} max={1} step={0.01} format={(value) => value.toFixed(2)} onChange={(value) => controller.updateLayer(layer.index, { alpha: value })} testId={`layer-${layer.index}-alpha`} />
        <div className="flex gap-1">
          {(['replace', 'add'] as MixBlendMode[]).map((blend) => (
            <Button key={blend} size="xs" variant={layer.blend === blend ? 'active' : 'default'} onClick={() => controller.updateLayer(layer.index, { blend })} className="font-mono uppercase" testId={`layer-${layer.index}-blend-${blend}`}>
              {blend === 'add' ? '累加' : '取代'}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="xs" variant={layer.loop ? 'active' : 'default'} onClick={() => controller.updateLayer(layer.index, { loop: !layer.loop })}>
          循環
        </Button>
        <Button size="xs" variant={layer.enabled ? 'active' : 'default'} onClick={() => controller.updateLayer(layer.index, { enabled: !layer.enabled })} testId={`layer-${layer.index}-enabled`}>
          {layer.enabled ? '啟用中' : '已靜音'}
        </Button>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-400" data-testid={`layer-${layer.index}-runtime`}>
          {runtime?.animation ? `${runtime.animation} ${runtime.animationTime.toFixed(2)}s` : '空'}
        </span>
      </div>
    </div>
  )
}

function LayersSection() {
  const controller = useController()
  const options = useAnimationOptions()
  const layers = useInspectorStore((state) => state.layers)
  const animation = useInspectorStore((state) => state.animation)
  return (
    <Panel
      title="多軌疊加"
      tag={<Badge>{`${layers.length + 1}/${MAX_LAYERS}`}</Badge>}
      actions={
        <Button size="xs" icon={<Plus size={12} />} disabled={layers.length >= MAX_LAYERS - 1 || options.length === 0} onClick={() => controller.addLayer()} testId="add-layer">
          新增軌道
        </Button>
      }
      className="border-b-0"
      testId="track-layers"
    >
      <div className="flex items-center gap-2 border-b border-ink-700/60 px-3 py-2">
        <Badge tone="accent">軌道 0</Badge>
        <span className="truncate font-mono text-xs text-ink-100">{animation ?? '--'}</span>
        <span className="ml-auto text-[11px] text-ink-400">由主動畫控制</span>
      </div>
      {layers.map((layer) => (
        <LayerRow key={layer.index} layer={layer} options={options} />
      ))}
      <p className="px-3 py-2 text-[11px] leading-relaxed text-ink-400">數字大的軌道會蓋在數字小的上面。例如軌道 0 播跑步、軌道 1 播射擊，可模擬上下半身分開動作。「取代」直接覆蓋，「累加」會疊加在下層動作上。</p>
    </Panel>
  )
}

export function MixLabPanel() {
  return (
    <div data-testid="mix-lab">
      <TransitionSection />
      <MixPairsSection />
      <LayersSection />
    </div>
  )
}
