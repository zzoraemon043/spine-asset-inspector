import type { InputHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export function TextInput({ icon, testId, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; testId?: string }) {
  return (
    <label className={cx('flex h-7 items-center gap-1.5 rounded border border-ink-600 bg-ink-800 px-2 focus-within:border-accent-500', className)}>
      {icon && <span className="text-ink-400">{icon}</span>}
      <input data-testid={testId} className="h-full w-full min-w-0 bg-transparent font-mono text-xs text-ink-100 outline-none placeholder:text-ink-500" {...rest} />
    </label>
  )
}

export function NumberInput({ value, onChange, min, max, step, label, testId, suffix }: { value: number; onChange: (value: number) => void; min: number; max: number; step: number; label: string; testId?: string; suffix?: string }) {
  return (
    <label className="flex h-7 items-center gap-1 rounded border border-ink-600 bg-ink-800 px-2 focus-within:border-accent-500">
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-400">{label}</span>
      <input
        type="number"
        aria-label={label}
        data-testid={testId}
        className="h-full w-full min-w-0 bg-transparent text-right font-mono text-xs tabular-nums text-ink-100 outline-none"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
      {suffix && <span className="font-mono text-[10px] text-ink-400">{suffix}</span>}
    </label>
  )
}
