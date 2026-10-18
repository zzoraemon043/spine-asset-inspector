import { auditSkeleton } from '@/core/audit/performanceAudit'
import { patchState } from '@/store/inspectorStore'
import type { FeatureHost } from './host'

export class AuditFeature<TImage> {
  private readonly host: FeatureHost<TImage>

  constructor(host: FeatureHost<TImage>) {
    this.host = host
  }

  refresh(): void {
    const asset = this.host.asset()
    if (!asset) {
      patchState({ audit: null })
      return
    }
    patchState({ audit: auditSkeleton(asset.data, asset.instance.skeleton, asset.atlas.pages.length) })
  }
}
