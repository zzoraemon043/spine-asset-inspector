import { useInspectorStore } from '@/store/inspectorStore'
import { useLiveStore } from '@/store/liveStore'
import { cx } from '../ui/cx'

const STATUS_LABEL = { idle: '待命', loading: '讀取中', ready: '就緒', error: '錯誤' } as const

export function StatusBar() {
  const status = useInspectorStore((state) => state.status)
  const asset = useInspectorStore((state) => state.asset)
  const skins = useInspectorStore((state) => state.activeSkins.length)
  const fps = useLiveStore((state) => state.renderFps)
  const zoom = useLiveStore((state) => state.zoom)
  const pointer = useLiveStore((state) => state.pointer)
  const dot = status === 'ready' ? 'bg-signal-green' : status === 'loading' ? 'bg-signal-amber' : status === 'error' ? 'bg-signal-red' : 'bg-ink-500'
  return (
    <footer className="flex min-w-0 items-center gap-4 overflow-hidden lg:col-span-2 border-t border-ink-700 bg-ink-900 px-3 text-[11px] text-ink-400" data-testid="status-bar">
      <span className="flex items-center gap-1.5">
        <span className={cx('h-1.5 w-1.5 rounded-full', dot)} />
        <span data-testid="load-status" data-status={status}>
          {STATUS_LABEL[status]}
        </span>
      </span>
      {asset && (
        <>
          <span>骨骼 {asset.stats.bones}</span>
          <span>插槽 {asset.stats.slots}</span>
          <span>動畫 {asset.stats.animations}</span>
          <span data-testid="status-skins">{`皮膚 ${skins}/${asset.stats.skins}`}</span>
        </>
      )}
      <span className="ml-auto">
        縮放 <span data-testid="zoom-level">{Math.round(zoom * 100)}%</span>
      </span>
      <span className="w-40 truncate font-mono">{pointer ? `座標 ${pointer.x.toFixed(1)}, ${pointer.y.toFixed(1)}` : '座標 --'}</span>
      <span data-testid="render-fps">{fps} fps</span>
    </footer>
  )
}
