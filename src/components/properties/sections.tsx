import type { ReactNode } from 'react'

export function Field({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2 py-0.5 text-xs">
      <span className="text-ink-400">{label}</span>
      <span className="min-w-0 truncate font-mono text-ink-100" data-testid={testId}>
        {children}
      </span>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-ink-700/60 px-3 py-2">
      <h3 className="mb-1 text-[11px] font-semibold text-ink-300">{title}</h3>
      {children}
    </div>
  )
}
