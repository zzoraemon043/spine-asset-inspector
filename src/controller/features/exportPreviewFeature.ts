import type { Skeleton } from '@esotericsoftware/spine-core'
import { patchState, useInspectorStore } from '@/store/inspectorStore'
import { useLiveStore } from '@/store/liveStore'
import type { ExportBackend, ExportJobContext, OutputJob, PreviewRect, SequenceJob } from '../types'

export const PREVIEW_BOX = { width: 360, height: 300 } as const

export interface ExportPreviewHost<TImage> {
  exporter(): ExportBackend<TImage> | null
  context(): ExportJobContext<TImage> | null
  job(): SequenceJob | OutputJob | null
  pose(): Skeleton | null
  key(): string
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class ExportPreviewFeature<TImage> {
  private readonly host: ExportPreviewHost<TImage>
  private pending: number | null = null
  private running: Promise<void> | null = null
  private locked: PreviewRect | null = null

  constructor(host: ExportPreviewHost<TImage>) {
    this.host = host
  }

  get supported(): boolean {
    return typeof this.host.exporter()?.preview === 'function'
  }

  request(frame?: number): Promise<void> {
    this.pending = Math.max(0, Math.round(frame ?? useInspectorStore.getState().exportPreview.frame))
    if (!this.running) this.running = this.pump().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async pump(): Promise<void> {
    while (this.pending !== null) {
      const frame = this.pending
      this.pending = null
      const exporter = this.host.exporter()
      const context = this.host.context()
      const job = this.host.job()
      if (!exporter?.preview || !context || !job) {
        patchState({ exportPreview: { status: 'error', frame, error: '目前無法產生預覽' } })
        continue
      }
      patchState({ exportPreview: { ...useInspectorStore.getState().exportPreview, status: 'loading', frame } })
      try {
        const result = await exporter.preview(context, { key: this.host.key(), options: job, frame, maxWidth: PREVIEW_BOX.width, maxHeight: PREVIEW_BOX.height, view: this.locked }, this.host.pose())
        if (this.pending !== null) continue
        useLiveStore.setState({ exportPreview: result })
        patchState({ exportPreview: { status: 'ready', frame: result.frame, error: null } })
      } catch (error) {
        useLiveStore.setState({ exportPreview: null })
        patchState({ exportPreview: { status: 'error', frame, error: describe(error) } })
      }
    }
  }

  lockView(view: PreviewRect | null): void {
    this.locked = view
  }

  close(): void {
    this.pending = null
    this.locked = null
    this.host.exporter()?.disposePreview?.()
    useLiveStore.setState({ exportPreview: null })
    patchState({ exportPreview: { status: 'idle', frame: 0, error: null } })
  }
}
