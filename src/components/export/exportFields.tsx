import type { ReactNode } from 'react'
import { cx } from '../ui/cx'

export function NumberField({ label, value, onChange, min, max, step = 1, suffix, testId, disabled, placeholder }: { label: string; value: number | ''; onChange: (value: number | null) => void; min: number; max: number; step?: number; suffix?: string; testId: string; disabled?: boolean; placeholder?: string }) {
  return (
    <label className={cx('flex flex-col gap-1', disabled && 'opacity-40')}>
      <span className="text-[11px] text-ink-400">{label}</span>
      <span className="flex h-8 items-center gap-1 rounded border border-ink-600 bg-ink-800 px-2 focus-within:border-accent-500">
        <input
          type="number"
          aria-label={label}
          className="h-full w-full min-w-0 bg-transparent font-mono text-sm tabular-nums text-ink-100 outline-none placeholder:text-ink-500"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          placeholder={placeholder}
          data-testid={testId}
          onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
        />
        {suffix && <span className="shrink-0 text-[11px] text-ink-400">{suffix}</span>}
      </span>
    </label>
  )
}

export function Choice({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: ReactNode; testId: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} aria-pressed={active} className={cx('h-8 rounded border px-3 text-xs transition-colors', active ? 'border-accent-500 bg-accent-500/15 text-accent-400' : 'border-ink-600 bg-ink-800 text-ink-200 hover:border-ink-500')}>
      {children}
    </button>
  )
}
