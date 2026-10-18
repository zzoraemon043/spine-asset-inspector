import type { PatchOp } from './patch'

export interface HistoryEntry {
  readonly label: string
  readonly ops: readonly PatchOp[]
  readonly inverse: readonly PatchOp[]
  readonly mergeKey: string | null
  readonly time: number
}

export interface HistoryOptions {
  readonly limit?: number
  readonly mergeWindow?: number
}

export const DEFAULT_HISTORY_LIMIT = 200
export const DEFAULT_MERGE_WINDOW = 1000

export class EditHistory {
  private entries: HistoryEntry[] = []
  private cursor = 0
  private savedCursor: number | null = 0
  readonly limit: number
  readonly mergeWindow: number

  constructor(options: HistoryOptions = {}) {
    this.limit = Math.max(1, Math.floor(options.limit ?? DEFAULT_HISTORY_LIMIT))
    this.mergeWindow = Math.max(0, options.mergeWindow ?? DEFAULT_MERGE_WINDOW)
  }

  get index(): number {
    return this.cursor
  }

  get size(): number {
    return this.entries.length
  }

  get canUndo(): boolean {
    return this.cursor > 0
  }

  get canRedo(): boolean {
    return this.cursor < this.entries.length
  }

  get dirty(): boolean {
    return this.savedCursor !== this.cursor
  }

  get savedIndex(): number | null {
    return this.savedCursor
  }

  list(): readonly HistoryEntry[] {
    return this.entries
  }

  peekUndo(): HistoryEntry | null {
    return this.cursor > 0 ? this.entries[this.cursor - 1] : null
  }

  peekRedo(): HistoryEntry | null {
    return this.cursor < this.entries.length ? this.entries[this.cursor] : null
  }

  record(entry: HistoryEntry): void {
    if (this.cursor < this.entries.length) {
      this.entries.length = this.cursor
      if (this.savedCursor !== null && this.savedCursor > this.cursor) this.savedCursor = null
    }
    const last = this.peekUndo()
    const mergeable =
      last !== null &&
      entry.mergeKey !== null &&
      last.mergeKey === entry.mergeKey &&
      entry.time - last.time <= this.mergeWindow &&
      this.savedCursor !== this.cursor
    if (mergeable && last) {
      this.entries[this.cursor - 1] = {
        label: entry.label,
        ops: [...last.ops, ...entry.ops],
        inverse: [...entry.inverse, ...last.inverse],
        mergeKey: entry.mergeKey,
        time: entry.time,
      }
      return
    }
    this.entries.push(entry)
    this.cursor += 1
    while (this.entries.length > this.limit) {
      this.entries.shift()
      this.cursor -= 1
      this.savedCursor = this.savedCursor === null || this.savedCursor === 0 ? null : this.savedCursor - 1
    }
  }

  undo(): HistoryEntry | null {
    const entry = this.peekUndo()
    if (entry) this.cursor -= 1
    return entry
  }

  redo(): HistoryEntry | null {
    const entry = this.peekRedo()
    if (entry) this.cursor += 1
    return entry
  }

  markSaved(): void {
    this.savedCursor = this.cursor
  }

  clear(): void {
    this.entries = []
    this.cursor = 0
    this.savedCursor = 0
  }
}
