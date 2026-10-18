import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import { useLiveStore } from '@/store/liveStore'
import type { AssetSummary } from '@/core/types'
import { findNamed, numberOf } from '@/core/editor/document'
import { attachmentSources, CONSTRAINT_FIELD_LABEL, IK_FIELDS, TRANSFORM_FIELDS } from '@/core/editor/structureCommands'
import { isObject } from '@/core/editor/json'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { TextInput } from '../ui/TextInput'
import { EditRow, NumberField, TextField } from '../edit/EditFields'
import { Field, Section } from './sections'

const BOOLEAN_FIELDS = new Set(['bendPositive', 'compress', 'stretch', 'uniform'])
const BOOLEAN_DEFAULT: Record<string, boolean> = { bendPositive: true, compress: false, stretch: false, uniform: false }

function CreateRow({ label, placeholder, testId, onCreate }: { label: string; placeholder: string; testId: string; onCreate: (name: string) => boolean }) {
  const [name, setName] = useState('')
  const submit = () => {
    if (onCreate(name)) setName('')
  }
  return (
    <EditRow label={label}>
      <TextInput
        className="h-6 flex-1"
        placeholder={placeholder}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
        }}
        testId={`${testId}-name`}
      />
      <Button size="xs" icon={<Plus size={12} />} onClick={submit} testId={testId}>
        新增
      </Button>
    </EditRow>
  )
}

export function CreateSection() {
  const controller = useController()
  return (
    <Section title="新增">
      <CreateRow
        label="空白動畫"
        placeholder="動畫名稱"
        testId="new-animation"
        onCreate={(name) => {
          if (!controller.editor.addAnimation(name)) return false
          controller.select({ kind: 'animation', name: name.trim() })
          return true
        }}
      />
      <CreateRow
        label="皮膚"
        placeholder="皮膚名稱"
        testId="new-skin"
        onCreate={(name) => {
          if (!controller.editor.addSkin(name)) return false
          controller.select({ kind: 'skin', name: name.trim() })
          return true
        }}
      />
    </Section>
  )
}

export function SkinEditor({ name }: { name: string }) {
  const controller = useController()
  const document = useInspectorStore((state) => state.editor.document)
  const [choice, setChoice] = useState('')
  const sources = useMemo(() => (document ? attachmentSources(document) : []), [document])
  const own = sources.filter((item) => item.skin === name)
  const ownKeys = new Set(own.map((item) => `${item.slot}/${item.name}`))
  const options = sources.filter((item) => item.skin !== name && !ownKeys.has(`${item.slot}/${item.name}`))
  const unique = options.filter((item, index) => options.findIndex((other) => other.slot === item.slot && other.name === item.name) === index)
  const selected = unique.find((item) => `${item.skin}::${item.slot}::${item.name}` === choice) ?? unique[0]
  return (
    <Section title="皮膚編輯">
      {name !== 'default' && (
        <EditRow label="名稱">
          <TextField label="皮膚名稱" value={name} onCommit={(value) => controller.editor.renameSkin(name, value)} testId="edit-skin-name" />
        </EditRow>
      )}
      <h4 className="mt-2 text-[11px] text-ink-300">{`綁定的部件（${own.length}）`}</h4>
      <ul className="mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto" data-testid="skin-attachments">
        {own.length === 0 && <li className="text-[11px] text-ink-400">此皮膚尚未綁定任何部件</li>}
        {own.map((item) => (
          <li key={`${item.slot}/${item.name}`} className="flex items-center gap-2 font-mono text-[11px] text-ink-200">
            <span className="min-w-0 flex-1 truncate">{`${item.slot} / ${item.name}`}</span>
            <Button size="xs" variant="ghost" icon={<Trash2 size={11} />} onClick={() => controller.editor.removeSkinAttachment(name, item.slot, item.name)} testId={`skin-attachment-remove-${item.slot}-${item.name}`}>
              移除
            </Button>
          </li>
        ))}
      </ul>
      {unique.length > 0 && (
        <EditRow label="加入部件">
          <Select
            label="要加入的部件"
            className="h-6"
            value={selected ? `${selected.skin}::${selected.slot}::${selected.name}` : ''}
            options={unique.map((item) => ({ value: `${item.skin}::${item.slot}::${item.name}`, label: `${item.slot} / ${item.name}（${item.skin}）` }))}
            onChange={setChoice}
            testId="skin-attachment-choice"
          />
          <Button size="xs" icon={<Plus size={12} />} disabled={!selected} onClick={() => selected && controller.editor.addSkinAttachment(name, selected.slot, selected.name, selected.skin)} testId="skin-attachment-add">
            加入
          </Button>
        </EditRow>
      )}
    </Section>
  )
}

