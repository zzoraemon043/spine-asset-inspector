import { useEffect } from 'react'
import type { InspectorController } from '@/controller/InspectorController'
import { useInspectorStore } from '@/store/inspectorStore'

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export const SHORTCUTS: ReadonlyArray<readonly [string, string]> = [
  ['Space', '播放 / 暫停'],
  ['Left / Right', '單影格後退 / 前進'],
  ['Shift + Left / Right', '後退 / 前進 10 影格'],
  ['Home', '回到第 0 影格'],
  ['L', '循環切換'],
  ['F', '視角適配'],
  ['0', '縮放 100%'],
  ['B', '骨骼線框'],
  ['Ctrl + Z', '復原編輯'],
  ['Ctrl + Shift + Z / Ctrl + Y', '重做編輯'],
  ['Ctrl + S', '儲存 JSON'],
  ['S', '設置模式切換'],
  ['A', '動畫模式切換（開啟律動表）'],
  ['K / Shift + K', '動畫模式：K 幀選取骨骼 / 全部骨骼'],
  ['Delete / Backspace', '刪除選取的關鍵影格'],
  ['Delete', '刪除選取的物件（骨骼、插槽、部件、限制器、皮膚、事件、動畫）'],
  ['Ctrl + C / Ctrl + V', '複製 / 貼上關鍵影格到目前影格'],
  ['W / E / R', '控制軸：位移 / 旋轉 / 縮放'],
  ['Shift（拖曳時）', '暫時切換吸附'],
  ['Esc', '取消拖曳 / 關閉進階工具'],
]

function handleEditShortcut(controller: InspectorController<ImageBitmap>, event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return false
  if (!useInspectorStore.getState().editor.enabled) return false
  const key = event.key.toLowerCase()
  const state = useInspectorStore.getState()
  if (state.animateMode && key === 'c' && !event.shiftKey) return controller.animate.copySelected() > 0
  if (state.animateMode && key === 'v' && !event.shiftKey) return controller.animate.paste()
  if (key === 'z' && !event.shiftKey) controller.editor.undo()
  else if ((key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey)) controller.editor.redo()
  else if (key === 's' && !event.shiftKey) controller.editor.saveJson()
  else return false
  return true
}

export function useKeyboardShortcuts(controller: InspectorController<ImageBitmap>): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (controller.gizmo.dragging || controller.mesh.dragging)) {
        controller.gizmo.cancel()
        controller.mesh.cancel()
        event.preventDefault()
        return
      }
      if (event.defaultPrevented || isEditable(event.target)) return
      const state = useInspectorStore.getState()
      if (state.exportOpen) return
      if (handleEditShortcut(controller, event)) {
        event.preventDefault()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape' && state.advancedOpen) {
        controller.setAdvancedOpen(false)
        event.preventDefault()
        return
      }
      switch (event.key) {
        case ' ':
          controller.togglePlay()
          break
        case 'ArrowRight':
          controller.step(event.shiftKey ? 10 : 1)
          break
        case 'ArrowLeft':
          controller.step(event.shiftKey ? -10 : -1)
          break
        case 'Home':
          controller.seek(0)
          break
        case 'l':
        case 'L':
          controller.setLoop(!state.loop)
          break
        case 'f':
        case 'F':
          controller.fitView()
          break
        case '0':
          controller.resetZoom()
          break
        case 'b':
        case 'B':
          controller.toggleDebug('bones')
          break
        case 's':
        case 'S':
          controller.toggleSetupMode()
          break
        case 'a':
        case 'A':
          controller.toggleAnimateMode()
          break
        case 'k':
        case 'K':
          if (!state.animateMode) return
          if (event.shiftKey) controller.animate.keyAll()
          else controller.animate.keySelected()
          break
        case 'Delete':
        case 'Backspace':
          if (state.animateMode && state.keySelection.length > 0) controller.animate.deleteSelected()
          else if (event.key !== 'Delete' || !controller.deleteSelection()) return
          break
        case 'w':
        case 'W':
          if (!state.setupMode && !state.animateMode) return
          controller.setGizmoMode('translate')
          break
        case 'e':
        case 'E':
          if (!state.setupMode && !state.animateMode) return
          controller.setGizmoMode('rotate')
          break
        case 'r':
        case 'R':
          if (!state.setupMode && !state.animateMode) return
          controller.setGizmoMode('scale')
          break
        default:
          return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [controller])
}
