import { useMemo } from 'react'
import { CircleDot, CircleStop, Eraser, Search } from 'lucide-react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import type { EventRecord } from '@/core/types'
import { Panel, EmptyState } from '../ui/Panel'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { TextInput } from '../ui/TextInput'
import { Toggle } from '../ui/Toggle'
import { eventColor } from '../stage/eventColor'
import { cx } from '../ui/cx'

const VISIBLE_ROWS = 300

function formatParam(record: EventRecord): string {
  if (record.kind !== 'custom') return record.kind
  const parts = [`i=${record.intValue}`, `f=${Number(record.floatValue.toFixed(4))}`]
  if (record.stringValue) parts.push(`s="${record.stringValue}"`)
  if (record.audioPath) parts.push(`audio=${record.audioPath} v=${record.volume} b=${record.balance}`)
  return parts.join(' ')
}

function EventRow({ record, origin }: { record: EventRecord; origin: number }) {
  const custom = record.kind === 'custom'
  return (
    <tr className="border-b border-ink-800 font-mono text-[11px] hover:bg-ink-800/60" data-testid="event-row" data-event={record.name} data-kind={record.kind}>
      <td className="py-1 pl-3 pr-1 tabular-nums text-ink-500">{record.id}</td>
      <td className="px-1 tabular-nums text-ink-400">{`+${((record.wallTime - origin) / 1000).toFixed(3)}`}</td>
      <td className="px-1 text-ink-400">{`T${record.track}`}</td>
      <td className="max-w-[72px] truncate px-1 text-ink-300" title={record.animation}>
        {record.animation}
      </td>
      <td className="px-1">
        <span className={cx('font-semibold', !custom && 'text-ink-400')} style={custom ? { color: eventColor(record.name) } : undefined}>
          {record.name}
        </span>
      </td>
      <td className="px-1 tabular-nums text-accent-400">{`${record.animationTime.toFixed(3)}s`}</td>
      <td className="truncate py-1 pl-1 pr-3 text-ink-200" title={formatParam(record)}>
        {formatParam(record)}
      </td>
    </tr>
  )
}

export function EventMonitorPanel() {
  const controller = useController()
  const log = useInspectorStore((state) => state.eventLog)
  const filter = useInspectorStore((state) => state.eventFilter)
  const capture = useInspectorStore((state) => state.eventCapture)
  const lifecycle = useInspectorStore((state) => state.showLifecycle)
  const eventNames = useInspectorStore((state) => state.asset?.eventNames)
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const record of log) if (record.kind === 'custom') map.set(record.name, (map.get(record.name) ?? 0) + 1)
    return map
  }, [log])
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const filtered = needle
      ? log.filter((record) => record.name.toLowerCase().includes(needle) || record.animation.toLowerCase().includes(needle) || record.stringValue.toLowerCase().includes(needle))
      : log
    return filtered.slice(-VISIBLE_ROWS).reverse()
  }, [log, filter])
  const origin = log[0]?.wallTime ?? 0
  return (
    <div data-testid="event-monitor">
      <Panel
        title="事件紀錄"
        tag={<Badge tone={capture ? 'green' : 'amber'}>{capture ? '記錄中' : '已暫停'}</Badge>}
        actions={
          <>
            <Button size="xs" variant="ghost" icon={capture ? <CircleStop size={12} /> : <CircleDot size={12} />} onClick={() => controller.setEventCapture(!capture)} testId="event-capture">
              {capture ? '暫停記錄' : '開始記錄'}
            </Button>
            <Button size="xs" variant="ghost" icon={<Eraser size={12} />} onClick={() => controller.clearEvents()} testId="event-clear">
              清除
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2 p-2">
          <TextInput icon={<Search size={12} />} placeholder="篩選事件、動作或字串參數" value={filter} onChange={(event) => controller.setEventFilter(event.target.value)} testId="event-filter" />
          <Toggle label="同時記錄播放狀態" description="開始、中斷、結束、播完一輪" checked={lifecycle} onChange={(value) => controller.setShowLifecycle(value)} testId="event-lifecycle" />
          <div className="flex flex-wrap gap-1" data-testid="event-summary">
            {(eventNames ?? []).map((name) => (
              <span key={name} className="inline-flex items-center gap-1 rounded border border-ink-700 bg-ink-850 px-1.5 py-0.5 font-mono text-[10px]">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: eventColor(name) }} />
                <span className="text-ink-200">{name}</span>
                <span className="tabular-nums text-ink-400" data-testid={`event-count-${name}`}>{counts.get(name) ?? 0}</span>
              </span>
            ))}
            {eventNames?.length === 0 && <span className="text-[11px] text-ink-400">此骨架未定義自訂事件</span>}
          </div>
        </div>
      </Panel>
      {visible.length === 0 ? (
        <EmptyState>播放含事件的動作（例如 walk、attack）以記錄觸發歷程</EmptyState>
      ) : (
        <table className="w-full table-fixed border-collapse" data-testid="event-table">
          <colgroup>
            <col className="w-10" />
            <col className="w-14" />
            <col className="w-7" />
            <col className="w-16" />
            <col className="w-16" />
            <col className="w-14" />
            <col />
          </colgroup>
          <thead>
            <tr className="border-b border-ink-700 text-left font-mono text-[10px] text-ink-500">
              <th className="py-1 pl-3 font-medium">#</th>
              <th className="px-1 font-medium">經過</th>
              <th className="px-1 font-medium">軌</th>
              <th className="px-1 font-medium">動畫</th>
              <th className="px-1 font-medium">事件</th>
              <th className="px-1 font-medium">時間</th>
              <th className="pl-1 pr-3 font-medium">參數</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((record) => (
              <EventRow key={record.id} record={record} origin={origin} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
