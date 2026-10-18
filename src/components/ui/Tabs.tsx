import type { ReactNode } from 'react'
import { cx } from './cx'

export interface TabItem<T extends string> {
  readonly id: T
  readonly label: string
  readonly icon?: ReactNode
  readonly badge?: ReactNode
}

export function Tabs<T extends string>({ items, active, onChange }: { items: readonly TabItem<T>[]; active: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="grid shrink-0 grid-cols-4 border-b border-ink-700 bg-ink-850">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={active === item.id}
          data-testid={`tab-${item.id}`}
          onClick={() => onChange(item.id)}
          className={cx(
            'relative flex h-8 items-center justify-center gap-1.5 border-b border-r border-ink-700/60 px-1 text-xs font-semibold transition-colors [&:nth-child(4n)]:border-r-0',
            active === item.id ? 'bg-ink-900 text-accent-400' : 'text-ink-400 hover:bg-ink-800 hover:text-ink-200',
          )}
        >
          {item.icon}
          <span>{item.label}</span>
          {item.badge}
          {active === item.id && <span className="absolute inset-x-0 top-0 h-0.5 bg-accent-500" />}
        </button>
      ))}
    </div>
  )
}
