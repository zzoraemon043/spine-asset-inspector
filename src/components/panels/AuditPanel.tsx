import { RefreshCw } from 'lucide-react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import { LEVEL_LABEL, type HealthLevel } from '@/core/audit/budgets'
import { Panel, EmptyState } from '../ui/Panel'
import { Badge, type BadgeTone } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'

const TONE: Record<HealthLevel, BadgeTone> = { good: 'green', warning: 'amber', heavy: 'red' }
const BAR: Record<HealthLevel, string> = { good: 'bg-signal-green', warning: 'bg-signal-amber', heavy: 'bg-signal-red' }

export function AuditPanel() {
  const controller = useController()
  const report = useInspectorStore((state) => state.audit)
  if (!report) {
    return (
      <Panel title="效能體檢" testId="audit-panel">
        <EmptyState>載入資產後自動體檢</EmptyState>
      </Panel>
    )
  }
  return (
    <div data-testid="audit-panel">
      <Panel
        title="效能體檢"
        tag={<Badge>手遊基準</Badge>}
        actions={
          <Button size="xs" variant="ghost" icon={<RefreshCw size={12} />} onClick={() => controller.audit.refresh()} testId="audit-refresh">
            量測目前姿勢
          </Button>
        }
      >
        <div className="flex items-center gap-3 p-3">
          <div className={cx('flex h-14 w-20 flex-col items-center justify-center rounded border', report.grade === 'good' ? 'border-signal-green/50 text-signal-green' : report.grade === 'warning' ? 'border-signal-amber/50 text-signal-amber' : 'border-signal-red/50 text-signal-red')}>
            <span className="text-[10px]">評級</span>
            <span className="text-lg font-bold" data-testid="audit-grade" data-level={report.grade}>
              {report.gradeLabel}
            </span>
          </div>
          <div className="flex flex-col gap-1 text-xs">
            <span className="flex items-center gap-2">
              <Badge tone="green">{`${LEVEL_LABEL.good} ${report.counts.good}`}</Badge>
              <Badge tone="amber">{`${LEVEL_LABEL.warning} ${report.counts.warning}`}</Badge>
              <Badge tone="red">{`${LEVEL_LABEL.heavy} ${report.counts.heavy}`}</Badge>
            </span>
            <span className="text-[11px] text-ink-400">整體評級取所有指標中最差者</span>
          </div>
        </div>
      </Panel>
      <Panel title="指標" tag={<Badge>{report.metrics.length}</Badge>}>
        <ul className="py-1">
          {report.metrics.map((metric) => (
            <li key={metric.id} className="flex flex-col gap-1 px-3 py-1.5" data-testid={`audit-metric-${metric.id}`} data-level={metric.level}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-ink-100" title={metric.description}>
                  {metric.label}
                </span>
                <span className="font-mono text-xs tabular-nums text-ink-100" data-testid={`audit-value-${metric.id}`}>
                  {metric.value}
                </span>
                <Badge tone={TONE[metric.level]}>{LEVEL_LABEL[metric.level]}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-700">
                  <div className={cx('h-full', BAR[metric.level])} style={{ width: `${Math.min(100, (metric.value / Math.max(1, metric.warning * 1.25)) * 100)}%` }} />
                </div>
                <span className="w-24 text-right font-mono text-[9px] text-ink-500">{`<=${metric.good} / <=${metric.warning}`}</span>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="建議" className="border-b-0">
        {report.findings.length === 0 ? (
          <EmptyState>所有指標皆在優良範圍內</EmptyState>
        ) : (
          <ul className="flex list-disc flex-col gap-1 py-3 pl-7 pr-3 text-[11px] text-ink-300" data-testid="audit-findings">
            {report.findings.map((finding) => (
              <li key={finding}>{finding}</li>
            ))}
          </ul>
        )}
        <p className="px-3 pb-3 text-[11px] leading-relaxed text-ink-400">基準為中階手機 60 FPS 單角色同屏建議值；目前頂點、三角面與 Draw Calls 依當下姿勢、皮膚與插槽覆寫計算，切換動作後可按「量測目前姿勢」重新計算。</p>
      </Panel>
    </div>
  )
}
