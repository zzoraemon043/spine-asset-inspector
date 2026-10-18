import { applyOps, type PatchOp } from './patch'
import { EditHistory, type HistoryEntry, type HistoryOptions } from './history'
import type { SkeletonDocument } from './document'

export interface EditCommand {
  readonly label: string
  readonly ops: readonly PatchOp[]
  readonly mergeKey?: string
}

export interface HistoryItem {
  readonly label: string
  readonly time: number
}

export interface EditSessionState {
  readonly revision: number
  readonly dirty: boolean
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly undoLabel: string | null
  readonly redoLabel: string | null
  readonly entries: readonly HistoryItem[]
  readonly index: number
  readonly savedIndex: number | null
}

export interface EditSessionOptions extends HistoryOptions {
  readonly now?: () => number
}

export type SessionListener = (document: SkeletonDocument, state: EditSessionState) => void

export class EditSession {
  private current: SkeletonDocument
  private readonly history: EditHistory
  private readonly now: () => number
  private readonly listeners = new Set<SessionListener>()
  private revisionCounter = 0
  readonly original: SkeletonDocument

  constructor(document: SkeletonDocument, options: EditSessionOptions = {}) {
    this.current = document
    this.original = document
    this.history = new EditHistory(options)
    this.now = options.now ?? (() => Date.now())
  }

  get document(): SkeletonDocument {
    return this.current
  }

  get revision(): number {
    return this.revisionCounter
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  state(): EditSessionState {
    const history = this.history
    return {
      revision: this.revisionCounter,
      dirty: history.dirty,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      undoLabel: history.peekUndo()?.label ?? null,
      redoLabel: history.peekRedo()?.label ?? null,
      entries: history.list().map((entry: HistoryEntry) => ({ label: entry.label, time: entry.time })),
      index: history.index,
      savedIndex: history.savedIndex,
    }
  }

  private commitDocument(document: SkeletonDocument): void {
    this.current = document
    this.revisionCounter += 1
    const state = this.state()
    for (const listener of this.listeners) listener(document, state)
  }

  execute(command: EditCommand): boolean {
    if (command.ops.length === 0) return false
    const result = applyOps(this.current, command.ops)
    this.history.record({
      label: command.label,
      ops: command.ops,
      inverse: result.inverse,
      mergeKey: command.mergeKey ?? null,
      time: this.now(),
    })
    this.commitDocument(result.document)
    return true
  }

  undo(): boolean {
    const entry = this.history.peekUndo()
    if (!entry) return false
    const result = applyOps(this.current, entry.inverse)
    this.history.undo()
    this.commitDocument(result.document)
    return true
  }

  redo(): boolean {
    const entry = this.history.peekRedo()
    if (!entry) return false
    const result = applyOps(this.current, entry.ops)
    this.history.redo()
    this.commitDocument(result.document)
    return true
  }

  jump(index: number): boolean {
    const target = Math.min(Math.max(0, Math.floor(index)), this.history.size)
    if (target === this.history.index) return false
    let document = this.current
    while (this.history.index > target) {
      const entry = this.history.peekUndo()
      if (!entry) break
      document = applyOps(document, entry.inverse).document
      this.history.undo()
    }
    while (this.history.index < target) {
      const entry = this.history.peekRedo()
      if (!entry) break
      document = applyOps(document, entry.ops).document
      this.history.redo()
    }
    this.commitDocument(document)
    return true
  }

  markSaved(): void {
    this.history.markSaved()
    const state = this.state()
    for (const listener of this.listeners) listener(this.current, state)
  }
}
