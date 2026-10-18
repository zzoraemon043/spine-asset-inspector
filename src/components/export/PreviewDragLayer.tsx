import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useController } from '@/controller/ControllerContext'
import type { PreviewRect } from '@/controller/types'
import { handleCursor, moveCrop, RESIZE_HANDLES, resizeCrop, screenToWorld, type ResizeHandle } from '@/core/export/previewDrag'

type DragState = { readonly handle: ResizeHandle | null; readonly x: number; readonly y: number; readonly crop: PreviewRect }

const HANDLE_SIZE = 9
const BRACKET = 12

function handleStyle(handle: ResizeHandle): CSSProperties {
  const half = -Math.ceil(HANDLE_SIZE / 2)
  const style: CSSProperties = { width: HANDLE_SIZE, height: HANDLE_SIZE, cursor: handleCursor(handle) }
  if (handle.includes('n')) style.top = half
  else if (handle.includes('s')) style.bottom = half
  else style.top = `calc(50% + ${half}px)`
  if (handle.includes('w')) style.left = half
  else if (handle.includes('e')) style.right = half
  else style.left = `calc(50% + ${half}px)`
  return style
}

function bracketStyle(corner: 'nw' | 'ne' | 'sw' | 'se'): CSSProperties {
  const style: CSSProperties = { width: BRACKET, height: BRACKET, borderStyle: 'solid', borderWidth: 0 }
  if (corner.includes('n')) {
    style.top = -1
    style.borderTopWidth = 2
  } else {
    style.bottom = -1
    style.borderBottomWidth = 2
  }
  if (corner.includes('w')) {
    style.left = -1
    style.borderLeftWidth = 2
  } else {
    style.right = -1
    style.borderRightWidth = 2
  }
  return style
}

export interface PreviewDragLayerProps {
  readonly rect: PreviewRect
  readonly view: PreviewRect
  readonly viewScale: number
  readonly crop: PreviewRect
  readonly onReset: () => void
}

export function PreviewDragLayer({ rect, view, viewScale, crop, onReset }: PreviewDragLayerProps) {
  const controller = useController()
  const layerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | null>(null)

  const begin = (event: ReactPointerEvent, handle: ResizeHandle | null) => {
    if (event.button !== undefined && event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    layerRef.current?.setPointerCapture?.(event.pointerId)
    drag.current = { handle, x: event.clientX, y: event.clientY, crop }
    controller.exportPreview.lockView(view)
  }

  const onMove = (event: ReactPointerEvent) => {
    const state = drag.current
    if (!state) return
    const delta = screenToWorld(event.clientX - state.x, event.clientY - state.y, viewScale)
    const next = state.handle ? resizeCrop(state.crop, state.handle, delta.dx, delta.dy) : moveCrop(state.crop, delta.dx, delta.dy)
    controller.updateExportSettings({ sizeMode: 'crop', crop: next })
    void controller.exportPreview.request()
  }

  const onEnd = () => {
    if (!drag.current) return
    drag.current = null
    controller.exportPreview.lockView(null)
    void controller.exportPreview.request()
  }

  return (
    <div
      ref={layerRef}
      className="absolute cursor-move touch-none border border-white/70"
      style={{ left: rect.x, top: rect.y, width: Math.max(1, rect.width), height: Math.max(1, rect.height) }}
      onPointerDown={(event) => begin(event, null)}
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      onDoubleClick={onReset}
      title="拖曳移動裁剪範圍，雙擊重設為角色範圍；拖曳邊框或角落調整裁剪範圍"
      data-testid="export-preview-drag"
    >
      {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
        <span key={corner} className="pointer-events-none absolute border-signal-amber" style={bracketStyle(corner)} />
      ))}
      {RESIZE_HANDLES.map((handle) => (
        <span
          key={handle}
          className="absolute rounded-[2px] border border-accent-300 bg-ink-950 opacity-80 hover:bg-accent-400 hover:opacity-100"
          style={handleStyle(handle)}
          onPointerDown={(event) => begin(event, handle)}
          data-testid={`export-preview-handle-${handle}`}
        />
      ))}
    </div>
  )
}
