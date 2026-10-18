import { AudioLines, Bug, Gauge, Grid3x3, History, Layers, Radio, Shirt, X } from 'lucide-react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import type { PanelTab } from '@/store/defaults'
import { Tabs, type TabItem } from '../ui/Tabs'
import { IconButton } from '../ui/Button'
import { MixLabPanel } from '../panels/MixLabPanel'
import { SlotInspectorPanel } from '../panels/SlotInspectorPanel'
import { DebugPanel } from '../panels/DebugPanel'
import { EventMonitorPanel } from '../panels/EventMonitorPanel'
import { AtlasPanel } from '../panels/AtlasPanel'
import { AuditPanel } from '../panels/AuditPanel'
import { AudioPanel } from '../panels/AudioPanel'
import { HistoryPanel } from '../panels/HistoryPanel'

export function AdvancedDrawer() {
  const controller = useController()
  const open = useInspectorStore((state) => state.advancedOpen)
  const active = useInspectorStore((state) => state.activeTab)
  const eventCount = useInspectorStore((state) => state.eventLog.length)
  const overrideCount = useInspectorStore((state) => Object.keys(state.slotOverrides).length)
  const regionCount = useInspectorStore((state) => Object.keys(state.regionOverrides).length)
  const clipCount = useInspectorStore((state) => state.audioClips.length)
  const grade = useInspectorStore((state) => state.audit?.grade ?? null)
  const historyCount = useInspectorStore((state) => state.editor.index)
  if (!open) return null
  const count = (value: number, tone: string, testId?: string) => (value > 0 ? <span className={`rounded px-1 ${tone}`} data-testid={testId}>{value > 999 ? '999+' : value}</span> : undefined)
  const items: TabItem<PanelTab>[] = [
    { id: 'mix', label: '混合', icon: <Layers size={12} /> },
    { id: 'slots', label: '插槽', icon: <Shirt size={12} />, badge: count(overrideCount, 'bg-signal-amber/20 text-signal-amber') },
    { id: 'events', label: '事件', icon: <Radio size={12} />, badge: count(eventCount, 'bg-accent-500/20 text-accent-400', 'event-count-badge') },
    { id: 'audio', label: '音訊', icon: <AudioLines size={12} />, badge: count(clipCount, 'bg-signal-violet/20 text-signal-violet') },
    { id: 'atlas', label: '圖集', icon: <Grid3x3 size={12} />, badge: count(regionCount, 'bg-signal-amber/20 text-signal-amber') },
    {
      id: 'audit',
      label: '效能',
      icon: <Gauge size={12} />,
      badge: grade ? <span className={grade === 'good' ? 'h-1.5 w-1.5 rounded-full bg-signal-green' : grade === 'warning' ? 'h-1.5 w-1.5 rounded-full bg-signal-amber' : 'h-1.5 w-1.5 rounded-full bg-signal-red'} data-testid="audit-grade-dot" /> : undefined,
    },
    { id: 'history', label: '歷史', icon: <History size={12} />, badge: count(historyCount, 'bg-accent-500/20 text-accent-400', 'history-count-badge') },
    { id: 'debug', label: '顯示', icon: <Bug size={12} /> },
  ]
  return (
    <section className="flex w-[400px] shrink-0 flex-col border-l border-ink-600 bg-ink-900" data-testid="advanced-drawer" aria-label="進階工具">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-ink-700 bg-ink-850 px-3">
        <span className="text-sm font-semibold text-ink-100">進階工具</span>
        <span className="text-[11px] text-ink-400">混合、事件、音訊、圖集、效能、編輯歷史與顯示</span>
        <IconButton size="xs" className="ml-auto" label="關閉進階工具" icon={<X size={13} />} onClick={() => controller.setAdvancedOpen(false)} testId="advanced-close" />
      </header>
      <Tabs items={items} active={active} onChange={(tab) => controller.setActiveTab(tab)} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {active === 'mix' && <MixLabPanel />}
        {active === 'slots' && <SlotInspectorPanel />}
        {active === 'debug' && <DebugPanel />}
        {active === 'events' && <EventMonitorPanel />}
        {active === 'audio' && <AudioPanel />}
        {active === 'atlas' && <AtlasPanel />}
        {active === 'audit' && <AuditPanel />}
        {active === 'history' && <HistoryPanel />}
      </div>
    </section>
  )
}
