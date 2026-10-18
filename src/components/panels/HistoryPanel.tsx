import { FileJson, Redo2, Undo2 } from 'lucide-react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'

export function HistoryPanel() {
  const controller = useController()
  const editor = useInspectorStore((state) => state.editor)
  if (!editor.enabled) {
    return (
      <div className="px-3 py-4 text-xs text-ink-400" data-testid="history-panel">
        {editor.reason ?? '載入可編輯的骨架後，這裡會列出每一步編輯紀錄。'}
      </div>
    )
  }
  const rows = [{ label: '開啟檔案（原始狀態）', time: null as number | null }, ...editor.entries.map((entry) => ({ label: entry.label, time: entry.time as number | null }))]
  return (
    <div className="flex flex-col gap-2 p-3" data-testid="history-panel">
      <div className="flex items-center gap-2">
        <Button size="xs" icon={<Undo2 size={12} />} disabled={!editor.canUndo} onClick={() => controller.editor.undo()} testId="history-undo">
          復原
        </Button>
        <Button size="xs" icon={<Redo2 size={12} />} disabled={!editor.canRedo} onClick={() => controller.editor.redo()} testId="history-redo">
          重做
        </Button>
        <Button size="xs" variant="primary" className="ml-auto" icon={<FileJson size={12} />} onClick={() => controller.editor.saveJson()}>
          儲存 JSON
        </Button>
      </div>
      <p className="text-[11px] text-ink-400">點選任一步驟即可回到該狀態；之後再做新的修改會捨棄後面的步驟。最多保留 200 步。</p>
      <ol className="flex flex-col gap-0.5" data-testid="history-list">
        {rows.map((row, index) => {
          const current = index === editor.index
          const future = index > editor.index
          return (
            <li key={`${index}-${row.label}`}>
              <button
                type="button"
                aria-current={current ? 'step' : undefined}
                data-testid={`history-entry-${index}`}
                onClick={() => controller.editor.jump(index)}
                className={cx(
                  'flex w-full items-center gap-2 rounded border px-2 py-1 text-left text-xs transition-colors',
                  current ? 'border-accent-500/60 bg-accent-500/15 text-accent-400' : 'border-transparent hover:bg-ink-750',
                  future ? 'text-ink-500 line-through' : !current && 'text-ink-200',
                )}
              >
                <span className="w-6 shrink-0 font-mono text-[10px] text-ink-400">{index}</span>
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                {editor.savedIndex === index && <span className="shrink-0 rounded bg-signal-green/15 px-1 text-[10px] text-signal-green">已儲存</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
