import { useController } from '@/controller/ControllerContext'
import { useInspectorStore, type CropRect } from '@/store/inspectorStore'
import { useLiveStore } from '@/store/liveStore'
import { Button } from '../ui/Button'
import { Choice, NumberField } from './exportFields'
import { enclosingCrop } from '@/core/export/previewDrag'

const CROP_FIELD = 100000

const HINTS = {
  scale: '畫布大小依整段動作的最大範圍計算，所有影格尺寸相同。',
  fixed: '角色會等比例縮放放入指定畫布，所有影格尺寸相同。',
  crop: '以骨架座標指定裁剪範圍（X、Y 為左下角），角色大小不變；輸出尺寸 = 裁剪範圍 x 縮放倍率，也可在右側預覽直接拖曳裁剪框。',
} as const

export function ExportSizeSection({ title }: { title: string }) {
  const controller = useController()
  const settings = useInspectorStore((state) => state.exportSettings)
  const preview = useLiveStore((state) => state.exportPreview)
  const update = controller.updateExportSettings.bind(controller)
  const crop = settings.crop

  const setCrop = (patch: Partial<CropRect>) => {
    const base = settings.crop ?? preview?.frameWorld ?? { x: -settings.width / 2, y: 0, width: settings.width, height: settings.height }
    update({ sizeMode: 'crop', crop: { ...base, ...patch } })
  }

  const resetCrop = () => {
    if (preview) update({ sizeMode: 'crop', crop: enclosingCrop(preview.contentWorld) })
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-ink-200">{title}</h3>
      <div className="mb-2 flex flex-wrap gap-2">
        <Choice active={settings.sizeMode === 'scale'} onClick={() => update({ sizeMode: 'scale' })} testId="export-size-scale">
          依角色大小與倍率
        </Choice>
        <Choice active={settings.sizeMode === 'fixed'} onClick={() => update({ sizeMode: 'fixed' })} testId="export-size-fixed">
          指定寬高（像素）
        </Choice>
        <Choice active={settings.sizeMode === 'crop'} onClick={() => setCrop({})} testId="export-size-crop">
          自訂裁剪範圍
        </Choice>
      </div>
      {settings.sizeMode === 'crop' ? (
        <div className="grid grid-cols-4 gap-2">
          <NumberField label="X" value={crop?.x ?? 0} min={-CROP_FIELD} max={CROP_FIELD} onChange={(value) => setCrop({ x: value ?? 0 })} testId="export-crop-x" />
          <NumberField label="Y" value={crop?.y ?? 0} min={-CROP_FIELD} max={CROP_FIELD} onChange={(value) => setCrop({ y: value ?? 0 })} testId="export-crop-y" />
          <NumberField label="寬" value={crop?.width ?? 1} min={1} max={CROP_FIELD} onChange={(value) => setCrop({ width: value ?? 1 })} testId="export-crop-width" />
          <NumberField label="高" value={crop?.height ?? 1} min={1} max={CROP_FIELD} onChange={(value) => setCrop({ height: value ?? 1 })} testId="export-crop-height" />
          <NumberField label="縮放倍率" value={settings.scale} min={0.1} max={8} step={0.25} suffix="倍" onChange={(value) => update({ scale: value ?? 1 })} testId="export-scale" />
          <div className="col-span-3 flex items-end">
            <Button size="sm" onClick={resetCrop} disabled={!preview} testId="export-crop-reset">
              重設為角色範圍
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {settings.sizeMode === 'fixed' ? (
            <>
              <NumberField label="寬度" value={settings.width} min={1} max={4096} suffix="px" onChange={(value) => update({ width: value ?? 1 })} testId="export-width" />
              <NumberField label="高度" value={settings.height} min={1} max={4096} suffix="px" onChange={(value) => update({ height: value ?? 1 })} testId="export-height" />
            </>
          ) : (
            <NumberField label="倍率" value={settings.scale} min={0.1} max={8} step={0.25} suffix="倍" onChange={(value) => update({ scale: value ?? 1 })} testId="export-scale" />
          )}
          <NumberField label="四周留白" value={settings.padding} min={0} max={256} suffix="px" onChange={(value) => update({ padding: value ?? 0 })} testId="export-padding" />
        </div>
      )}
      <p className="mt-1 text-[11px] text-ink-400" data-testid="export-size-hint">
        {HINTS[settings.sizeMode]}
      </p>
      {settings.sizeMode !== 'crop' && (
        <>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-400">對齊</span>
              <div className="flex gap-1">
                <Choice active={settings.align === 'center'} onClick={() => update({ align: 'center' })} testId="export-align-center">
                  置中
                </Choice>
                <Choice active={settings.align === 'bottom'} onClick={() => update({ align: 'bottom' })} testId="export-align-bottom">
                  底部對齊
                </Choice>
              </div>
            </div>
            <div className="w-28">
              <NumberField label="水平位移" value={settings.offsetX} min={-4096} max={4096} suffix="px" onChange={(value) => update({ offsetX: value ?? 0 })} testId="export-offset-x" />
            </div>
            <div className="w-28">
              <NumberField label="垂直位移" value={settings.offsetY} min={-4096} max={4096} suffix="px" onChange={(value) => update({ offsetY: value ?? 0 })} testId="export-offset-y" />
            </div>
          </div>
          <p className="mt-1 text-[11px] text-ink-400">位移以輸出像素計算，往右、往下為正；位移過大可能使角色超出畫布，請以右側預覽確認。</p>
        </>
      )}
    </div>
  )
}
