import { useController } from '@/controller/ControllerContext'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import { TopBar } from './TopBar'
import { StatusBar } from './StatusBar'
import { NoticeStack } from './NoticeStack'
import { AdvancedDrawer } from './AdvancedDrawer'
import { StageView } from '../stage/StageView'
import { PlaybackBar } from '../stage/PlaybackBar'
import { HierarchyPanel } from '../tree/HierarchyPanel'
import { PropertiesPanel } from '../properties/PropertiesPanel'
import { ExportDialog } from '../export/ExportDialog'
import { Dopesheet } from '../dopesheet/Dopesheet'
import { useInspectorStore } from '@/store/inspectorStore'

export function Workbench() {
  const controller = useController()
  useKeyboardShortcuts(controller)
  useUnsavedGuard()
  const animateMode = useInspectorStore((state) => state.animateMode)
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_340px] grid-rows-[48px_minmax(0,1fr)_24px] bg-ink-950" data-testid="workbench">
      <TopBar />
      <main className="flex min-h-0 min-w-0 flex-col border-r border-ink-700 bg-ink-900">
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <StageView />
          </div>
          <AdvancedDrawer />
        </div>
        {animateMode && <Dopesheet />}
        <PlaybackBar />
      </main>
      <aside className="flex min-h-0 flex-col overflow-hidden bg-ink-900" data-testid="side-panel">
        <HierarchyPanel />
        <PropertiesPanel />
      </aside>
      <StatusBar />
      <ExportDialog />
      <NoticeStack />
    </div>
  )
}
