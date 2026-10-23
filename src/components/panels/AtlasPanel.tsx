import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Archive, Download, ImageUp, RotateCcw, Search } from 'lucide-react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import { isTrimmed, packedSize, type AtlasRegionInfo } from '@/core/atlas/atlasModel'
import { Panel, EmptyState } from '../ui/Panel'
import { Badge } from '../ui/Badge'
import { Button, IconButton } from '../ui/Button'
import { Select } from '../ui/Select'
import { TextInput } from '../ui/TextInput'
import { Toggle } from '../ui/Toggle'
import { cx } from '../ui/cx'

function PagePreview({ page, regions, selected, replaced }: { page: string; regions: readonly AtlasRegionInfo[]; selected: string | null; replaced: Record<string, unknown> }) {
  const controller = useController()
  const ref = useRef<HTMLCanvasElement>(null)
  const info = useInspectorStore((state) => state.atlas?.pages.find((item) => item.name === page) ?? null)
  useEffect(() => {
    const canvas = ref.current
    const image = controller.atlas.pageImage(page)
    if (!canvas || !info) return
    const scale = Math.min(1, 340 / info.width)
    canvas.width = Math.max(1, Math.round(info.width * scale))
    canvas.height = Math.max(1, Math.round(info.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (image) context.drawImage(image, 0, 0, canvas.width, canvas.height)
    for (const region of regions) {
      if (region.page !== page) continue
      const size = packedSize(region)
      const active = region.id === selected
      context.strokeStyle = active ? '#22d3ee' : region.id in replaced ? '#f59e0b' : 'rgba(221, 227, 236, 0.25)'
      context.lineWidth = active ? 2 : 1
      context.strokeRect(region.x * scale + 0.5, region.y * scale + 0.5, size.width * scale, size.height * scale)
    }
  }, [controller, page, info, regions, selected, replaced])
  return <canvas ref={ref} data-testid="atlas-page-preview" className="stage-checker mx-auto block max-w-full rounded border border-ink-700" />
}

function RegionRow({ region, selected, replaced }: { region: AtlasRegionInfo; selected: boolean; replaced: { fileName: string; width: number; height: number; attachments: number } | undefined }) {
  const controller = useController()
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const replaceWith = async (list: FileList | File[] | null) => {
    const file = list ? Array.from(list)[0] : undefined
    if (!file) return
    const virtual = (await controller.readInput([file]))?.[0]
    if (virtual) await controller.atlas.replaceRegionImage(region.id, virtual)
  }
  const onDrop = (event: DragEvent<HTMLLIElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setDragging(false)
    void replaceWith(Array.from(event.dataTransfer.files))
  }
  return (
    <li
      data-testid={`atlas-region-${region.id}`}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('Files')) return
        event.preventDefault()
        event.stopPropagation()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cx('flex items-center gap-1.5 border-l-2 px-2 py-1', selected ? 'border-accent-500 bg-accent-500/10' : 'border-transparent hover:bg-ink-800', dragging && 'bg-signal-amber/10 outline outline-1 outline-signal-amber')}
    >
      <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={() => controller.atlas.selectRegion(selected ? null : region.id)} data-testid={`atlas-select-${region.id}`}>
        <span className="flex items-center gap-1.5">
          <span className="truncate font-mono text-xs text-ink-100">{region.id}</span>
          {region.degrees !== 0 && <Badge tone="violet">{`旋轉 ${region.degrees}`}</Badge>}
          {isTrimmed(region) && <Badge>已裁切</Badge>}
          {replaced && <Badge tone="amber" testId={`atlas-replaced-${region.id}`}>已替換</Badge>}
        </span>
        <span className="truncate font-mono text-[10px] text-ink-400">
          {replaced ? `${replaced.fileName} ${replaced.width}x${replaced.height}，影響 ${replaced.attachments} 個部件` : `${region.width}x${region.height}，原始 ${region.originalWidth}x${region.originalHeight}，位置 ${region.x},${region.y}`}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".png,.webp,.jpg,.jpeg"
        className="hidden"
        data-testid={`atlas-replace-input-${region.id}`}
        onChange={(event) => {
          void replaceWith(event.target.files)
          event.target.value = ''
        }}
      />
      <IconButton size="xs" label={`下載 ${region.id} PNG`} icon={<Download size={12} />} onClick={() => void controller.atlas.exportRegion(region.id)} testId={`atlas-download-${region.id}`} />
      <IconButton size="xs" label={`替換 ${region.id} 貼圖`} icon={<ImageUp size={12} />} onClick={() => input.current?.click()} testId={`atlas-replace-${region.id}`} />
      {replaced && <IconButton size="xs" label={`還原 ${region.id}`} variant="danger" icon={<RotateCcw size={12} />} onClick={() => controller.atlas.restoreRegion(region.id)} testId={`atlas-restore-${region.id}`} />}
    </li>
  )
}