export function ConstraintProps({ asset, name, type }: { asset: AssetSummary; name: string; type: 'ik' | 'transform' }) {
  const controller = useController()
  const editorEnabled = useInspectorStore((state) => state.editor.enabled)
  const animateMode = useInspectorStore((state) => state.animateMode)
  const entry = useInspectorStore((state) => findNamed(state.editor.document, type, name))
  const frame = useLiveStore((state) => state.snapshot.frame)
  useInspectorStore((state) => state.editor.revision)
  const info = asset.constraints.find((item) => item.name === name && item.type === type)
  if (!info) return null
  const fields = type === 'ik' ? IK_FIELDS : TRANSFORM_FIELDS
  const live = controller.animate.constraintValues(type, name)
  const setupValue = (field: string): number | boolean => {
    if (BOOLEAN_FIELDS.has(field)) return typeof entry?.[field] === 'boolean' ? (entry[field] as boolean) : BOOLEAN_DEFAULT[field]
    if (type === 'transform' && field === 'mixY' && entry?.mixY === undefined) return numberOf(entry?.mixX, 1)
    if (type === 'transform' && field === 'mixScaleY' && entry?.mixScaleY === undefined) return numberOf(entry?.mixScaleX, 1)
    return numberOf(entry?.[field], field === 'softness' ? 0 : 1)
  }
  return (
    <>
      <Section title={type === 'ik' ? 'IK 限制器' : '變換限制器'}>
        <Field label="名稱">{name}</Field>
        <Field label="受控骨骼" testId="constraint-bones">{info.bones.join('、')}</Field>
        <Field label="目標骨骼" testId="constraint-target">{info.target}</Field>
        {type === 'ik' && <p className="mt-1 text-[11px] text-ink-400">在設置或動畫模式拖曳目標骨骼，受控骨骼鏈會即時反向運算。</p>}
      </Section>
      {editorEnabled && entry && (
        <Section title="設置值（可編輯）">
          {fields.map((field) =>
            BOOLEAN_FIELDS.has(field) ? (
              <EditRow key={field} label={CONSTRAINT_FIELD_LABEL[field]}>
                <Button size="xs" variant={setupValue(field) ? 'active' : 'default'} onClick={() => controller.editor.setConstraintField(type, name, field, !setupValue(field))} testId={`constraint-setup-${field}`}>
                  {setupValue(field) ? '開' : '關'}
                </Button>
              </EditRow>
            ) : (
              <EditRow key={field} label={CONSTRAINT_FIELD_LABEL[field]}>
                <NumberField label={`${name} ${field}`} value={setupValue(field) as number} onCommit={(value) => controller.editor.setConstraintField(type, name, field, value)} testId={`constraint-setup-${field}`} />
              </EditRow>
            ),
          )}
        </Section>
      )}
      {animateMode && live && (
        <Section title={`目前影格（第 ${frame} 格）`}>
          {(type === 'ik' ? ['mix', 'softness'] : TRANSFORM_FIELDS).map((field) => (
            <EditRow key={field} label={CONSTRAINT_FIELD_LABEL[field as keyof typeof CONSTRAINT_FIELD_LABEL]}>
              {field !== 'softness' && (
                <input
                  type="range"
                  aria-label={`${CONSTRAINT_FIELD_LABEL[field as keyof typeof CONSTRAINT_FIELD_LABEL]}滑桿`}
                  className="range-input w-20"
                  min={0}
                  max={1}
                  step={0.01}
                  value={Number(live[field])}
                  onChange={(event) => controller.animate.keyConstraint(type, name, { [field]: Number(event.target.value) })}
                  data-testid={`constraint-key-slider-${field}`}
                />
              )}
              <NumberField label={`${name} ${field} 此影格`} value={Math.round(Number(live[field]) * 1e4) / 1e4} onCommit={(value) => controller.animate.keyConstraint(type, name, { [field]: value })} testId={`constraint-key-${field}`} />
            </EditRow>
          ))}
          <div className="mt-2 flex items-center gap-2">
            <Button size="xs" onClick={() => controller.animate.keyConstraint(type, name)} testId="constraint-key-all">
              K 幀此限制器
            </Button>
            <span className="text-[11px] text-ink-400">修改權重會直接寫入此影格</span>
          </div>
        </Section>
      )}
    </>
  )
}

