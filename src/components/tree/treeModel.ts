import type { AssetSummary } from '@/core/types'
import type { Selection, SelectionKind } from '@/store/defaults'

export interface TreeNode {
  readonly key: string
  readonly label: string
  readonly kind: SelectionKind | 'group'
  readonly selection: Selection | null
  readonly detail?: string
  readonly children: TreeNode[]
  readonly testId?: string
}

function attachmentNodes(summary: AssetSummary, slotName: string): TreeNode[] {
  const slot = summary.slots.find((item) => item.name === slotName)
  return (slot?.attachments ?? []).map((attachment) => ({
    key: `attachment:${slotName}:${attachment.name}`,
    label: attachment.name,
    kind: 'attachment',
    selection: { kind: 'attachment', name: attachment.name, slot: slotName },
    detail: attachment.type,
    children: [],
    testId: `tree-attachment-${slotName}-${attachment.name}`,
  }))
}

export function buildTree(summary: AssetSummary): TreeNode {
  const childrenOf = new Map<string | null, string[]>()
  for (const bone of summary.bones) {
    const list = childrenOf.get(bone.parent) ?? []
    list.push(bone.name)
    childrenOf.set(bone.parent, list)
  }
  const slotsOf = new Map<string, string[]>()
  for (const slot of summary.slots) {
    const list = slotsOf.get(slot.bone) ?? []
    list.push(slot.name)
    slotsOf.set(slot.bone, list)
  }
  const boneNode = (name: string): TreeNode => ({
    key: `bone:${name}`,
    label: name,
    kind: 'bone',
    selection: { kind: 'bone', name },
    children: [
      ...(slotsOf.get(name) ?? []).map(
        (slot): TreeNode => ({
          key: `slot:${slot}`,
          label: slot,
          kind: 'slot',
          selection: { kind: 'slot', name: slot },
          children: attachmentNodes(summary, slot),
          testId: `tree-slot-${slot}`,
        }),
      ),
      ...(childrenOf.get(name) ?? []).map(boneNode),
    ],
    testId: `tree-bone-${name}`,
  })
  return {
    key: 'skeleton',
    label: summary.name,
    kind: 'skeleton',
    selection: { kind: 'skeleton', name: summary.name },
    testId: 'tree-skeleton',
    children: [
      { key: 'bones', label: '骨骼', kind: 'group', selection: null, detail: String(summary.bones.length), children: (childrenOf.get(null) ?? []).map(boneNode), testId: 'tree-group-bones' },
      {
        key: 'skins',
        label: '皮膚',
        kind: 'group',
        selection: null,
        detail: String(summary.skins.length),
        testId: 'tree-group-skins',
        children: summary.skins.map((skin) => ({ key: `skin:${skin}`, label: skin, kind: 'skin', selection: { kind: 'skin', name: skin }, children: [], testId: `tree-skin-${skin}` })),
      },
      {
        key: 'animations',
        label: '動畫',
        kind: 'group',
        selection: null,
        detail: String(summary.animations.length),
        testId: 'tree-group-animations',
        children: summary.animations.map((animation) => ({
          key: `animation:${animation.name}`,
          label: animation.name,
          kind: 'animation',
          selection: { kind: 'animation', name: animation.name },
          detail: `${animation.duration.toFixed(2)} 秒`,
          children: [],
          testId: `animation-item-${animation.name}`,
        })),
      },
      ...(summary.constraints.length > 0
        ? [
            {
              key: 'constraints',
              label: '限制器',
              kind: 'group' as const,
              selection: null,
              detail: String(summary.constraints.length),
              testId: 'tree-group-constraints',
              children: summary.constraints.map((constraint) => ({
                key: `constraint:${constraint.type}:${constraint.name}`,
                label: `${constraint.type === 'ik' ? 'IK' : '變換'} ${constraint.name}`,
                kind: 'constraint' as const,
                selection: { kind: 'constraint' as const, name: constraint.name, group: constraint.type },
                children: [],
                testId: `tree-constraint-${constraint.type}-${constraint.name}`,
              })),
            },
          ]
        : []),
      {
        key: 'events',
        label: '事件',
        kind: 'group',
        selection: null,
        detail: String(summary.events.length),
        testId: 'tree-group-events',
        children: summary.events.map((event) => ({ key: `event:${event.name}`, label: event.name, kind: 'event', selection: { kind: 'event', name: event.name }, children: [], testId: `tree-event-${event.name}` })),
      },
    ],
  }
}

export function flattenMatches(root: TreeNode, filter: string): TreeNode[] {
  const needle = filter.trim().toLowerCase()
  const result: TreeNode[] = []
  const visit = (node: TreeNode) => {
    if (node.kind !== 'group' && node.kind !== 'skeleton' && node.label.toLowerCase().includes(needle)) result.push({ ...node, children: [] })
    node.children.forEach(visit)
  }
  visit(root)
  return result
}

export function isSelected(node: TreeNode, selection: Selection | null): boolean {
  if (!selection || !node.selection) return false
  return (
    node.selection.kind === selection.kind &&
    node.selection.name === selection.name &&
    (node.selection.slot ?? null) === (selection.slot ?? null) &&
    (node.selection.group ?? null) === (selection.group ?? null)
  )
}
