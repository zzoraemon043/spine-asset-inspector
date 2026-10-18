import { useMemo } from 'react'
import { Bone, Box, ChevronDown, ChevronRight, Film, Folder, Image, Link2, Search, Shirt, Users, Zap } from 'lucide-react'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import { TextInput } from '../ui/TextInput'
import { cx } from '../ui/cx'
import { buildTree, flattenMatches, isSelected, type TreeNode } from './treeModel'

const ICONS = {
  skeleton: Users,
  group: Folder,
  bone: Bone,
  slot: Box,
  attachment: Image,
  skin: Shirt,
  animation: Film,
  event: Zap,
  constraint: Link2,
} as const

const ICON_COLOR: Record<TreeNode['kind'], string> = {
  skeleton: 'text-accent-400',
  group: 'text-ink-400',
  bone: 'text-signal-amber',
  slot: 'text-accent-400',
  attachment: 'text-signal-green',
  skin: 'text-signal-violet',
  animation: 'text-accent-400',
  event: 'text-signal-red',
  constraint: 'text-signal-violet',
}

function Row({ node, depth, flat }: { node: TreeNode; depth: number; flat?: boolean }) {
  const controller = useController()
  const selection = useInspectorStore((state) => state.selection)
  const expanded = useInspectorStore((state) => Boolean(state.treeExpanded[node.key]))
  const playing = useInspectorStore((state) => state.animation)
  const activeSkins = useInspectorStore((state) => state.activeSkins)
  const selected = isSelected(node, selection)
  const hasChildren = !flat && node.children.length > 0
  const Icon = ICONS[node.kind]
  const isPlaying = node.kind === 'animation' && playing === node.label
  return (
    <li>
      <div
        className={cx('group flex h-6 cursor-pointer items-center gap-1 pr-2 text-xs', selected ? 'bg-accent-500/20 text-accent-400' : 'text-ink-200 hover:bg-ink-800')}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => (node.selection ? controller.select(node.selection) : controller.toggleTreeNode(node.key))}
        data-testid={node.testId}
        role={node.kind === 'animation' ? 'option' : 'treeitem'}
        aria-selected={node.kind === 'animation' ? isPlaying : selected}
        aria-expanded={hasChildren ? expanded : undefined}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? '收合' : '展開'}
            className="flex h-4 w-4 items-center justify-center text-ink-400 hover:text-ink-100"
            onClick={(event) => {
              event.stopPropagation()
              controller.toggleTreeNode(node.key)
            }}
            data-testid={node.testId ? `${node.testId}-toggle` : undefined}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <Icon size={13} className={cx('shrink-0', ICON_COLOR[node.kind])} />
        <span className={cx('truncate', node.kind === 'group' && 'font-semibold text-ink-300', isPlaying && 'font-semibold text-accent-400')}>{node.label}</span>
        {node.kind === 'skin' && (
          <input
            type="checkbox"
            className="ml-auto h-3.5 w-3.5 accent-[#22d3ee]"
            title="套用此皮膚"
            checked={activeSkins.includes(node.label)}
            onClick={(event) => event.stopPropagation()}
            onChange={() => controller.toggleSkin(node.label)}
            data-testid={`skin-toggle-${node.label}`}
          />
        )}
        {node.detail && node.kind !== 'skin' && <span className="ml-auto shrink-0 pl-2 font-mono text-[10px] text-ink-500">{node.detail}</span>}
      </div>
      {hasChildren && expanded && (
        <ul>
          {node.children.map((child) => (
            <Row key={child.key} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function HierarchyPanel() {
  const controller = useController()
  const asset = useInspectorStore((state) => state.asset)
  const filter = useInspectorStore((state) => state.treeFilter)
  const tree = useMemo(() => (asset ? buildTree(asset) : null), [asset])
  const matches = useMemo(() => (tree && filter.trim() ? flattenMatches(tree, filter) : null), [tree, filter])
  return (
    <section className="flex min-h-0 flex-[1.25] flex-col border-b border-ink-700" data-testid="hierarchy-panel">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-ink-700/60 bg-ink-850 px-3">
        <h2 className="text-xs font-semibold text-ink-200">階層</h2>
        <span className="text-[10px] text-ink-500">點選項目查看屬性，點動畫即播放</span>
      </header>
      <div className="p-2">
        <TextInput icon={<Search size={12} />} placeholder="搜尋骨骼、插槽、動畫…" value={filter} onChange={(event) => controller.setTreeFilter(event.target.value)} testId="tree-filter" />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto pb-2" role="tree" aria-label="骨架階層">
        {!tree && <li className="px-3 py-4 text-xs text-ink-400">尚未載入資產</li>}
        {matches && matches.length === 0 && <li className="px-3 py-4 text-xs text-ink-400">沒有符合的項目</li>}
        {matches ? matches.map((node) => <Row key={node.key} node={node} depth={0} flat />) : tree && <Row node={tree} depth={0} />}
      </ul>
    </section>
  )
}
