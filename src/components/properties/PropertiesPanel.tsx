import { Copy, Download, Eye, EyeOff, FileJson, Package, Play, RotateCcw, Trash2, TriangleAlert } from 'lucide-react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import { useLiveStore } from '@/store/liveStore'
import type { AssetSummary } from '@/core/types'
import type { Selection } from '@/store/defaults'
import { Badge } from '../ui/Badge'
import { Field, Section } from './sections'
import { ConstraintProps, CreateSection, DrawOrderEditor, MeshDeformEditor, SkinEditor } from './AdvancedEditors'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { EditRow, NumberField, TextField } from '../edit/EditFields'
import { findKeyed, findNamed, numberOf, stringOf } from '@/core/editor/document'
import { BLEND_LABEL, BLEND_MODES, type BoneNumericField } from '@/core/editor/commands'
import type { PoseField } from '@/core/spine/SpineInstance'
import { cx } from '../ui/cx'

const KIND_LABEL: Record<Selection['kind'], string> = {
  skeleton: '骨架',
  bone: '骨骼',
  slot: '插槽',
  attachment: '部件',
  skin: '皮膚',
  animation: '動畫',
  event: '事件',
  constraint: '限制器',
}

const ATTACHMENT_TYPE: Record<string, string> = {
  region: '圖片',
  mesh: '網格',
  boundingbox: '碰撞框',
  path: '路徑',
  point: '點',
  clipping: '裁切',
  unknown: '未知',
}

function num(value: number, digits = 2): string {
  return Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : '--'
}

function Stat({ label, value, testId }: { label: string; value: number | string; testId?: string }) {
  return (
    <div className="flex flex-col rounded border border-ink-700/70 bg-ink-850 px-2 py-1">
      <span className="text-[10px] text-ink-400">{label}</span>
      <span className="font-mono text-sm tabular-nums text-ink-100" data-testid={testId}>
        {value}
      </span>
    </div>
  )
}

function useEditor() {
  return useInspectorStore((state) => state.editor)
}

function ReadOnlyNote() {
  const reason = useInspectorStore((state) => state.editor.reason)
  if (!reason) return null
  return (
    <p className="mt-1 text-[11px] text-ink-400" data-testid="edit-disabled-reason">
      {reason}
    </p>
  )
}

