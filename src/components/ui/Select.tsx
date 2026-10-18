import { cx } from './cx'

export interface SelectOption {
  readonly value: string
  readonly label: string
}

export function Select({ value, options, onChange, placeholder, testId, className, label, disabled }: { value: string | null; options: readonly SelectOption[]; onChange: (value: string) => void; placeholder?: string; testId?: string; className?: string; label: string; disabled?: boolean }) {
  return (
    <select
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      className={cx('h-7 w-full min-w-0 rounded border border-ink-600 bg-ink-800 px-2 font-mono text-xs text-ink-100 outline-none focus:border-accent-500 disabled:opacity-40', className)}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
