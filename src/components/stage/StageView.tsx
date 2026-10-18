import { useEffect, useRef, useState, type DragEvent, type PointerEvent, type WheelEvent } from 'react'
import { useController } from '@/controller/ControllerContext'
import { StageRenderer } from '@/core/render/StageRenderer'
import { collectDropped } from '@/core/assets/browserFiles'
import { isAudioFile, isTextureFile } from '@/core/assets/fileClassifier'
import { useInspectorStore } from '@/store/inspectorStore'
import { useLiveStore } from '@/store/liveStore'
import type { GizmoHandle } from '@/core/gizmo/types'
import { cx } from '../ui/cx'
import { ViewportToolbar } from './ViewportToolbar'
import { StageHud } from './StageHud'

interface DragState {
  readonly pointerId: number
  readonly kind: 'pan' | 'gizmo' | 'mesh'
  readonly startX: number
  readonly startY: number
  x: number
  y: number
  moved: boolean
}

const CLICK_SLOP = 4

const HANDLE_CURSOR: Record<GizmoHandle, string> = {
  move: 'move',
  'move-x': 'ew-resize',
  'move-y': 'ns-resize',
  rotate: 'crosshair',
  scale: 'nwse-resize',
  'scale-x': 'ew-resize',
  'scale-y': 'ns-resize',
}

export function StageView() {
  const controller = useController()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [stageError, setStageError] = useState<string | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const background = useInspectorStore((state) => state.background)
  const status = useInspectorStore((state) => state.status)
  const error = useInspectorStore((state) => state.error)
  const hasAsset = useInspectorStore((state) => state.asset !== null)
  const setupMode = useInspectorStore((state) => state.setupMode || state.animateMode)
  const animateMode = useInspectorStore((state) => state.animateMode)
  const hover = useLiveStore((state) => state.gizmoHover)
  const gizmo = useLiveStore((state) => state.gizmo)
  const meshScreen = useLiveStore((state) => state.meshScreen)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let renderer: StageRenderer
    try {
      renderer = new StageRenderer(canvas)
    } catch (failure) {
      setStageError(failure instanceof Error ? failure.message : String(failure))
      return
    }
    renderer.syncSize()
    controller.attachStage(renderer)
    if (!controller.instance) void controller.loadDemo()
    return () => controller.detachStage()
  }, [controller])

  const ratio = () => {
    const canvas = canvasRef.current
    return canvas && canvas.clientWidth > 0 ? canvas.width / canvas.clientWidth : 1
  }

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.button !== 1) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const offsetX = event.nativeEvent.offsetX
    const offsetY = event.nativeEvent.offsetY
    const kind = event.button !== 0 ? 'pan' : controller.mesh.begin(offsetX, offsetY, event.shiftKey) ? 'mesh' : controller.gizmo.begin(offsetX, offsetY) ? 'gizmo' : 'pan'
    dragRef.current = { pointerId: event.pointerId, kind, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false }
  }

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const r = ratio()
    const offsetX = event.nativeEvent.offsetX
    const offsetY = event.nativeEvent.offsetY
    controller.updatePointer(offsetX * r, offsetY * r)
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      controller.gizmo.hoverAt(offsetX, offsetY)
      return
    }
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > CLICK_SLOP) drag.moved = true
    if (drag.kind === 'mesh') controller.mesh.move(offsetX, offsetY)
    else if (drag.kind === 'gizmo') controller.gizmo.move(offsetX, offsetY, event.shiftKey)
    else controller.panBy((event.clientX - drag.x) * r, (event.clientY - drag.y) * r)
    drag.x = event.clientX
    drag.y = event.clientY
  }

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (drag?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (drag.kind === 'mesh') {
      controller.mesh.end()
      return
    }
    if (drag.kind === 'gizmo') {
      controller.gizmo.end()
      return
    }
    if (!drag.moved && event.button === 0 && controller.mesh.target()) {
      if (!event.shiftKey) controller.mesh.clearSelection()
      return
    }
    if (!drag.moved && event.button === 0 && (useInspectorStore.getState().setupMode || useInspectorStore.getState().animateMode)) controller.gizmo.pick(event.nativeEvent.offsetX, event.nativeEvent.offsetY)
  }

  const onPointerCancel = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (drag?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (drag.kind === 'gizmo') controller.gizmo.cancel()
    if (drag.kind === 'mesh') controller.mesh.cancel()
  }

  const onWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    const r = ratio()
    const factor = Math.exp(-event.deltaY * 0.0015)
    controller.zoomBy(factor, event.nativeEvent.offsetX * r, event.nativeEvent.offsetY * r)
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDropActive(true)
  }

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDropActive(false)
    try {
      const files = await collectDropped(event.dataTransfer)
      const audio = files.filter(isAudioFile)
      const rest = files.filter((file) => !isAudioFile(file))
      if (audio.length > 0) await controller.audio.loadFiles(audio)
      const region = useInspectorStore.getState().selectedRegion
      if (rest.length === 1 && isTextureFile(rest[0]) && region) await controller.atlas.replaceRegionImage(region, rest[0])
      else if (rest.length > 0) await controller.loadFiles(rest)
    } catch (failure) {
      useInspectorStore.setState({ error: failure instanceof Error ? failure.message : String(failure) })
    }
  }

  return (
    <div
      className={cx('relative min-h-0 flex-1 overflow-hidden', `stage-${background}`)}
      data-testid="stage"
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDropActive(false)
      }}
      onDrop={(event) => void onDrop(event)}
    >
      <canvas
        ref={canvasRef}
        data-testid="stage-canvas"
        className={cx('absolute inset-0 h-full w-full touch-none', !hover && (setupMode ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'))}
        style={hover ? { cursor: HANDLE_CURSOR[hover] } : undefined}
        data-setup-mode={setupMode && !animateMode ? 'on' : 'off'}
        data-animate-mode={animateMode ? 'on' : 'off'}
        data-gizmo-bone={gizmo?.bone}
        data-gizmo-mode={gizmo?.mode}
        data-gizmo-origin={gizmo ? gizmo.origin.join(',') : undefined}
        data-gizmo-tip={gizmo ? gizmo.tip.join(',') : undefined}
        data-gizmo-handles={gizmo ? JSON.stringify(gizmo.handles) : undefined}
        data-mesh-vertices={meshScreen ? JSON.stringify(meshScreen) : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => controller.updatePointer(null, null)}
        onWheel={onWheel}
        onDoubleClick={() => controller.fitView()}
      />
      <ViewportToolbar />
      <StageHud />
      {dropActive && (
        <div className="pointer-events-none absolute inset-3 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-accent-500/70 bg-ink-950/80" data-testid="drop-overlay">
          <span className="text-base font-semibold text-accent-400">放開以載入</span>
          <span className="text-xs text-ink-300">.json / .skel + .atlas + .png，或整包 .zip、資料夾；音效檔加入音訊對齊；選取 Region 後拖入單張 PNG 即熱替換</span>
        </div>
      )}
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink-950/50">
          <span className="font-mono text-xs tracking-[0.3em] text-accent-400" data-testid="loading-indicator">讀取資產中</span>
        </div>
      )}
      {(stageError || (!hasAsset && status === 'error' && error)) && (
        <div className="absolute inset-x-6 bottom-6 rounded border border-signal-red/50 bg-ink-950/90 px-4 py-3 text-xs text-signal-red" data-testid="stage-error">
          <span className="mr-2 font-bold">錯誤</span>
          {stageError ?? error}
        </div>
      )}
    </div>
  )
}
