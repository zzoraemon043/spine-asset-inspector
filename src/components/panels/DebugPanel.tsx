import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import type { DebugFlag } from '@/core/types'
import { SHORTCUTS } from '@/hooks/useKeyboardShortcuts'
import { Panel, Kbd } from '../ui/Panel'
import { Button } from '../ui/Button'
import { Toggle } from '../ui/Toggle'

const ITEMS: ReadonlyArray<{ flag: DebugFlag; label: string; description: string; color: string }> = [
  { flag: 'bones', label: '骨骼', description: '骨骼長度方向與原點', color: '#ff0000' },
  { flag: 'slots', label: '插槽位置', description: '每個有部件的插槽所在骨骼位置', color: '#fabf24' },
  { flag: 'regions', label: '圖片外框', description: '每張圖片部件的範圍', color: '#4d4dff' },
  { flag: 'meshHull', label: '網格外框', description: '網格部件的外圍輪廓', color: '#4d4dff' },
  { flag: 'meshTriangles', label: '網格線框', description: '三角面與頂點', color: '#ffa300' },
  { flag: 'boundingBoxes', label: '碰撞框', description: '碰撞框部件與整體範圍', color: '#ff3d6e' },
  { flag: 'paths', label: '路徑', description: '路徑部件的曲線', color: '#ff7f00' },
  { flag: 'clipping', label: '裁切區', description: '裁切部件的多邊形', color: '#cc0000' },
]

export function DebugPanel() {
  const controller = useController()
  const debug = useInspectorStore((state) => state.debug)
  const showAxes = useInspectorStore((state) => state.showAxes)
  return (
    <div data-testid="debug-panel">
      <Panel
        title="除錯顯示"
        actions={
          <>
            <Button size="xs" variant="ghost" onClick={() => controller.setAllDebug(true)} testId="debug-all-on">
              全開
            </Button>
            <Button size="xs" variant="ghost" onClick={() => controller.setAllDebug(false)} testId="debug-all-off">
              全關
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-0.5 p-2">
          {ITEMS.map((item) => (
            <div key={item.flag} className="flex items-center gap-1">
              <span className="ml-1 h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
              <Toggle label={item.label} description={item.description} checked={debug[item.flag]} onChange={() => controller.toggleDebug(item.flag)} testId={`debug-${item.flag}`} />
            </div>
          ))}
          <div className="flex items-center gap-1">
            <span className="ml-1 h-2 w-2 shrink-0 rounded-sm bg-ink-300" />
            <Toggle label="原點座標軸" description="世界座標 X/Y 軸與原點" checked={showAxes} onChange={() => controller.toggleAxes()} testId="debug-axes" />
          </div>
        </div>
      </Panel>
      <Panel title="快捷鍵" className="border-b-0">
        <ul className="flex flex-col gap-1 p-3">
          {SHORTCUTS.map(([key, label]) => (
            <li key={key} className="flex items-center justify-between text-xs text-ink-300">
              <span>{label}</span>
              <Kbd>{key}</Kbd>
            </li>
          ))}
          <li className="flex items-center justify-between text-xs text-ink-300">
            <span>平移 / 縮放 / 適配</span>
            <Kbd>拖曳 / 滾輪 / 雙擊</Kbd>
          </li>
        </ul>
      </Panel>
    </div>
  )
}
