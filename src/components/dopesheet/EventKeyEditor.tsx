import { useMemo } from 'react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import { EVENT_CHANNEL } from '@/core/animation/channels'
import { channelKeys, parseKeyId, type KeyRef } from '@/core/animation/keyCommands'
import { findKeyed, numberOf, stringOf } from '@/core/editor/document'
import { isObject } from '@/core/editor/json'
import { EditRow, NumberField, TextField } from '../edit/EditFields'
import { Select } from '../ui/Select'

export function useSelectedEventKey(): { ref: KeyRef; extra: Record<string, unknown>; time: number } | null {
  const selection = useInspectorStore((state) => state.keySelection)
  const document = useInspectorStore((state) => state.editor.document)
  const animation = useInspectorStore((state) => state.animation)
  return useMemo(() => {
    if (selection.length !== 1 || !document || !animation) return null
    const ref = parseKeyId(selection[0])
    if (!ref || ref.channel !== EVENT_CHANNEL) return null
    const key = channelKeys(document, animation, ref.target, ref.channel)[ref.index]
    return key ? { ref, extra: key.extra, time: key.time } : null
  }, [selection, document, animation])
}

export function EventKeyEditor() {
  const controller = useController()
  const selected = useSelectedEventKey()
  const document = useInspectorStore((state) => state.editor.document)
  const fps = useInspectorStore((state) => state.asset?.fps ?? 30)
  if (!selected || !document) return null
  const name = typeof selected.extra.name === 'string' ? selected.extra.name : ''
  const definition = findKeyed(document, 'events', name)
  const names = isObject(document.events) ? Object.keys(document.events) : []
  const value = (field: string, fallback: number) => (typeof selected.extra[field] === 'number' ? (selected.extra[field] as number) : numberOf(definition?.[field], fallback))
  const update = (field: string, next: number | string) => controller.animate.updateEventKey(selected.ref, { [field]: next })
  return (
    <div className="flex flex-col gap-1 px-3 py-2" data-testid="event-key-editor">
      <span className="text-[11px] text-ink-300">{`事件關鍵影格（第 ${Math.round(selected.time * fps)} 格）`}</span>
      <EditRow label="事件">
        <Select label="事件名稱" value={name} options={names.map((item) => ({ value: item, label: item }))} onChange={(next) => update('name', next)} testId="event-key-name" className="h-6" />
      </EditRow>
      <EditRow label="整數">
        <NumberField label="事件整數" value={value('int', 0)} onCommit={(next) => update('int', next)} testId="event-key-int" />
      </EditRow>
      <EditRow label="小數">
        <NumberField label="事件小數" value={value('float', 0)} onCommit={(next) => update('float', next)} testId="event-key-float" />
      </EditRow>
      <EditRow label="字串">
        <TextField label="事件字串" value={typeof selected.extra.string === 'string' ? selected.extra.string : stringOf(definition?.string) ?? ''} onCommit={(next) => update('string', next)} testId="event-key-string" />
      </EditRow>
      {stringOf(definition?.audio) && (
        <EditRow label="音量 / 平衡">
          <NumberField label="事件音量" value={value('volume', 1)} onCommit={(next) => update('volume', next)} testId="event-key-volume" />
          <NumberField label="事件平衡" value={value('balance', 0)} onCommit={(next) => update('balance', next)} testId="event-key-balance" />
        </EditRow>
      )}
      <span className="text-[10px] text-ink-400">未填的參數沿用事件定義的預設值。</span>
    </div>
  )
}
