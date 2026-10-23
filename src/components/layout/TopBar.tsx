import { useRef } from 'react'
import { Bone, Box, Download, FileJson, FolderInput, FolderOpen, Redo2, ShieldCheck, Undo2, Wrench } from 'lucide-react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import { Badge } from '../ui/Badge'
import { Button, IconButton } from '../ui/Button'

export const ACCEPTED_FILES = '.json,.skel,.bytes,.atlas,.txt,.png,.webp,.jpg,.jpeg,.avif,.zip'

export function TopBar() {
  const controller = useController()
  const asset = useInspectorStore((state) => state.asset)
  const status = useInspectorStore((state) => state.status)
  const advancedOpen = useInspectorStore((state) => state.advancedOpen)
  const editor = useInspectorStore((state) => state.editor)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    const files = await controller.readInput(Array.from(list))
    if (files) await controller.loadFiles(files)
  }

  return (
    <header className="col-span-2 flex items-center gap-3 border-b border-ink-700 bg-ink-900 px-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded border border-accent-500/50 bg-accent-500/10 text-accent-400">
          <Bone size={16} strokeWidth={2} />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold tracking-wide text-ink-100">Spine 動畫檢視器</span>
          <span className="text-[10px] text-ink-400">離線檢視、檢查與匯出骨骼動畫</span>
        </div>
      </div>
      <div className="mx-1 h-7 w-px bg-ink-700" />
      <div className="flex items-center gap-1.5">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPTED_FILES}
          className="hidden"
          data-testid="file-input"
          onChange={(event) => {
            void handleFiles(event.target.files)
            event.target.value = ''
          }}
        />
        <input
          ref={folderInput}
          type="file"
          multiple
          className="hidden"
          data-testid="folder-input"
          {...({ webkitdirectory: '' } as Record<string, string>)}
          onChange={(event) => {
            void handleFiles(event.target.files)
            event.target.value = ''
          }}
        />
        <Button size="sm" icon={<FolderOpen size={14} />} onClick={() => fileInput.current?.click()} testId="open-files" title="選取 .skel / .json、.atlas、.png，或整包 .zip">
          開啟檔案
        </Button>
        <Button size="sm" icon={<FolderInput size={14} />} onClick={() => folderInput.current?.click()} testId="open-folder">
          開啟資料夾
        </Button>
        <Button size="sm" variant="ghost" icon={<Box size={14} />} onClick={() => void controller.loadDemo()} testId="load-demo">
          示範角色
        </Button>
      </div>
      <div className="mx-1 h-7 w-px bg-ink-700" />
      <div className="flex min-w-0 items-center gap-1.5" data-testid="asset-badges">
        {asset ? (
          <>
            <span className="truncate text-sm text-ink-100" data-testid="asset-name">
              {asset.name}
            </span>
            <Badge tone={asset.origin === 'demo' ? 'violet' : 'accent'}>{asset.origin === 'demo' ? '示範' : '本機'}</Badge>
            <Badge>{asset.format === 'json' ? 'JSON' : 'SKEL'}</Badge>
            <Badge tone={asset.upgradedFrom ? 'violet' : asset.version.compatible ? 'green' : 'amber'} testId="asset-version">
              {`v${asset.version.raw ?? '未知'}`}
            </Badge>
            {asset.upgradedFrom && (
              <Badge tone="violet" title="已自動升級為 4.2 結構" testId="asset-upgraded">
                已升級 4.2
              </Badge>
            )}
          </>
        ) : (
          <Badge tone={status === 'error' ? 'red' : 'neutral'}>{status === 'loading' ? '讀取中' : '尚未載入'}</Badge>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        {asset && editor.enabled && (
          <div className="flex items-center gap-1" data-testid="edit-toolbar">
            {editor.dirty && (
              <Badge tone="amber" testId="edit-dirty" title="編輯內容尚未儲存為 JSON">
                未儲存變更
              </Badge>
            )}
            <IconButton size="md" variant="default" label={editor.undoLabel ? `復原：${editor.undoLabel}（Ctrl+Z）` : '復原（Ctrl+Z）'} icon={<Undo2 size={14} />} disabled={!editor.canUndo} onClick={() => controller.editor.undo()} testId="edit-undo" />
            <IconButton size="md" variant="default" label={editor.redoLabel ? `重做：${editor.redoLabel}（Ctrl+Shift+Z）` : '重做（Ctrl+Shift+Z）'} icon={<Redo2 size={14} />} disabled={!editor.canRedo} onClick={() => controller.editor.redo()} testId="edit-redo" />
            <Button size="md" icon={<FileJson size={14} />} onClick={() => controller.editor.saveJson()} testId="topbar-save-json" title="儲存為 Spine 4.2 JSON（Ctrl+S）">
              儲存 JSON
            </Button>
            <div className="mx-1 h-7 w-px bg-ink-700" />
          </div>
        )}
        <Button size="md" variant="primary" icon={<Download size={14} />} disabled={!asset} onClick={() => controller.setExportOpen(true)} testId="export-open">
          匯出
        </Button>
        <Button size="md" variant={advancedOpen ? 'active' : 'default'} icon={<Wrench size={14} />} disabled={!asset} onClick={() => controller.setAdvancedOpen(!advancedOpen)} testId="advanced-toggle" aria-pressed={advancedOpen}>
          進階工具
        </Button>
        <div className="mx-1 h-7 w-px bg-ink-700" />
        <Badge tone="green" title="所有解析與渲染都在本機瀏覽器內完成，不會上傳任何檔案">
          <ShieldCheck size={10} className="mr-1" />
          離線運作
        </Badge>
      </div>
    </header>
  )
}
