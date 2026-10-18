import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '../ui/cx'

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(6))) : ''
}

interface CommitInputProps {
  readonly value: string
  readonly onCommit: (value: string) => boolean | void
  readonly testId?: string
  readonly label: string
  readonly disabled?: boolean
  readonly numeric?: boolean
  readonly className?: string
}

function CommitInput({ value, onCommit, testId, label, disabled, numeric, className }: CommitInputProps) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  const cancelled = useRef(false)
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])
  const commit = () => {
    setEditing(false)
    if (cancelled.current) {
      cancelled.current = false
      setDraft(value)
      return
    }
    if (draft === value) return
    if (onCommit(draft) === false) setDraft(value)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      cancelled.current = true
      event.stopPropagation()
      event.preventDefault()
      event.currentTarget.blur()
    }
  }
  return (
    <input
      aria-label={label}
      title={label}
      data-testid={testId}
      disabled={disabled}
      inputMode={numeric ? 'decimal' : undefined}
      className={cx(
        'h-6 w-full min-w-0 rounded border border-ink-600 bg-ink-800 px-1.5 font-mono text-xs text-ink-100 outline-none focus:border-accent-500 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent',
        numeric && 'text-right tabular-nums',
        className,
      )}
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(event) => {
        setEditing(true)
        setDraft(event.target.value)
      }}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  )
}

export function NumberField({ value, onCommit, testId, label, disabled }: { value: number; onCommit: (value: number) => boolean | void; testId?: string; label: string; disabled?: boolean }) {
  return (
    <CommitInput
      numeric
      label={label}
      testId={testId}
      disabled={disabled}
      value={formatNumber(value)}
      onCommit={(text) => {
        const trimmed = text.trim()
        const number = Number(trimmed)
        if (trimmed === '' || !Number.isFinite(number)) return false
        return onCommit(number)
      }}
    />
  )
}

export function TextField({ value, onCommit, testId, label, disabled }: { value: string; onCommit: (value: string) => boolean | void; testId?: string; label: string; disabled?: boolean }) {
  return <CommitInput label={label} testId={testId} disabled={disabled} value={value} onCommit={onCommit} />
}

export function EditRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2 py-0.5 text-xs">
      <span className="text-ink-400">{label}</span>
      <div className="flex min-w-0 items-center gap-1">{children}</div>
    </div>
  )
}