export function DrawOrderEditor({ slot }: { slot: string }) {
  const controller = useController()
  const frame = useLiveStore((state) => state.snapshot.frame)
  useInspectorStore((state) => state.editor.revision)
  const order = controller.animate.currentDrawOrder()
  const index = order.indexOf(slot)
  const setup = controller.animate.setupDrawOrder()
  const changed = order.some((name, position) => name !== setup[position])
  return (
    <Section title={`繪製順序（第 ${frame} 格）`}>
      <Field label="目前層級" testId="draw-order-index">{`${index + 1} / ${order.length}`}</Field>
      <div className="mt-1 flex flex-wrap gap-1">
        <Button size="xs" icon={<ArrowUp size={12} />} disabled={index < 0 || index >= order.length - 1} onClick={() => controller.animate.moveDrawOrder(slot, 1)} testId="draw-order-forward">
          往前一層
        </Button>
        <Button size="xs" icon={<ArrowDown size={12} />} disabled={index <= 0} onClick={() => controller.animate.moveDrawOrder(slot, -1)} testId="draw-order-backward">
          往後一層
        </Button>
        <Button size="xs" variant="ghost" icon={<RotateCcw size={12} />} disabled={!changed} onClick={() => controller.animate.resetDrawOrder()} testId="draw-order-reset">
          還原設置順序
        </Button>
      </div>
      <ol className="mt-2 flex max-h-28 flex-col-reverse overflow-y-auto font-mono text-[10px] text-ink-400" data-testid="draw-order-list">
        {order.map((name, position) => (
          <li key={name} className={name === slot ? 'text-accent-400' : name !== setup[position] ? 'text-signal-amber' : undefined}>{`${position + 1}. ${name}`}</li>
        ))}
      </ol>
      <p className="mt-1 text-[11px] text-ink-400">清單上方較晚繪製（在前）；修改會直接寫入此影格的繪製順序關鍵影格。</p>
    </Section>
  )
}

export function MeshDeformEditor() {
  const controller = useController()
  const selection = useInspectorStore((state) => state.meshSelection)
  const playing = useInspectorStore((state) => state.playing)
  useLiveStore((state) => state.meshScreen)
  const target = controller.mesh.target()
  const document = useInspectorStore((state) => state.editor.document)
  const isMeshDefinition = useMemo(() => {
    if (!target || !document) return false
    const skin = Array.isArray(document.skins) ? document.skins.find((item) => isObject(item) && item.name === target.skin) : null
    const attachments = isObject(skin) && isObject(skin.attachments) ? skin.attachments[target.slot.data.name] : null
    return isObject(attachments) && isObject(attachments[target.attachment.name])
  }, [target, document])
  if (!target) {
    return (
      <Section title="網格變形">
        <p className="text-[11px] text-ink-400" data-testid="mesh-hint">{playing ? '暫停後即可編輯網格頂點。' : '此部件不是目前影格顯示中的網格，或尚未進入動畫模式。'}</p>
      </Section>
    )
  }
  return (
    <Section title="網格變形（目前影格）">
      <Field label="皮膚">{target.skin}</Field>
      <Field label="頂點" testId="mesh-selection">{`已選 ${selection.length} / ${target.attachment.worldVerticesLength / 2}`}</Field>
      <div className="mt-1 flex flex-wrap gap-1">
        <Button size="xs" onClick={() => controller.mesh.selectAll()} testId="mesh-select-all">
          全選頂點
        </Button>
        <Button size="xs" variant="ghost" onClick={() => controller.mesh.clearSelection()} testId="mesh-clear">
          取消選取
        </Button>
        <Button size="xs" variant="ghost" icon={<RotateCcw size={12} />} disabled={!isMeshDefinition} onClick={() => controller.mesh.resetDeform()} testId="mesh-reset">
          重設此影格變形
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-ink-400">在畫面點選黃色頂點（Shift 加選），拖曳即在此影格寫入變形關鍵影格；Esc 取消拖曳。</p>
    </Section>
  )
}
