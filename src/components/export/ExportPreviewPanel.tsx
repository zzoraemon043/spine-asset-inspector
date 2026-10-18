import { useEffect, useRef } from 'react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import { useLiveStore } from '@/store/liveStore'
import type { PreviewRect } from '@/controller/types'
import { PREVIEW_BOX } from '@/controller/features/exportPreviewFeature'
import { cx } from '../ui/cx'
import { PreviewDragLayer } from './PreviewDragLayer'
import { frameSize } from '@/core/export/exportPlan'
import { worldToView } from '@/core/export/placement'
import { enclosingCrop } from '@/core/export/previewDrag'

const REQUEST_DELAY = 120

function Box({ rect, className, testId, dashed }: { rect: PreviewRect; className: string; testId: string; dashed?: boolean }) {
  return (
    <rect
      x={rect.x}
      y={rect.y}
      width={Math.max(0, rect.width)}
      height={Math.max(0, rect.height)}
      className={cx('fill-none', className)}
      strokeWidth={1}
      strokeDasharray={dashed ? '4 3' : undefined}
      vectorEffect="non-scaling-stroke"
      data-testid={testId}
    />
  )
}

export function ExportPreviewPanel() {
  const controller = useController()
  const settings = useInspectorStore((state) => state.exportSettings)
  const preview = useInspectorStore((state) => state.exportPreview)
  const result = useLiveStore((state) => state.exportPreview)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => void controller.exportPreview.request(), REQUEST_DELAY)
    return () => window.clearTimeout(timer)
  }, [controller, settings])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !result) return
    canvas.width = result.image.width
    canvas.height = result.image.height
    const context = canvas.getContext('2d')
    if (!context) return
    context.putImageData(new ImageData(new Uint8ClampedArray(result.image.pixels), result.image.width, result.image.height), 0, 0)
  }, [result])

  if (!controller.exportPreview.supported) return null
  const crop = settings.sizeMode === 'crop' ? settings.crop : null
  const outputSize = crop ? frameSize(crop, settings.scale) : result ? { width: result.frameWidth, height: result.frameHeight, scale: result.frameWidth / Math.max(1e-6, result.frameWorld.width) } : null
  const frameWorld = crop ?? result?.frameWorld ?? null
  const frameRect = result && frameWorld ? worldToView(frameWorld, result.view, result.viewScale) : null
  const width = result ? result.image.width : PREVIEW_BOX.width
  const height = result ? result.image.height : Math.round(PREVIEW_BOX.height * 0.6)
  const percent = result && outputSize ? Math.round((result.viewScale / outputSize.scale) * 100) : 100
  const resetCrop = () => {
    if (result) controller.updateExportSettings({ sizeMode: 'crop', crop: enclosingCrop(result.contentWorld) })
  }
  const sequence = settings.format !== 'frame'
  return (
    <aside className="flex w-[400px] shrink-0 flex-col gap-3 border-l border-ink-700 bg-ink-850 px-4 py-4" data-testid="export-preview">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold text-ink-200">即時預覽</h3>
        <span className="font-mono text-[11px] text-ink-400" data-testid="export-preview-size">
          {outputSize ? `${outputSize.width}x${outputSize.height} 像素，預覽 ${percent}%` : '--'}
        </span>
        {preview.status === 'loading' && <span className="ml-auto text-[11px] text-accent-400">更新中</span>}
      </div>
      <div className="flex items-center justify-center overflow-hidden rounded border border-ink-700 bg-ink-950 p-3" style={{ minHeight: PREVIEW_BOX.height + 24 }}>
        <div className={cx('relative', settings.background === null && 'stage-checker')} style={{ width, height }} data-testid="export-preview-frame-box">
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" data-testid="export-preview-canvas" />
          {result && frameRect && (
            <svg className="pointer-events-none absolute inset-0 overflow-visible" width={width} height={height} viewBox={`0 0 ${width} ${height}`} data-testid="export-preview-overlay">
              <path
                d={`M0 0H${width}V${height}H0Z M${frameRect.x} ${frameRect.y}V${frameRect.y + frameRect.height}H${frameRect.x + frameRect.width}V${frameRect.y}Z`}
                fillRule="evenodd"
                className="fill-black/55"
                data-testid="export-preview-mask"
              />
              <Box rect={frameRect} className="stroke-accent-400" testId="export-preview-border" />
              {!crop && <Box rect={result.padded} className="stroke-signal-amber" dashed testId="export-preview-padding" />}
              <Box rect={result.content} className="stroke-signal-violet" testId="export-preview-content" />
              {sequence && <Box rect={result.pose} className="stroke-signal-green" dashed testId="export-preview-pose" />}
            </svg>
          )}
          {result && frameRect && frameWorld && <PreviewDragLayer rect={frameRect} view={result.view} viewScale={result.viewScale} crop={frameWorld} onReset={resetCrop} />}
        </div>
      </div>
      <p className="text-[11px] text-ink-400" data-testid="export-preview-hint">拖曳裁剪框的邊或角只移動那一邊、角色大小不變；拖曳框內移動裁剪範圍，雙擊重設為角色範圍。拖曳後自動切換為自訂裁剪範圍，輸出尺寸 = 裁剪範圍 x 縮放倍率。</p>
      {sequence && result && (
        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-[11px] text-ink-400">
            <span>預覽影格</span>
            <span className="font-mono text-ink-200" data-testid="export-preview-frame-label">{`第 ${result.firstFrame + result.frame} 格（${result.frame + 1} / ${result.frameCount}）`}</span>
          </span>
          <input
            type="range"
            aria-label="預覽影格"
            className="range-input"
            min={0}
            max={Math.max(0, result.frameCount - 1)}
            step={1}
            value={preview.frame}
            onChange={(event) => void controller.exportPreview.request(Number(event.target.value))}
            data-testid="export-preview-frame"
          />
        </label>
      )}
      {result && (
        <div className="flex flex-col gap-1 text-[11px]" data-testid="export-preview-status">
          <span className={result.contentOverflow > 0 ? 'text-signal-red' : 'text-signal-green'} data-testid="export-preview-content-status">
            {result.contentOverflow > 0 ? `整段動作超出畫布 ${result.contentOverflow} 像素，會被裁切` : '整段動作都在畫布內，不會被裁切'}
          </span>
          {sequence && (
            <span className={result.poseOverflow > 0 ? 'text-signal-red' : 'text-ink-300'} data-testid="export-preview-pose-status">
              {result.poseOverflow > 0 ? `此影格超出畫布 ${result.poseOverflow} 像素` : '此影格完整顯示'}
            </span>
          )}
        </div>
      )}
      {preview.status === 'error' && (
        <span className="text-[11px] text-signal-red" data-testid="export-preview-error">
          {preview.error}
        </span>
      )}
      <ul className="flex flex-col gap-0.5 text-[10px] text-ink-400">
        <li className="flex items-center gap-1.5"><span className="h-px w-4 bg-accent-400" />輸出範圍（框外變暗為裁掉的部分）</li>
        {!crop && <li className="flex items-center gap-1.5"><span className="h-px w-4 border-t border-dashed border-signal-amber" />留白範圍（往內即四周留白）</li>}
        <li className="flex items-center gap-1.5"><span className="h-px w-4 bg-signal-violet" />整段動作的最大範圍</li>
        {sequence && <li className="flex items-center gap-1.5"><span className="h-px w-4 border-t border-dashed border-signal-green" />目前預覽影格的角色範圍</li>}
      </ul>
    </aside>
  )
}
