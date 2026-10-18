import { useInspectorStore } from '@/store/inspectorStore'
import { useLiveStore } from '@/store/liveStore'
import { BONE_FIELD_LABEL, type BoneNumericField } from '@/core/editor/commands'
import { Badge } from '../ui/Badge'

export function StageHud() {
  const animation = useInspectorStore((state) => state.animation)
  const playing = useInspectorStore((state) => state.playing)
  const speed = useInspectorStore((state) => state.speed)
  const setupMode = useInspectorStore((state) => state.setupMode)
  const animateMode = useInspectorStore((state) => state.animateMode)
  const autoKey = useInspectorStore((state) => state.autoKey)
  const selectedBone = useInspectorStore((state) => (state.selection?.kind === 'bone' ? state.selection.name : null))
  const preview = useLiveStore((state) => state.gizmoPreview)
  const tracks = useLiveStore((state) => state.snapshot.tracks)
  const main = tracks.find((track) => track.index === 0)
  const layered = tracks.filter((track) => track.index > 0 && track.animation)
  return (
    <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1" data-testid="stage-hud">
      {(setupMode || animateMode) && (
        <div className="flex flex-col items-end gap-1" data-testid="hud-setup">
          {setupMode ? <Badge tone="violet">設置模式</Badge> : <Badge tone="red" testId="hud-animate">{autoKey ? '動畫模式・自動 K 幀' : '動畫模式'}</Badge>}
          <span className="rounded border border-ink-700 bg-ink-950/80 px-2 py-1 text-[10px] text-ink-300">
            {selectedBone ? (playing ? '暫停後即可拖曳控制軸' : `拖曳控制軸調整 ${selectedBone}；Shift 吸附、Esc 取消${animateMode ? (autoKey ? '；放開即寫入關鍵影格' : '；按 K 寫入關鍵影格') : ''}`) : '點選骨骼後即可拖曳控制軸'}
          </span>
          {preview && (
            <span className="rounded border border-accent-500/40 bg-ink-950/80 px-2 py-1 font-mono text-[10px] text-accent-400" data-testid="hud-gizmo-preview">
              {Object.entries(preview.values)
                .map(([field, value]) => `${BONE_FIELD_LABEL[field as BoneNumericField]} ${value}`)
                .join('  ')}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center gap-1">
        <Badge tone={playing ? 'green' : 'amber'}>{playing ? '播放中' : '已暫停'}</Badge>
        <Badge tone="accent">{`${speed.toFixed(2)}x`}</Badge>
        <Badge>{animation ?? '--'}</Badge>
      </div>
      {main?.mixingFrom && (
        <div className="flex items-center gap-2 rounded border border-signal-violet/40 bg-ink-950/80 px-2 py-1 font-mono text-[10px] text-signal-violet" data-testid="hud-mixing">
          <span>過渡中 {main.mixingFrom} 到 {main.animation}</span>
          <span className="tabular-nums">{Math.round(main.mixProgress * 100)}%</span>
        </div>
      )}
      {layered.map((track) => (
        <Badge key={track.index} tone="violet">{`軌道 ${track.index}：${track.animation}`}</Badge>
      ))}
    </div>
  )
}
