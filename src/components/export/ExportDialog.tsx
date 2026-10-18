import { useEffect, type ReactNode } from 'react'
import { Archive, Camera, Film, LayoutGrid, X } from 'lucide-react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import type { ExportFormat } from '@/store/defaults'
import { Button, IconButton } from '../ui/Button'
import { Select } from '../ui/Select'
import { cx } from '../ui/cx'
import { ExportPreviewPanel } from './ExportPreviewPanel'
import { ExportSizeSection } from './ExportSizeSection'
import { Choice, NumberField } from './exportFields'
import { frameSize } from '@/core/export/exportPlan'

const FORMATS: ReadonlyArray<{ id: ExportFormat; title: string; description: string; icon: ReactNode }> = [
  { id: 'sequence', title: 'PNG 序列圖', description: '每一格一張透明 PNG，打包成 ZIP', icon: <Archive size={16} /> },
  { id: 'sheet', title: 'Sprite Sheet', description: '所有影格排成一張大圖，附座標 JSON', icon: <LayoutGrid size={16} /> },
  { id: 'frame', title: '目前畫面', description: '把畫面上這一格存成單張 PNG', icon: <Camera size={16} /> },
  { id: 'webm', title: 'WebM 影片', description: '錄成短片（透明度依瀏覽器支援）', icon: <Film size={16} /> },
]

const KIND_TEXT: Record<string, string> = { screenshot: '單張 PNG', sequence: 'PNG 序列圖', sheet: 'Sprite Sheet', webm: 'WebM 影片', atlas: '圖集拆解', region: '圖片' }

