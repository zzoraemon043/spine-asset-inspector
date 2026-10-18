import { cx } from './cx'

export function Toggle({ checked, onChange, label, description, testId, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description?: string; testId?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-ink-750 disabled:opacity-40"
    >
      <span className={cx('relative h-4 w-7 shrink-0 rounded-full border transition-colors', checked ? 'border-accent-500/70 bg-accent-500/30' : 'border-ink-600 bg-ink-800')}>
        <span className={cx('absolute top-0.5 h-2.5 w-2.5 rounded-full transition-all', checked ? 'left-3.5 bg-accent-400' : 'left-0.5 bg-ink-400')} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-ink-100">{label}</span>
        {description && <span className="truncate text-[11px] text-ink-400">{description}</span>}
      </span>
    </button>
  )
}