export function AtlasPanel() {
  const controller = useController()
  const atlas = useInspectorStore((state) => state.atlas)
  const selected = useInspectorStore((state) => state.selectedRegion)
  const filter = useInspectorStore((state) => state.regionFilter)
  const restore = useInspectorStore((state) => state.restoreWhitespace)
  const replaced = useInspectorStore((state) => state.regionOverrides)
  const busy = useInspectorStore((state) => state.exportStatus.busy)
  const [page, setPage] = useState<string | null>(null)
  const pageName = page && atlas?.pages.some((item) => item.name === page) ? page : atlas?.pages[0]?.name ?? null
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return (atlas?.regions ?? []).filter((region) => region.id.toLowerCase().includes(needle))
  }, [atlas, filter])
  if (!atlas) {
    return (
      <Panel title="圖集工具" testId="atlas-panel">
        <EmptyState>載入資產後可拆解圖集</EmptyState>
      </Panel>
    )
  }
  const replacedCount = Object.keys(replaced).length
  return (
    <div data-testid="atlas-panel">
      <Panel title="圖集工具" tag={<Badge>{`${atlas.pages.length} 頁 / ${atlas.regions.length} 張圖`}</Badge>}>
        <div className="flex flex-col gap-2 p-3">
          {atlas.pages.length > 1 && <Select label="圖集頁面" value={pageName} options={atlas.pages.map((item) => ({ value: item.name, label: `${item.name} ${item.width}x${item.height}` }))} onChange={setPage} testId="atlas-page-select" />}
          {pageName && <PagePreview page={pageName} regions={atlas.regions} selected={selected} replaced={replaced} />}
          <div className="flex flex-wrap gap-1">
            {atlas.pages.map((item) => (
              <Badge key={item.name}>{`${item.name} ${item.width}x${item.height}${item.pma ? ' pma' : ''}`}</Badge>
            ))}
          </div>
          <Toggle label="還原原始留白" description="輸出成美術原本的圖片尺寸" checked={restore} onChange={(value) => controller.atlas.setRestoreWhitespace(value)} testId="atlas-restore-whitespace" />
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" icon={<Archive size={13} />} disabled={busy} onClick={() => void controller.atlas.exportArchive()} testId="atlas-export-zip">
              全部拆成單張 PNG（ZIP）
            </Button>
            <Button icon={<RotateCcw size={13} />} disabled={replacedCount === 0} onClick={() => controller.atlas.restoreAll()} testId="atlas-restore-all">
              還原所有替換
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-ink-400">可把大圖拆回每一張原始小圖（無損、會自動轉正）。要換圖時，把單張 PNG 拖到下方清單的那一列，或按該列的「替換」按鈕，畫面會立即更新；替換只在這次開啟期間有效。</p>
        </div>
      </Panel>
      <Panel title="圖片清單" tag={<Badge>{visible.length}</Badge>} className="border-b-0">
        <div className="p-2">
          <TextInput icon={<Search size={12} />} placeholder="搜尋圖片名稱" value={filter} onChange={(event) => controller.atlas.setFilter(event.target.value)} testId="atlas-filter" />
        </div>
        {visible.length === 0 && <EmptyState>沒有符合的 Region</EmptyState>}
        <ul className="pb-2">
          {visible.map((region) => (
            <RegionRow key={region.id} region={region} selected={selected === region.id} replaced={replaced[region.id]} />
          ))}
        </ul>
      </Panel>
    </div>
  )
}