function SkeletonProps({ asset }: { asset: AssetSummary }) {
  const controller = useController()
  const { stats } = asset
  const editor = useEditor()
  return (
    <>
      <Section title="編輯">
        {editor.enabled ? (
          <>
            <Field label="狀態" testId="edit-status">{editor.dirty ? '有未儲存的變更' : '與檔案一致'}</Field>
            <Field label="歷史步驟">{editor.entries.length}</Field>
            <div className="mt-2 flex gap-2">
              <Button variant="primary" icon={<FileJson size={13} />} onClick={() => controller.editor.saveJson()} testId="edit-save-json">
                儲存 JSON
              </Button>
              <Button icon={<Package size={13} />} onClick={() => void controller.editor.exportProject()} testId="edit-export-project">
                匯出專案 ZIP
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-ink-400">在骨骼、插槽、動畫或事件的屬性中直接修改數值，按 Enter 或移開游標即套用，Esc 取消；Ctrl+Z 復原、Ctrl+Shift+Z 重做。</p>
          </>
        ) : (
          <ReadOnlyNote />
        )}
      </Section>
      {editor.enabled && <CreateSection />}
      <Section title="檔案">
        <Field label="檔名">{asset.fileName}</Field>
        <Field label="格式">{asset.format === 'json' ? 'JSON' : '二進位 .skel'}</Field>
        <Field label="版本">{asset.upgradedFrom ? `${asset.upgradedFrom}（已自動升級為 4.2）` : asset.version.raw ?? '未知'}</Field>
        {editor.enabled ? (
          <EditRow label="影格速率">
            <NumberField label="影格速率" value={asset.fps} onCommit={(value) => controller.editor.setFps(value)} testId="edit-skeleton-fps" />
            <span className="text-ink-400">fps</span>
          </EditRow>
        ) : (
          <Field label="影格速率">{`${asset.fps} fps`}</Field>
        )}
        {asset.skeletonCandidates.length > 1 && (
          <div className="mt-1">
            <Select label="骨架檔" testId="skeleton-select" value={asset.fileName} options={asset.skeletonCandidates.map((path) => ({ value: path, label: path }))} onChange={(path) => void controller.switchSkeleton(path)} />
          </div>
        )}
      </Section>
      <Section title="統計">
        <div className="grid grid-cols-4 gap-1">
          <Stat label="骨骼" value={stats.bones} testId="stat-bones" />
          <Stat label="插槽" value={stats.slots} testId="stat-slots" />
          <Stat label="皮膚" value={stats.skins} testId="stat-skins" />
          <Stat label="動畫" value={stats.animations} testId="stat-animations" />
          <Stat label="事件" value={stats.events} />
          <Stat label="IK" value={stats.ikConstraints} />
          <Stat label="圖集頁" value={stats.atlasPages} />
          <Stat label="圖片數" value={stats.atlasRegions} />
        </div>
      </Section>
      {asset.warnings.length > 0 && (
        <Section title="提示">
          <ul className="flex flex-col gap-1" data-testid="asset-warnings">
            {asset.warnings.map((warning) => (
              <li key={warning} className="flex gap-1.5 text-[11px] text-signal-amber">
                <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                <span className="break-all">{warning}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

const BONE_DEFAULTS: Record<BoneNumericField, number> = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 0 }

const BONE_ROWS: ReadonlyArray<readonly [string, readonly BoneNumericField[]]> = [
  ['位置 X / Y', ['x', 'y']],
  ['旋轉', ['rotation']],
  ['縮放 X / Y', ['scaleX', 'scaleY']],
  ['斜切 X / Y', ['shearX', 'shearY']],
  ['長度', ['length']],
]

function BoneSetupEditor({ name }: { name: string }) {
  const controller = useController()
  const entry = useInspectorStore((state) => findNamed(state.editor.document, 'bones', name))
  const setupMode = useInspectorStore((state) => state.setupMode)
  const livePreview = useLiveStore((state) => (state.gizmoPreview?.bone === name ? state.gizmoPreview.values : null))
  const preview = setupMode ? livePreview : null
  if (!entry) return null
  const valueOf = (field: BoneNumericField) => {
    const live = field === 'x' || field === 'y' || field === 'rotation' || field === 'scaleX' || field === 'scaleY' ? preview?.[field] : undefined
    return live ?? numberOf(entry[field], BONE_DEFAULTS[field])
  }
  return (
    <Section title={preview ? '設置姿勢（拖曳中）' : '設置姿勢（可編輯）'}>
      {BONE_ROWS.map(([label, fields]) => (
        <EditRow key={label} label={label}>
          {fields.map((field) => (
            <NumberField
              key={field}
              label={`${name} ${field}`}
              value={valueOf(field)}
              onCommit={(value) => controller.editor.setBoneField(name, field, value)}
              testId={`edit-bone-${field}`}
            />
          ))}
        </EditRow>
      ))}
    </Section>
  )
}

const POSE_ROWS: ReadonlyArray<readonly [string, readonly PoseField[]]> = [
  ['位置 X / Y', ['x', 'y']],
  ['旋轉', ['rotation']],
  ['縮放 X / Y', ['scaleX', 'scaleY']],
]

const POSE_LABEL: Record<PoseField, string> = { x: '移動骨骼', y: '移動骨骼', rotation: '旋轉骨骼', scaleX: '縮放骨骼', scaleY: '縮放骨骼' }

function BonePoseEditor({ name }: { name: string }) {
  const controller = useController()
  const live = useLiveStore((state) => state.bone)
  const preview = useLiveStore((state) => (state.gizmoPreview?.bone === name ? state.gizmoPreview.values : null))
  const autoKey = useInspectorStore((state) => state.autoKey)
  const pending = useInspectorStore((state) => state.pendingPose.includes(name))
  const frame = useLiveStore((state) => state.snapshot.frame)
  if (!live) return null
  return (
    <Section title={`目前影格姿勢（第 ${frame} 格）`}>
      {POSE_ROWS.map(([label, fields]) => (
        <EditRow key={label} label={label}>
          {fields.map((field) => (
            <NumberField
              key={field}
              label={`${name} ${field} 姿勢`}
              value={preview?.[field] ?? live[field]}
              onCommit={(value) => controller.animate.applyPose(name, { [field]: value }, `${POSE_LABEL[field]} ${name}`)}
              testId={`pose-bone-${field}`}
            />
          ))}
        </EditRow>
      ))}
      <div className="mt-2 flex items-center gap-2">
        <Button size="xs" onClick={() => controller.animate.keySelected()} testId="pose-key">
          K 幀此骨骼 (K)
        </Button>
        <span className={cx('text-[11px]', pending ? 'text-signal-amber' : 'text-ink-400')} data-testid="pose-status">
          {pending ? '有未 K 幀的變更' : autoKey ? '自動 K 幀：修改即寫入' : '自動 K 幀關閉：修改後按 K 寫入'}
        </span>
      </div>
    </Section>
  )
}

function BoneProps({ asset, name }: { asset: AssetSummary; name: string }) {
  const controller = useController()
  const editor = useEditor()
  const animateMode = useInspectorStore((state) => state.animateMode)
  const bone = asset.bones.find((item) => item.name === name)
  const live = useLiveStore((state) => state.bone)
  if (!bone) return null
  return (
    <>
      <Section title="骨骼">
        {editor.enabled ? (
          <EditRow label="名稱">
            <TextField label="骨骼名稱" value={bone.name} onCommit={(value) => controller.editor.renameBone(bone.name, value)} testId="edit-bone-name" />
          </EditRow>
        ) : (
          <Field label="名稱">{bone.name}</Field>
        )}
        <Field label="父骨骼">{bone.parent ?? '（無）'}</Field>
        {!editor.enabled && <Field label="長度">{num(bone.length)}</Field>}
        <ReadOnlyNote />
      </Section>
      {animateMode && <BonePoseEditor name={bone.name} />}
      {editor.enabled ? (
        <BoneSetupEditor name={bone.name} />
      ) : (
        <Section title="設置姿勢">
          <Field label="位置 X / Y">{`${num(bone.x)} / ${num(bone.y)}`}</Field>
          <Field label="旋轉">{`${num(bone.rotation)} 度`}</Field>
          <Field label="縮放 X / Y">{`${num(bone.scaleX)} / ${num(bone.scaleY)}`}</Field>
          <Field label="斜切 X / Y">{`${num(bone.shearX)} / ${num(bone.shearY)}`}</Field>
        </Section>
      )}
      <Section title="目前畫面（即時）">
        <Field label="位置 X / Y" testId="bone-live-position">{live ? `${num(live.x)} / ${num(live.y)}` : '--'}</Field>
        <Field label="旋轉" testId="bone-live-rotation">{live ? `${num(live.rotation)} 度` : '--'}</Field>
        <Field label="縮放 X / Y">{live ? `${num(live.scaleX)} / ${num(live.scaleY)}` : '--'}</Field>
        <Field label="世界座標">{live ? `${num(live.worldX)}, ${num(live.worldY)}` : '--'}</Field>
      </Section>
    </>
  )
}

function SlotKeyEditor({ asset, name }: { asset: AssetSummary; name: string }) {
  const controller = useController()
  const frame = useLiveStore((state) => state.snapshot.frame)
  const attachment = useLiveStore((state) => state.attachments[name] ?? null)
  useInspectorStore((state) => state.editor.revision)
  const slot = asset.slots.find((item) => item.name === name)
  const color = controller.animate.currentSlotColor(name) ?? 'ffffffff'
  if (!slot) return null
  const alpha = Math.round((parseInt(color.slice(6, 8), 16) / 255) * 1000) / 1000
  return (
    <Section title={`目前影格（第 ${frame} 格）`}>
      <EditRow label="部件">
        <Select
          label="此影格的部件"
          className="h-6"
          value={attachment ?? '__none__'}
          options={[{ value: '__none__', label: '（隱藏）' }, ...slot.attachments.map((item) => ({ value: item.name, label: item.name }))]}
          onChange={(value) => controller.animate.keySlotAttachment(name, value === '__none__' ? null : value)}
          testId="slot-key-attachment"
        />
      </EditRow>
      <EditRow label="顏色 RGBA">
        <span className="h-4 w-4 shrink-0 rounded border border-ink-600" style={{ backgroundColor: `#${color}` }} data-testid="slot-key-swatch" />
        <TextField label="此影格的顏色" value={color} onCommit={(value) => controller.animate.keySlotColor(name, value)} testId="slot-key-color" />
      </EditRow>
      <EditRow label="透明度">
        <NumberField label="此影格的透明度" value={alpha} onCommit={(value) => controller.animate.keySlotColor(name, `${color.slice(0, 6)}${Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, '0')}`)} testId="slot-key-alpha" />
      </EditRow>
      <div className="mt-2 flex items-center gap-2">
        <Button size="xs" onClick={() => controller.animate.keySlot(name)} testId="slot-key-all">
          K 幀此插槽 (K)
        </Button>
        <span className="text-[11px] text-ink-400">修改部件或顏色會直接寫入此影格的關鍵影格</span>
      </div>
    </Section>
  )
}

function SlotProps({ asset, name }: { asset: AssetSummary; name: string }) {
  const controller = useController()
  const slot = asset.slots.find((item) => item.name === name)
  const override = useInspectorStore((state) => state.slotOverrides[name])
  const current = useLiveStore((state) => state.attachments[name])
  const editor = useEditor()
  const entry = useInspectorStore((state) => findNamed(state.editor.document, 'slots', name))
  const animateMode = useInspectorStore((state) => state.animateMode)
  if (!slot) return null
  const visible = override?.visible ?? true
  const choice = !override || override.attachment === undefined ? '__animated__' : override.attachment === null ? '__none__' : override.attachment
  return (
    <>
      <Section title="插槽">
        {editor.enabled ? (
          <EditRow label="名稱">
            <TextField label="插槽名稱" value={slot.name} onCommit={(value) => controller.editor.renameSlot(slot.name, value)} testId="edit-slot-name" />
          </EditRow>
        ) : (
          <Field label="名稱">{slot.name}</Field>
        )}
        <Field label="所屬骨骼">{slot.bone}</Field>
        <Field label="繪製順序">{slot.index}</Field>
        <Field label="目前部件" testId={`prop-slot-current-${slot.name}`}>{current ?? 'none'}</Field>
      </Section>
      {animateMode && <SlotKeyEditor asset={asset} name={slot.name} />}
      {animateMode && <DrawOrderEditor slot={slot.name} />}
      {editor.enabled && entry && (
        <Section title="設置值（可編輯）">
          <EditRow label="顏色 RGBA">
            <span className="h-4 w-4 shrink-0 rounded border border-ink-600" style={{ backgroundColor: `#${stringOf(entry.color) ?? 'ffffffff'}` }} />
            <TextField label="插槽顏色" value={stringOf(entry.color) ?? 'ffffffff'} onCommit={(value) => controller.editor.setSlotColor(slot.name, 'color', value)} testId="edit-slot-color" />
          </EditRow>
          <EditRow label="預設部件">
            <Select
              label="預設部件"
              className="h-6"
              value={stringOf(entry.attachment) ?? '__none__'}
              options={[{ value: '__none__', label: '（無）' }, ...slot.attachments.map((item) => ({ value: item.name, label: item.name }))]}
              onChange={(value) => controller.editor.setSlotAttachment(slot.name, value === '__none__' ? null : value)}
              testId="edit-slot-setup-attachment"
            />
          </EditRow>
          <EditRow label="混合模式">
            <Select
              label="混合模式"
              className="h-6"
              value={stringOf(entry.blend) ?? 'normal'}
              options={BLEND_MODES.map((mode) => ({ value: mode, label: BLEND_LABEL[mode] }))}
              onChange={(value) => controller.editor.setSlotBlend(slot.name, value)}
              testId="edit-slot-blend"
            />
          </EditRow>
        </Section>
      )}
      <Section title="顯示與部件">
        <div className="flex flex-col gap-2">
          <Button
            variant={visible ? 'default' : 'danger'}
            icon={visible ? <Eye size={13} /> : <EyeOff size={13} />}
            onClick={() => controller.setSlotVisible(slot.name, !visible)}
            testId={`prop-slot-visibility-${slot.name}`}
          >
            {visible ? '隱藏此插槽' : '恢復顯示'}
          </Button>
          <Select
            label="指定部件"
            value={choice}
            options={[{ value: '__animated__', label: '依動畫（預設）' }, { value: '__none__', label: '不顯示部件' }, ...slot.attachments.map((item) => ({ value: item.name, label: `${item.name}（${ATTACHMENT_TYPE[item.type]}）` }))]}
            onChange={(value) => controller.setSlotAttachment(slot.name, value === '__animated__' ? undefined : value === '__none__' ? null : value)}
            testId={`prop-slot-attachment-${slot.name}`}
          />
          {override && (
            <Button size="xs" variant="ghost" icon={<RotateCcw size={12} />} onClick={() => controller.resetSlot(slot.name)}>
              還原此插槽
            </Button>
          )}
        </div>
      </Section>
    </>
  )
}

function AttachmentProps({ asset, name, slotName }: { asset: AssetSummary; name: string; slotName: string }) {
  const controller = useController()
  const slot = asset.slots.find((item) => item.name === slotName)
  const attachment = slot?.attachments.find((item) => item.name === name)
  const regionExists = useInspectorStore((state) => state.atlas?.regions.some((region) => region.name === name) ?? false)
  const animateMode = useInspectorStore((state) => state.animateMode)
  if (!slot || !attachment) return null
  return (
    <>
    <Section title="部件">
      <Field label="名稱">{attachment.name}</Field>
      <Field label="類型">{ATTACHMENT_TYPE[attachment.type]}</Field>
      <Field label="插槽">{slot.name}</Field>
      <Field label="所在皮膚">{attachment.skins.join('、')}</Field>
      <div className="mt-2 flex flex-col gap-2">
        <Button onClick={() => controller.setSlotAttachment(slot.name, attachment.name)} testId="attachment-apply">
          在畫面上強制顯示此部件
        </Button>
        {regionExists && (
          <Button
            variant="ghost"
            onClick={() => {
              controller.atlas.selectRegion(name)
              controller.setAdvancedOpen(true, 'atlas')
            }}
          >
            替換此部件的圖片
          </Button>
        )}
      </div>
    </Section>
    {animateMode && attachment.type === 'mesh' && <MeshDeformEditor />}
    </>
  )
}

function SkinProps({ asset, name }: { asset: AssetSummary; name: string }) {
  const controller = useController()
  const active = useInspectorStore((state) => state.activeSkins.includes(name))
  const count = asset.slots.reduce((sum, slot) => sum + slot.attachments.filter((item) => item.skins.includes(name)).length, 0)
  return (
    <Section title="皮膚">
      <Field label="名稱">{name}</Field>
      <Field label="部件數">{count}</Field>
      <Field label="狀態">{active ? '已套用' : '未套用'}</Field>
      <div className="mt-2 flex gap-2">
        <Button variant={active ? 'active' : 'default'} onClick={() => controller.toggleSkin(name)}>
          {active ? '取消套用' : '加入套用'}
        </Button>
        <Button variant="ghost" onClick={() => controller.soloSkin(name)}>
          只套用這個
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-ink-400">可同時套用多個皮膚組合換裝，未涵蓋的插槽沿用 default 皮膚。</p>
    </Section>
  )
}

function SkinPropsWithEditor({ asset, name }: { asset: AssetSummary; name: string }) {
  const editor = useEditor()
  return (
    <>
      <SkinProps asset={asset} name={name} />
      {editor.enabled && <SkinEditor name={name} />}
    </>
  )
}

function AnimationProps({ asset, name }: { asset: AssetSummary; name: string }) {
  const controller = useController()
  const editor = useEditor()
  const animation = asset.animations.find((item) => item.name === name)
  if (!animation) return null
  return (
    <>
      <Section title="動畫">
        {editor.enabled ? (
          <EditRow label="名稱">
            <TextField label="動畫名稱" value={animation.name} onCommit={(value) => controller.editor.renameAnimation(animation.name, value)} testId="edit-animation-name" />
          </EditRow>
        ) : (
          <Field label="名稱">{animation.name}</Field>
        )}
        <Field label="長度">{`${num(animation.duration, 3)} 秒`}</Field>
        <Field label="影格數">{`${Math.max(1, Math.round(animation.duration * asset.fps))}（${asset.fps} fps）`}</Field>
        <div className="mt-2 flex gap-2">
          <Button icon={<Play size={13} />} onClick={() => controller.selectAnimation(animation.name)}>
            播放
          </Button>
          <Button variant="primary" icon={<Download size={13} />} onClick={() => controller.setExportOpen(true, animation.name)} testId="animation-export">
            匯出這個動作
          </Button>
        </div>
        {editor.enabled && (
          <div className="mt-2 flex gap-2">
            <Button size="xs" icon={<Copy size={12} />} onClick={() => controller.editor.duplicateAnimation(animation.name)} testId="animation-duplicate">
              複製動畫
            </Button>
            <Button size="xs" variant="danger" icon={<Trash2 size={12} />} onClick={() => controller.editor.deleteAnimation(animation.name)} testId="animation-delete">
              刪除動畫
            </Button>
          </div>
        )}
      </Section>
      <Section title={`事件（${animation.events.length}）`}>
        {animation.events.length === 0 && <span className="text-xs text-ink-400">此動畫沒有事件</span>}
        <ul className="flex flex-col gap-0.5">
          {animation.events.map((event, index) => (
            <li key={`${event.name}-${index}`} className="flex gap-2 font-mono text-[11px]">
              <span className="w-14 text-accent-400">{`${num(event.time, 3)}s`}</span>
              <span className="text-ink-100">{event.name}</span>
              <span className="truncate text-ink-400">{`${event.intValue} / ${num(event.floatValue)} / ${event.stringValue}`}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}

function EventEditor({ name }: { name: string }) {
  const controller = useController()
  const entry = useInspectorStore((state) => findKeyed(state.editor.document, 'events', name))
  if (!entry) return null
  return (
    <>
      <EditRow label="名稱">
        <TextField label="事件名稱" value={name} onCommit={(value) => controller.editor.renameEvent(name, value)} testId="edit-event-name" />
      </EditRow>
      <EditRow label="預設整數">
        <NumberField label="預設整數" value={numberOf(entry.int, 0)} onCommit={(value) => controller.editor.setEventField(name, 'int', value)} testId="edit-event-int" />
      </EditRow>
      <EditRow label="預設小數">
        <NumberField label="預設小數" value={numberOf(entry.float, 0)} onCommit={(value) => controller.editor.setEventField(name, 'float', value)} testId="edit-event-float" />
      </EditRow>
      <EditRow label="預設字串">
        <TextField label="預設字串" value={stringOf(entry.string) ?? ''} onCommit={(value) => controller.editor.setEventField(name, 'string', value)} testId="edit-event-string" />
      </EditRow>
      {stringOf(entry.audio) && (
        <>
          <Field label="音效">{stringOf(entry.audio)}</Field>
          <EditRow label="音量 / 平衡">
            <NumberField label="音量" value={numberOf(entry.volume, 1)} onCommit={(value) => controller.editor.setEventField(name, 'volume', value)} testId="edit-event-volume" />
            <NumberField label="左右平衡" value={numberOf(entry.balance, 0)} onCommit={(value) => controller.editor.setEventField(name, 'balance', value)} testId="edit-event-balance" />
          </EditRow>
        </>
      )}
    </>
  )
}

function EventProps({ asset, name }: { asset: AssetSummary; name: string }) {
  const editor = useEditor()
  const event = asset.events.find((item) => item.name === name)
  if (!event) return null
  const usage = asset.animations.flatMap((animation) => animation.events.filter((item) => item.name === name).map((item) => `${animation.name} @ ${num(item.time, 3)}s`))
  return (
    <Section title="事件">
      {editor.enabled ? (
        <EventEditor name={event.name} />
      ) : (
        <>
          <Field label="名稱">{event.name}</Field>
          <Field label="預設整數">{event.intValue}</Field>
          <Field label="預設小數">{num(event.floatValue, 3)}</Field>
          <Field label="預設字串">{event.stringValue || '（空）'}</Field>
          {event.audioPath && <Field label="音效">{event.audioPath}</Field>}
        </>
      )}
      <h3 className="mb-1 mt-2 text-[11px] font-semibold text-ink-300">出現位置</h3>
      <ul className="flex flex-col gap-0.5 font-mono text-[11px] text-ink-200">
        {usage.length === 0 && <li className="text-ink-400">沒有動畫使用此事件</li>}
        {usage.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Section>
  )
}

export function PropertiesPanel() {
  const asset = useInspectorStore((state) => state.asset)
  const selection = useInspectorStore((state) => state.selection)
  const current = selection ?? (asset ? { kind: 'skeleton' as const, name: asset.name } : null)
  const controller = useController()
  const editable = useInspectorStore((state) => state.editor.enabled)
  const deletable = editable && selection !== null && controller.deletableSelection() !== null
  return (
    <section className="flex min-h-0 flex-1 flex-col" data-testid="properties-panel">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-ink-700/60 bg-ink-850 px-3">
        <h2 className="text-xs font-semibold text-ink-200">屬性</h2>
        {current && <Badge tone="accent">{KIND_LABEL[current.kind]}</Badge>}
        {current && <span className="truncate font-mono text-[11px] text-ink-300" data-testid="properties-title">{current.name}</span>}
        {deletable && (
          <Button size="xs" variant="ghost" className="ml-auto" icon={<Trash2 size={12} />} onClick={() => controller.deleteSelection()} testId="selection-delete" title="刪除選取的物件 (Delete)">
            刪除
          </Button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!asset && <div className="px-3 py-4 text-xs text-ink-400">拖曳 Spine 檔案到畫面，或按左上角「開啟檔案」。</div>}
        {asset && current?.kind === 'skeleton' && <SkeletonProps asset={asset} />}
        {asset && current?.kind === 'bone' && <BoneProps asset={asset} name={current.name} />}
        {asset && current?.kind === 'slot' && <SlotProps asset={asset} name={current.name} />}
        {asset && current?.kind === 'attachment' && <AttachmentProps asset={asset} name={current.name} slotName={current.slot ?? ''} />}
        {asset && current?.kind === 'skin' && <SkinPropsWithEditor asset={asset} name={current.name} />}
        {asset && current?.kind === 'constraint' && current.group && <ConstraintProps asset={asset} name={current.name} type={current.group} />}
        {asset && current?.kind === 'animation' && <AnimationProps asset={asset} name={current.name} />}
        {asset && current?.kind === 'event' && <EventProps asset={asset} name={current.name} />}
      </div>
    </section>
  )
}
