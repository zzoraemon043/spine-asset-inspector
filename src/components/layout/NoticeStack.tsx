import { useEffect } from 'react'
import { X } from 'lucide-react'
import { dismissNotice, useInspectorStore, type Notice } from '@/store/inspectorStore'
import { cx } from '../ui/cx'

const TONE: Record<Notice['level'], string> = {
  info: 'border-ink-500 text-ink-200',
  success: 'border-signal-green/60 text-signal-green',
  warning: 'border-signal-amber/60 text-signal-amber',
  error: 'border-signal-red/60 text-signal-red',
}

const LABEL: Record<Notice['level'], string> = {
  info: '提示',
  success: '完成',
  warning: '注意',
  error: '錯誤',
}

function NoticeItem({ notice }: { notice: Notice }) {
  useEffect(() => {
    const timer = window.setTimeout(() => dismissNotice(notice.id), notice.level === 'error' ? 8000 : 4000)
    return () => window.clearTimeout(timer)
  }, [notice.id, notice.level])
  return (
    <div role="status" data-testid={`notice-${notice.level}`} className={cx('pointer-events-auto flex max-w-sm items-start gap-2 rounded border-l-2 border border-ink-700 bg-ink-850/95 px-3 py-2 shadow-lg', TONE[notice.level])}>
      <span className="font-mono text-[10px] font-bold tracking-wider">{LABEL[notice.level]}</span>
      <span className="min-w-0 flex-1 break-words text-xs text-ink-100">{notice.text}</span>
      <button type="button" aria-label="關閉通知" className="text-ink-400 hover:text-ink-100" onClick={() => dismissNotice(notice.id)}>
        <X size={12} />
      </button>
    </div>
  )
}

export function NoticeStack() {
  const notices = useInspectorStore((state) => state.notices)
  return (
    <div className="pointer-events-none fixed bottom-8 right-4 z-50 flex flex-col items-end gap-2">
      {notices.map((notice) => (
        <NoticeItem key={notice.id} notice={notice} />
      ))}
    </div>
  )
}
