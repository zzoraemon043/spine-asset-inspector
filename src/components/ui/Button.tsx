import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger' | 'active'
export type ButtonSize = 'xs' | 'sm' | 'md'

const VARIANTS: Record<ButtonVariant, string> = {
  default: 'border-ink-600 bg-ink-750 text-ink-200 hover:border-ink-500 hover:bg-ink-700 hover:text-ink-100',
  primary: 'border-accent-500/60 bg-accent-500/15 text-accent-400 hover:bg-accent-500/25',
  ghost: 'border-transparent bg-transparent text-ink-300 hover:bg-ink-750 hover:text-ink-100',
  danger: 'border-signal-red/40 bg-signal-red/10 text-signal-red hover:bg-signal-red/20',
  active: 'border-accent-500/70 bg-accent-500/20 text-accent-400',
}

const SIZES: Record<ButtonSize, string> = {
  xs: 'h-6 px-1.5 text-[11px] gap-1',
  sm: 'h-7 px-2 text-xs gap-1.5',
  md: 'h-8 px-3 text-xs gap-2',
}

const SQUARE_SIZES: Record<ButtonSize, string> = {
  xs: 'h-6 w-6',
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  testId?: string
  square?: boolean
}

export function Button({ variant = 'default', size = 'sm', icon, testId, square, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      data-testid={testId}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded border font-medium transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent-500 disabled:cursor-not-allowed disabled:opacity-40',
        VARIANTS[variant],
        square ? SQUARE_SIZES[size] : SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}

export function IconButton({ label, active, ...rest }: Omit<ButtonProps, 'children'> & { label: string; active?: boolean }) {
  return <Button aria-label={label} title={label} square {...rest} variant={active ? 'active' : rest.variant ?? 'ghost'} />
}
