import { useMemo } from 'react'
import { Eye, EyeOff, RotateCcw, Search } from 'lucide-react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import { useLiveStore } from '@/store/liveStore'
import type { SlotInfo, SlotOverride } from '@/core/types'
import { Panel, EmptyState } from '../ui/Panel'
import { Badge } from '../ui/Badge'
import { Button, IconButton } from '../ui/Button'
import { TextInput } from '../ui/TextInput'
import { cx } from '../ui/cx'

const ANIMATED = '__animated__'
const NONE = '__none__'

function encodeOverride(override: SlotOverride | undefined): string {
  if (!override || override.attachment === undefined) return ANIMATED
  return override.attachment === null ? NONE : override.attachment
}

function decodeChoice(value: string): string | null | undefined {
  if (value === ANIMATED) return undefined
  if (value === NONE) return null
  return value
}

function SlotRow({ slot, override, current, selected }: { slot: SlotInfo; override: SlotOverride | undefined; current: string | null | undefined; selected: boolean }) {
  const controller = useController()
  const visible = override?.visible ?? true
  return (
    <li
      data-testid={`slot-row-${slot.name}`}
      className={cx('flex items-center gap-1.5 border-l-2 px-2 py-1', selected ? 'border-accent-500 bg-accent-500/10' : 'border-transparent hover:bg-ink-800')}
    >
      <IconButton
        size="xs"
        label={visible ? `隱藏 ${slot.name}` : `顯示 ${slot.name}`}
        icon={visible ? <Eye size={12} /> : <EyeOff size={12} />}
        variant={visible ? 'ghost' : 'danger'}
        onClick={() => controller.setSlotVisible(slot.name, !visible)}
        testId={`slot-visibility-${slot.name}`}
      />
      <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={() => controller.selectSlot(slot.name)} data-testid={`slot-select-${slot.name}`}>
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] tabular-nums text-ink-500">{String(slot.index).padStart(2, '0')}</span>
          <span className={cx('truncate font-mono text-xs', visible ? 'text-ink-100' : 'text-ink-500 line-through')}>{slot.name}</span>
          {override && <Badge tone="amber">已覆寫</Badge>}
        </span>
        <span className="truncate font-mono text-[10px] text-ink-400">
          {slot.bone} / <span className={current ? 'text-accent-400' : 'text-ink-500'} data-testid={`slot-current-${slot.name}`}>{current ?? '無'}</span>
        </span>
      </button>
      <select
        aria-label={`${slot.name} 部件`}
        data-testid={`slot-attachment-${slot.name}`}
        value={encodeOverride(override)}
        onChange={(event) => controller.setSlotAttachment(slot.name, decodeChoice(event.target.value))}
        className="h-6 w-24 shrink-0 rounded border border-ink-600 bg-ink-800 px-1 font-mono text-[10px] text-ink-200 outline-none focus:border-accent-500"
      >
        <option value={ANIMATED}>依動畫</option>
        <option value={NONE}>不顯示</option>
        {slot.attachments.map((attachment) => (
          <option key={attachment.name} value={attachment.name}>
            {`${attachment.name} [${attachment.type}]`}
          </option>
        ))}
      </select>
    </li>
  )
}

export function SlotInspectorPanel() {
  const controller = useController()
  const slots = useInspectorStore((state) => state.asset?.slots)
  const overrides = useInspectorStore((state) => state.slotOverrides)
  const selected = useInspectorStore((state) => state.selectedSlot)
  const filter = useInspectorStore((state) => state.slotFilter)
  const attachments = useLiveStore((state) => state.attachments)
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return (slots ?? []).filter((slot) => slot.name.toLowerCase().includes(needle) || slot.bone.toLowerCase().includes(needle))
  }, [slots, filter])
  const overrideCount = Object.keys(overrides).length
  return (
    <Panel
      title="插槽清單"
      tag={<Badge>{slots?.length ?? 0}</Badge>}
      actions={
        <Button size="xs" variant="ghost" icon={<RotateCcw size={12} />} disabled={overrideCount === 0} onClick={() => controller.resetAllSlots()} testId="slots-reset">
          重設全部
        </Button>
      }
      className="border-b-0"
      testId="slot-inspector"
    >
      <div className="flex flex-col gap-2 p-2">
        <TextInput icon={<Search size={12} />} placeholder="篩選插槽或骨骼" value={filter} onChange={(event) => controller.setSlotFilter(event.target.value)} testId="slot-filter" />
        <div className="flex items-center gap-2 px-1 text-[11px] text-ink-400">
          <span>依繪製順序列出。點選名稱可在舞台高亮該插槽部件。</span>
        </div>
      </div>
      {visible.length === 0 && <EmptyState>沒有符合的插槽</EmptyState>}
      <ul className="pb-2">
        {visible.map((slot) => (
          <SlotRow key={slot.name} slot={slot} override={overrides[slot.name]} current={attachments[slot.name]} selected={selected === slot.name} />
        ))}
      </ul>
    </Panel>
  )
}