export function ExportDialog() {
  const controller = useController()
  const open = useInspectorStore((state) => state.exportOpen)
  const settings = useInspectorStore((state) => state.exportSettings)
  const status = useInspectorStore((state) => state.exportStatus)
  const asset = useInspectorStore((state) => state.asset)
  const supportsWebm = controller.supportsWebm()

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !useInspectorStore.getState().exportStatus.busy) controller.setExportOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, controller])

  if (!open || !asset) return null
  const animation = asset.animations.find((item) => item.name === settings.animation) ?? null
  const totalFrames = animation ? Math.max(1, Math.round(animation.duration * settings.fps)) : 0
  const lastFrame = Math.max(0, totalFrames - 1)
  const start = Math.min(settings.startFrame, lastFrame)
  const end = settings.endFrame === null ? lastFrame : Math.min(settings.endFrame, lastFrame)
  const frameCount = Math.max(0, end - start + 1)
  const isFrame = settings.format === 'frame'
  const update = controller.updateExportSettings.bind(controller)
  const crop = settings.sizeMode === 'crop' ? settings.crop : null
  const cropSize = crop ? frameSize(crop, settings.scale) : null
  const sizeText = cropSize ? `${cropSize.width}x${cropSize.height} 像素（裁剪範圍 x${settings.scale}）` : settings.sizeMode === 'fixed' ? `${settings.width}x${settings.height} 像素` : null
  const summary = isFrame
    ? `輸出目前畫面 1 張，${sizeText ?? `角色範圍 x${settings.scale}`}`
    : `輸出 ${frameCount} 格（第 ${start} 到 ${end} 格，共 ${totalFrames} 格），${settings.fps} fps，${sizeText ? `每格 ${sizeText}` : `依角色範圍 x${settings.scale}`}`

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-950/70 p-4" data-testid="export-dialog" role="dialog" aria-modal="true" aria-label="匯出動作">
      <div className="flex max-h-full w-[1060px] max-w-full flex-col overflow-hidden rounded-lg border border-ink-600 bg-ink-900 shadow-2xl">
        <header className="flex items-center gap-2 border-b border-ink-700 px-4 py-3">
          <h2 className="text-base font-semibold text-ink-100">匯出動作</h2>
          <span className="text-xs text-ink-400">背景預設透明，不受畫面縮放與除錯線影響</span>
          <IconButton size="sm" className="ml-auto" label="關閉" icon={<X size={14} />} disabled={status.busy} onClick={() => controller.setExportOpen(false)} testId="export-close" />
        </header>
        <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-ink-200">1. 輸出類型</h3>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map((format) => {
                const disabled = format.id === 'webm' && !supportsWebm
                return (
                  <button
                    key={format.id}
                    type="button"
                    disabled={disabled}
                    data-testid={`export-format-${format.id}`}
                    aria-pressed={settings.format === format.id}
                    onClick={() => update({ format: format.id })}
                    className={cx('flex items-start gap-3 rounded border p-3 text-left transition-colors disabled:opacity-40', settings.format === format.id ? 'border-accent-500 bg-accent-500/10' : 'border-ink-600 bg-ink-850 hover:border-ink-500')}
                  >
                    <span className={settings.format === format.id ? 'text-accent-400' : 'text-ink-300'}>{format.icon}</span>
                    <span className="flex flex-col">
                      <span className="text-sm text-ink-100">{format.title}</span>
                      <span className="text-[11px] text-ink-400">{disabled ? '此瀏覽器不支援' : format.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {!isFrame && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-ink-200">2. 動作與影格</h3>
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-4">
                  <Select label="匯出動作" value={settings.animation} options={asset.animations.map((item) => ({ value: item.name, label: `${item.name}（${item.duration.toFixed(2)} 秒）` }))} onChange={(value) => update({ animation: value, startFrame: 0, endFrame: null })} testId="export-animation" className="h-8" />
                </div>
                <NumberField label="影格速率" value={settings.fps} min={1} max={120} suffix="fps" onChange={(value) => update({ fps: value ?? 30, startFrame: 0, endFrame: null })} testId="export-fps" />
                <NumberField label="起始影格" value={settings.startFrame} min={0} max={lastFrame} onChange={(value) => update({ startFrame: value ?? 0 })} testId="export-start" />
                <NumberField label="結束影格" value={settings.endFrame ?? ''} placeholder={`${lastFrame}（最後）`} min={0} max={lastFrame} onChange={(value) => update({ endFrame: value })} testId="export-end" />
                {settings.format === 'webm' ? (
                  <NumberField label="重複次數" value={settings.loops} min={1} max={10} onChange={(value) => update({ loops: value ?? 1 })} testId="export-loops" />
                ) : settings.format === 'sheet' ? (
                  <NumberField label="每列格數" value={settings.columns || ''} placeholder="自動" min={0} max={64} onChange={(value) => update({ columns: value ?? 0 })} testId="export-columns" />
                ) : (
                  <span />
                )}
              </div>
            </div>
          )}

          <ExportSizeSection title={isFrame ? '2. 尺寸' : '3. 尺寸'} />

          <div>
            <h3 className="mb-2 text-xs font-semibold text-ink-200">{isFrame ? '3. 背景' : '4. 背景'}</h3>
            <div className="flex items-center gap-2">
              <Choice active={settings.background === null} onClick={() => update({ background: null })} testId="export-bg-transparent">
                透明
              </Choice>
              <Choice active={settings.background !== null} onClick={() => update({ background: settings.background ?? '#000000' })} testId="export-bg-color">
                純色
              </Choice>
              {settings.background !== null && (
                <input type="color" aria-label="背景顏色" value={settings.background} onChange={(event) => update({ background: event.target.value })} className="h-8 w-12 cursor-pointer rounded border border-ink-600 bg-ink-800" data-testid="export-color" />
              )}
            </div>
          </div>

          <div className="rounded border border-ink-700 bg-ink-850 px-3 py-2 text-xs text-ink-200" data-testid="export-summary">
            {summary}
          </div>

          {status.busy && (
            <div className="flex flex-col gap-1.5" data-testid="export-progress">
              <div className="flex items-center justify-between text-[11px] text-ink-400">
                <span>{status.kind ? `正在輸出 ${KIND_TEXT[status.kind]}` : ''}</span>
                <span className="tabular-nums text-accent-400">{`${Math.round(status.progress * 100)}%`}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
                <div className="h-full bg-accent-500" style={{ width: `${status.progress * 100}%` }} />
              </div>
            </div>
          )}
          {status.message && !status.busy && (
            <div className="rounded border border-signal-green/40 bg-signal-green/5 px-3 py-2 text-xs text-signal-green" data-testid="export-result">
              {`已下載：${status.message}`}
            </div>
          )}
          {status.error && !status.busy && (
            <div className="rounded border border-signal-red/40 bg-signal-red/5 px-3 py-2 text-xs text-signal-red" data-testid="export-error">
              {status.error}
            </div>
          )}
        </div>
        <ExportPreviewPanel />
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-ink-700 px-4 py-3">
          {status.busy ? (
            <Button variant="danger" onClick={() => controller.cancelExport()} testId="export-cancel">
              取消匯出
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => controller.setExportOpen(false)}>
              關閉
            </Button>
          )}
          <Button size="md" variant="primary" disabled={status.busy || (!isFrame && !animation)} onClick={() => void controller.exportSelected()} testId="export-run">
            開始匯出
          </Button>
        </footer>
      </div>
    </div>
  )
}
