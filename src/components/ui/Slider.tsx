import { useId } from 'react'
import { cx } from './cx'

export interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  format?: (value: number) => string
  disabled?: boolean
  testId?: string
  className?: string
  onPointerDown?: () => void
  onPointerUp?: () => void
}

export function Slider({ label, value, min, max, step, onChange, format, disabled, testId, className, onPointerDown, onPointerUp }: SliderProps) {
  const id = useId()
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[11px] text-ink-400">
          {label}
        </label>
        <span className="font-mono text-[11px] tabular-nums text-accent-400" data-testid={testId ? `${testId}-value` : undefined}>
          {format ? format(value) : value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="range-input w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        data-testid={testId}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      />
    </div>
  )
}
