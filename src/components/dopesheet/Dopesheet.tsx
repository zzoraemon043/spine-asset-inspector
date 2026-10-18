import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { ChevronDown, ChevronRight, ClipboardPaste, Copy, Flag, KeyRound, KeySquare, Trash2 } from 'lucide-react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import { useLiveStore } from '@/store/liveStore'
import { buildDopesheet, type SheetRow } from '@/core/animation/dopesheet'
import { isObject } from '@/core/editor/json'
import type { ConstraintInfo } from '@/core/types'
import { Select } from '../ui/Select'
import { CurveEditor } from './CurveEditor'
import { EventKeyEditor, useSelectedEventKey } from './EventKeyEditor'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'

export const FRAME_WIDTH = 16
export const ROW_HEIGHT = 22
const LABEL_WIDTH = 200
const RULER_HEIGHT = 22
const CLICK_SLOP = 3
const EMPTY_CONSTRAINTS: readonly ConstraintInfo[] = []

const CHANNEL_COLOR: Record<string, string> = {
  rotate: 'bg-signal-green',
  translate: 'bg-accent-400',
  scale: 'bg-signal-red',
  attachment: 'bg-signal-violet',
  rgba: 'bg-ink-100',
  rgb: 'bg-ink-100',
  alpha: 'bg-ink-300',
  rgba2: 'bg-ink-100',
  rgb2: 'bg-ink-100',
  event: 'bg-signal-amber',
  ik: 'bg-signal-violet',
  transform: 'bg-signal-violet',
  drawOrder: 'bg-signal-red',
  deform: 'bg-accent-400',
}

const SEGMENT_CLASS: Record<string, string> = {
  linear: 'border-t border-ink-500',
  stepped: 'border-t border-dashed border-signal-amber/70',
  bezier: 'border-t-2 border-signal-violet/80',
}

type Gesture =
  | { readonly kind: 'keys'; readonly pointerId: number; readonly startX: number; delta: number }
  | { readonly kind: 'box'; readonly pointerId: number; readonly startX: number; readonly startY: number; x: number; y: number; readonly additive: boolean }
  | { readonly kind: 'scrub'; readonly pointerId: number }

function localPoint(event: PointerEvent<HTMLElement>, element: HTMLElement): { x: number; y: number } {
  const box = element.getBoundingClientRect()
  return { x: event.clientX - box.left, y: event.clientY - box.top }
}

