import type { ReactNode } from 'react'
import { cx } from './cx'

export type BadgeTone = 'neutral' | 'accent' | 'green' | 'amber' | 'red' | 'violet'

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-ink-600 bg-ink-800 text-ink-300',
  accent: 'border-accent-500/40 bg-accent-500/10 text-accent-400',
  green: 'border-signal-green/40 bg-signal-green/10 text-signal-green',
  amber: 'border-signal-amber/40 bg-signal-amber/10 text-signal-amber',
  red: 'border-signal-red/40 bg-signal-red/10 text-signal-red',
  violet: 'border-signal-violet/40 bg-signal-violet/10 text-signal-violet',
}

export function Badge({ tone = 'neutral', children, className, title, testId }: { tone?: BadgeTone; children: ReactNode; className?: string; title?: string; testId?: string }) {
  return (
    <span
      title={title}
      data-testid={testId}
      className={cx('inline-flex h-[18px] items-center rounded-[3px] border px-1.5 font-mono text-[10px] font-medium uppercase leading-none tracking-wider whitespace-nowrap', TONES[tone], className)}
    >
      {children}
    </span>
  )
}
