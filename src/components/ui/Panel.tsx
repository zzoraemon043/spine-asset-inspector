import type { ReactNode } from 'react'
import { cx } from './cx'

export function Panel({ title, tag, actions, children, className, bodyClassName, testId }: { title: string; tag?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; testId?: string }) {
  return (
    <section data-testid={testId} className={cx('flex min-h-0 flex-col border-b border-ink-700', className)}>
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-ink-700/60 bg-ink-850 px-3">
        <h2 className="text-xs font-semibold text-ink-200">{title}</h2>
        {tag}
        <div className="ml-auto flex items-center gap-1">{actions}</div>
      </header>
      <div className={cx('min-h-0', bodyClassName)}>{children}</div>
    </section>
  )
}

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1 flex items-center justify-between text-[11px] text-ink-400">
      <span>{children}</span>
      {hint !== undefined && <span className="text-ink-300 normal-case tracking-normal">{hint}</span>}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-3 py-6 text-center text-xs text-ink-400">{children}</div>
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-ink-600 bg-ink-800 px-1 font-mono text-[10px] text-ink-300">{children}</kbd>
}