export function Dopesheet() {
  const controller = useController()
  const animation = useInspectorStore((state) => state.animation)
  const fps = useInspectorStore((state) => state.asset?.fps ?? 30)
  const bones = useInspectorStore((state) => state.asset?.bones)
  const slots = useInspectorStore((state) => state.asset?.slots)
  const constraints = useInspectorStore((state) => state.asset?.constraints ?? EMPTY_CONSTRAINTS)
  const selectedSlot = useInspectorStore((state) => (state.selection?.kind === 'slot' ? state.selection.name : state.selection?.kind === 'attachment' ? state.selection.slot ?? null : null))
  const eventDefinitions = useInspectorStore((state) => state.editor.document?.events)
  const eventNames = useMemo(() => (isObject(eventDefinitions) ? Object.keys(eventDefinitions) : []), [eventDefinitions])
  const [eventChoice, setEventChoice] = useState<string | null>(null)
  const eventKey = useSelectedEventKey()
  const document = useInspectorStore((state) => state.editor.document)
  const selectedBone = useInspectorStore((state) => (state.selection?.kind === 'bone' ? state.selection.name : null))
  const keySelection = useInspectorStore((state) => state.keySelection)
  const collapsed = useInspectorStore((state) => state.dopesheetCollapsed)
  const autoKey = useInspectorStore((state) => state.autoKey)
  const pending = useInspectorStore((state) => state.pendingPose)
  const clipboard = useInspectorStore((state) => state.keyClipboard)
  const frame = useLiveStore((state) => state.snapshot.frame)
  const tracksRef = useRef<HTMLDivElement>(null)
  const rulerRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const [dragDelta, setDragDelta] = useState(0)
  const [box, setBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null)

  const sheet = useMemo(
    () =>
      buildDopesheet({
        document,
        animation,
        fps,
        bones: (bones ?? []).map((bone) => bone.name),
        slots: (slots ?? []).map((slot) => slot.name),
        extraBones: selectedBone ? [selectedBone] : [],
        extraSlots: selectedSlot ? [selectedSlot] : [],
        ikConstraints: constraints.filter((item) => item.type === 'ik').map((item) => item.name),
        transformConstraints: constraints.filter((item) => item.type === 'transform').map((item) => item.name),
        collapsed: new Set(collapsed),
      }),
    [document, animation, fps, bones, slots, selectedBone, selectedSlot, collapsed, constraints],
  )
  const eventName = eventChoice && eventNames.includes(eventChoice) ? eventChoice : eventNames[0] ?? null
  const selected = useMemo(() => new Set(keySelection), [keySelection])
  const frames = Math.max(sheet.frameCount, frame) + 12
  const width = frames * FRAME_WIDTH

  const toggleCollapse = (id: string) => {
    useInspectorStore.setState({ dopesheetCollapsed: collapsed.includes(id) ? collapsed.filter((item) => item !== id) : [...collapsed, id] })
  }

  const frameAt = (x: number) => Math.max(0, Math.round((x - FRAME_WIDTH / 2) / FRAME_WIDTH))

  const onTracksDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !tracksRef.current) return
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-key-ids]')
    const point = localPoint(event, tracksRef.current)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    if (target) {
      const ids = JSON.parse(target.dataset.keyIds ?? '[]') as string[]
      const allSelected = ids.every((id) => selected.has(id))
      if (event.ctrlKey || event.metaKey) controller.animate.selectKeys(ids, 'toggle')
      else if (event.shiftKey) controller.animate.selectKeys(ids, 'add')
      else if (!allSelected) controller.animate.selectKeys(ids, 'replace')
      gestureRef.current = { kind: 'keys', pointerId: event.pointerId, startX: point.x, delta: 0 }
      return
    }
    gestureRef.current = { kind: 'box', pointerId: event.pointerId, startX: point.x, startY: point.y, x: point.x, y: point.y, additive }
  }

  const onTracksMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId || !tracksRef.current) return
    const point = localPoint(event, tracksRef.current)
    if (gesture.kind === 'keys') {
      const delta = Math.round((point.x - gesture.startX) / FRAME_WIDTH)
      if (delta !== gesture.delta) {
        gesture.delta = delta
        setDragDelta(delta)
      }
    } else if (gesture.kind === 'box') {
      gesture.x = point.x
      gesture.y = point.y
      setBox({ x: Math.min(gesture.startX, point.x), y: Math.min(gesture.startY, point.y), width: Math.abs(point.x - gesture.startX), height: Math.abs(point.y - gesture.startY) })
    }
  }

  const finishBox = (gesture: Extract<Gesture, { kind: 'box' }>) => {
    const moved = Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) > CLICK_SLOP
    if (!moved) {
      if (!gesture.additive) controller.animate.clearSelection()
      controller.seekFrame(frameAt(gesture.x))
      return
    }
    const top = Math.min(gesture.startY, gesture.y)
    const bottom = Math.max(gesture.startY, gesture.y)
    const left = Math.min(gesture.startX, gesture.x)
    const right = Math.max(gesture.startX, gesture.x)
    const ids: string[] = []
    sheet.rows.forEach((row, index) => {
      const rowTop = index * ROW_HEIGHT
      if (rowTop + ROW_HEIGHT < top || rowTop > bottom || row.kind === 'bone' || row.kind === 'slot') return
      for (const key of row.keys) {
        const center = key.frame * FRAME_WIDTH + FRAME_WIDTH / 2
        if (center >= left && center <= right) ids.push(key.id)
      }
    })
    controller.animate.selectKeys(ids, gesture.additive ? 'add' : 'replace')
  }

  const onTracksUp = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    gestureRef.current = null
    if (gesture.kind === 'keys') {
      setDragDelta(0)
      if (gesture.delta !== 0) controller.animate.moveSelected(gesture.delta)
    } else if (gesture.kind === 'box') {
      setBox(null)
      finishBox(gesture)
    }
  }

  const onRulerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !rulerRef.current) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    gestureRef.current = { kind: 'scrub', pointerId: event.pointerId }
    controller.seekFrame(frameAt(localPoint(event, rulerRef.current).x))
  }

  const onRulerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (gesture?.kind !== 'scrub' || gesture.pointerId !== event.pointerId || !rulerRef.current) return
    controller.seekFrame(frameAt(localPoint(event, rulerRef.current).x))
  }

  const onRulerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.pointerId === event.pointerId) gestureRef.current = null
  }

  const renderSegments = (row: SheetRow) =>
    row.keys.map((key, index) => {
      const next = row.keys[index + 1]
      if (!key.segment || !next || next.frame <= key.frame) return null
      return (
        <span
          key={`segment-${key.id}`}
          className={cx('pointer-events-none absolute top-1/2', SEGMENT_CLASS[key.segment])}
          style={{ left: key.frame * FRAME_WIDTH + FRAME_WIDTH / 2, width: (next.frame - key.frame) * FRAME_WIDTH }}
          data-testid={`segment-${row.id}-${key.frame}`}
          data-kind={key.segment}
        />
      )
    })

  const renderKeys = (row: SheetRow) => {
    if (row.kind === 'bone' || row.kind === 'slot') {
      const groups = new Map<number, string[]>()
      for (const key of row.keys) groups.set(key.frame, [...(groups.get(key.frame) ?? []), key.id])
      return [...groups.entries()].map(([keyFrame, ids]) => {
        const active = ids.every((id) => selected.has(id))
        const shift = active ? dragDelta : 0
        return (
          <span
            key={keyFrame}
            data-key-ids={JSON.stringify(ids)}
            data-testid={`key-${row.id}-${keyFrame}`}
            data-selected={active ? 'true' : 'false'}
            className={cx('absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-pointer border', active ? 'border-white bg-accent-400' : 'border-ink-300 bg-ink-400')}
            style={{ left: (keyFrame + shift) * FRAME_WIDTH + FRAME_WIDTH / 2 }}
          />
        )
      })
    }
    return row.keys.map((key) => {
      const active = selected.has(key.id)
      return (
        <span
          key={key.id}
          data-key-ids={JSON.stringify([key.id])}
          data-testid={`key-${row.id}-${key.frame}`}
          data-selected={active ? 'true' : 'false'}
          className={cx('absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-pointer border', active ? 'border-white bg-signal-amber shadow-[0_0_0_2px_rgba(245,158,11,0.35)]' : cx('border-ink-950', CHANNEL_COLOR[row.channel ?? ''] ?? 'bg-ink-200'))}
          style={{ left: (key.frame + (active ? dragDelta : 0)) * FRAME_WIDTH + FRAME_WIDTH / 2 }}
          title={key.label ?? undefined}
        />
      )
    })
  }

  const ticks = Array.from({ length: frames }, (_, index) => index)
  const playhead = frame * FRAME_WIDTH + FRAME_WIDTH / 2

  return (
    <section className="flex h-[300px] shrink-0 flex-col border-t border-ink-600 bg-ink-900" data-testid="dopesheet" aria-label="律動表">
      <header className="flex h-9 shrink-0 items-center gap-1.5 border-b border-ink-700 bg-ink-850 px-3">
        <span className="text-sm font-semibold text-ink-100">律動表</span>
        <span className="truncate font-mono text-[11px] text-accent-400" data-testid="dopesheet-animation">{animation ?? '--'}</span>
        <span className="font-mono text-[11px] text-ink-400" data-testid="dopesheet-frame">{`第 ${frame} 格`}</span>
        <div className="mx-1 h-5 w-px bg-ink-700" />
        <Button size="xs" variant={autoKey ? 'active' : 'default'} onClick={() => controller.animate.setAutoKey(!autoKey)} testId="autokey-toggle" aria-pressed={autoKey} title="開啟時，拖曳控制軸或修改數值會直接在目前影格寫入關鍵影格">
          {autoKey ? '自動 K 幀：開' : '自動 K 幀：關'}
        </Button>
        <Button size="xs" icon={<KeyRound size={12} />} onClick={() => controller.animate.keySelected()} testId="key-selected" title="為選取的骨骼在目前影格寫入位移、旋轉、縮放 (K)">
          K 幀選取
        </Button>
        <Button size="xs" icon={<KeySquare size={12} />} onClick={() => controller.animate.keyAll()} testId="key-all" title="為全部骨骼在目前影格寫入關鍵影格 (Shift+K)">
          K 幀全部
        </Button>
        <div className="mx-1 h-5 w-px bg-ink-700" />
        <Button size="xs" variant="ghost" icon={<Copy size={12} />} disabled={keySelection.length === 0} onClick={() => controller.animate.copySelected()} testId="keys-copy" title="複製選取的關鍵影格 (Ctrl+C)">
          複製
        </Button>
        <Button size="xs" variant="ghost" icon={<ClipboardPaste size={12} />} disabled={clipboard === 0} onClick={() => controller.animate.paste()} testId="keys-paste" title="貼上到目前影格 (Ctrl+V)">
          貼上
        </Button>
        <Button size="xs" variant="ghost" icon={<Trash2 size={12} />} disabled={keySelection.length === 0} onClick={() => controller.animate.deleteSelected()} testId="keys-delete" title="刪除選取的關鍵影格 (Delete)">
          刪除
        </Button>
        <span className="ml-1 font-mono text-[11px] text-ink-400" data-testid="key-selection-count">{`已選 ${keySelection.length}`}</span>
        <div className="mx-1 h-5 w-px bg-ink-700" />
        <div className="w-28">
          <Select label="要新增的事件" value={eventName} options={eventNames.map((name) => ({ value: name, label: name }))} onChange={setEventChoice} testId="event-add-name" disabled={eventNames.length === 0} className="h-6" />
        </div>
        <Button size="xs" icon={<Flag size={12} />} disabled={!eventName} onClick={() => eventName && controller.animate.addEvent(eventName)} testId="event-add" title="在目前影格新增事件關鍵影格">
          新增事件
        </Button>
        {pending.length > 0 && (
          <span className="ml-auto truncate rounded border border-signal-amber/50 bg-signal-amber/10 px-2 py-0.5 text-[11px] text-signal-amber" data-testid="pending-pose">
            {`未 K 幀：${pending.join('、')}（按 K 寫入，換影格即捨棄）`}
          </span>
        )}
      </header>
      <div className="flex min-h-0 flex-1">
      <div className="relative min-h-0 min-w-0 flex-1 overflow-auto" data-testid="dopesheet-scroll">
        <div className="relative" style={{ width: LABEL_WIDTH + width, minHeight: '100%' }}>
          <div className="sticky top-0 z-20 flex" style={{ height: RULER_HEIGHT }}>
            <div className="sticky left-0 z-30 flex shrink-0 items-center border-b border-r border-ink-700 bg-ink-850 px-2 text-[10px] text-ink-400" style={{ width: LABEL_WIDTH }}>
              {`時間軸（${sheet.keyCount} 個關鍵影格）`}
            </div>
            <div ref={rulerRef} className="relative shrink-0 cursor-ew-resize border-b border-ink-700 bg-ink-850" style={{ width }} onPointerDown={onRulerDown} onPointerMove={onRulerMove} onPointerUp={onRulerUp} onPointerCancel={onRulerUp} data-testid="dopesheet-ruler">
              {ticks.map((tick) => (
                <span key={tick} className={cx('absolute bottom-0 w-px', tick % 5 === 0 ? 'h-2.5 bg-ink-400' : 'h-1.5 bg-ink-600')} style={{ left: tick * FRAME_WIDTH + FRAME_WIDTH / 2 }} />
              ))}
              {ticks
                .filter((tick) => tick % 5 === 0)
                .map((tick) => (
                  <span key={`label-${tick}`} className="absolute top-0.5 -translate-x-1/2 font-mono text-[9px] text-ink-400" style={{ left: tick * FRAME_WIDTH + FRAME_WIDTH / 2 }}>
                    {tick}
                  </span>
                ))}
              <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-signal-red" style={{ left: playhead }} />
            </div>
          </div>
          <div className="flex">
            <div className="sticky left-0 z-10 shrink-0 border-r border-ink-700 bg-ink-900" style={{ width: LABEL_WIDTH }}>
              {sheet.rows.map((row) => (
                <div
                  key={row.id}
                  className={cx(
                    'flex items-center gap-1 border-b border-ink-800 pr-2 text-[11px]',
                    (row.kind === 'bone' && row.target === selectedBone) || (row.kind === 'slot' && row.target === selectedSlot) ? 'bg-accent-500/15 text-accent-400' : row.kind === 'channel' ? 'text-ink-300' : 'text-ink-100',
                  )}
                  style={{ height: ROW_HEIGHT, paddingLeft: row.depth * 18 + 4 }}
                  data-testid={`dopesheet-row-${row.id}`}
                >
                  {row.kind === 'bone' || row.kind === 'slot' ? (
                    <>
                      <button type="button" className="text-ink-400 hover:text-ink-100" onClick={() => toggleCollapse(row.id)} aria-label={collapsed.includes(row.id) ? '展開通道' : '收合通道'} data-testid={`dopesheet-toggle-${row.id}`}>
                        {collapsed.includes(row.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      </button>
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left font-semibold"
                        onClick={() => (row.kind === 'bone' ? controller.revealBone(row.target) : controller.select({ kind: 'slot', name: row.target }))}
                      >
                        {row.kind === 'slot' ? `插槽 ${row.label}` : row.label}
                      </button>
                      {row.kind === 'bone' && pending.includes(row.target) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal-amber" title="有未 K 幀的變更" />}
                    </>
                  ) : row.kind === 'events' ? (
                    <>
                      <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', CHANNEL_COLOR.event)} />
                      <span className="truncate font-semibold text-signal-amber">事件</span>
                    </>
                  ) : (
                    <>
                      <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', CHANNEL_COLOR[row.channel ?? ''] ?? 'bg-ink-300')} />
                      <span className="truncate">{row.label}</span>
                    </>
                  )}
                </div>
              ))}
              {sheet.rows.length === 0 && <div className="px-3 py-3 text-[11px] text-ink-400">此動畫沒有時間軸。選取骨骼或插槽並按「K 幀選取」，或新增事件，即可建立第一個關鍵影格。</div>}
            </div>
            <div
              ref={tracksRef}
              className="relative shrink-0 select-none"
              style={{ width, height: Math.max(sheet.rows.length * ROW_HEIGHT, 60) }}
              onPointerDown={onTracksDown}
              onPointerMove={onTracksMove}
              onPointerUp={onTracksUp}
              onPointerCancel={onTracksUp}
              data-testid="dopesheet-tracks"
            >
              {sheet.rows.map((row, index) => (
                <div key={row.id} className={cx('absolute inset-x-0 border-b border-ink-800', row.kind === 'bone' || row.kind === 'slot' ? 'bg-ink-850/60' : '')} style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}>
                  {row.kind !== 'bone' && row.kind !== 'slot' && renderSegments(row)}
                  {renderKeys(row)}
                </div>
              ))}
              <span className="pointer-events-none absolute inset-y-0 w-px bg-signal-red/80" style={{ left: playhead }} />
              {box && <span className="pointer-events-none absolute border border-accent-400 bg-accent-500/10" style={{ left: box.x, top: box.y, width: box.width, height: box.height }} data-testid="dopesheet-box" />}
            </div>
          </div>
        </div>
      </div>
      <aside className="w-[252px] shrink-0 overflow-y-auto border-l border-ink-700 bg-ink-850" data-testid="key-inspector">
        <div className="border-b border-ink-700 px-3 py-1.5 text-[11px] font-semibold text-ink-200">{eventKey ? '事件參數' : '過渡曲線'}</div>
        {eventKey ? <EventKeyEditor /> : <CurveEditor />}
      </aside>
      </div>
    </section>
  )
}
