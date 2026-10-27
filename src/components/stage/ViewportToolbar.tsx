import { Clapperboard, Crosshair, Magnet, Maximize2, Move, PencilRuler, RotateCw, Scaling, Scan, ZoomIn, ZoomOut } from 'lucide-react'
import { GIZMO_MODE_LABEL, GIZMO_MODES, type GizmoMode } from '@/core/gizmo/types'
import { Button } from '../ui/Button'
import { useController } from '@/controller/ControllerContext'
import { useInspectorStore } from '@/store/inspectorStore'
import { BACKGROUND_MODES, type BackgroundMode } from '@/store/defaults'
import { IconButton } from '../ui/Button'
import { cx } from '../ui/cx'

const SWATCH: Record<BackgroundMode, string> = {
  checker: 'stage-checker',
  dark: 'stage-dark',
  light: 'stage-light',
  chroma: 'stage-chroma',
}

const BACKGROUND_LABEL: Record<BackgroundMode, string> = {
  checker: '透明棋盤格',
  dark: '深色背景',
  light: '淺色背景',
  chroma: '綠幕背景',
}

export function ViewportToolbar() {
  const controller = useController()
  const background = useInspectorStore((state) => state.background)
  const showAxes = useInspectorStore((state) => state.showAxes)
  const debug = useInspectorStore((state) => state.debug)
  const setupMode = useInspectorStore((state) => state.setupMode)
  const animateMode = useInspectorStore((state) => state.animateMode)
  const gizmoMode = useInspectorStore((state) => state.gizmoMode)
  const snap = useInspectorStore((state) => state.gizmoSnap)
  const editable = useInspectorStore((state) => state.editor.enabled)
  const reason = useInspectorStore((state) => state.editor.reason)
  const modeIcon: Record<GizmoMode, typeof Move> = { translate: Move, rotate: RotateCw, scale: Scaling }
  const modeKey: Record<GizmoMode, string> = { translate: 'W', rotate: 'E', scale: 'R' }
  return (
    <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1 rounded border border-ink-700 bg-ink-900/90 p-1 shadow-lg backdrop-blur" data-testid="viewport-toolbar">
      <Button
        size="xs"
        variant={setupMode ? 'active' : 'default'}
        icon={<PencilRuler size={13} />}
        disabled={!editable}
        onClick={() => controller.toggleSetupMode()}
        testId="setup-mode-toggle"
        aria-pressed={setupMode}
        title={editable ? '設置模式：停止動畫並在畫面上拖曳骨骼 (S)' : reason ?? '目前的資產無法編輯'}
      >
        設置模式
      </Button>
      <Button
        size="xs"
        variant={animateMode ? 'active' : 'default'}
        icon={<Clapperboard size={13} />}
        disabled={!editable}
        onClick={() => controller.toggleAnimateMode()}
        testId="animate-mode-toggle"
        aria-pressed={animateMode}
        title={editable ? '動畫模式：在目前影格為骨骼設定關鍵影格，並開啟律動表 (A)' : reason ?? '目前的資產無法編輯'}
      >
        動畫模式
      </Button>
      {(setupMode || animateMode) && (
        <>
          {GIZMO_MODES.map((mode) => {
            const Icon = modeIcon[mode]
            return (
              <IconButton key={mode} size="xs" label={`${GIZMO_MODE_LABEL[mode]} (${modeKey[mode]})`} active={gizmoMode === mode} icon={<Icon size={13} />} onClick={() => controller.setGizmoMode(mode)} testId={`gizmo-mode-${mode}`} />
            )
          })}
          <IconButton size="xs" label="吸附：位移取整數、旋轉每 15 度、縮放每 0.1（拖曳時按住 Shift 可暫時切換）" active={snap} icon={<Magnet size={13} />} onClick={() => controller.toggleGizmoSnap()} testId="gizmo-snap" />
        </>
      )}
      <div className="mx-1 h-4 w-px bg-ink-700" />
      <IconButton size="xs" label="放大" icon={<ZoomIn size={13} />} onClick={() => controller.zoomBy(1.25)} testId="zoom-in" />
      <IconButton size="xs" label="縮小" icon={<ZoomOut size={13} />} onClick={() => controller.zoomBy(0.8)} testId="zoom-out" />
      <IconButton size="xs" label="視角適配 (F)" icon={<Maximize2 size={13} />} onClick={() => controller.fitView()} testId="fit-view" />
      <IconButton size="xs" label="縮放 100% (0)" icon={<Scan size={13} />} onClick={() => controller.resetZoom()} testId="reset-zoom" />
      <IconButton size="xs" label="原點座標軸" active={showAxes} icon={<Crosshair size={13} />} onClick={() => controller.toggleAxes()} testId="toggle-axes" />
      <div className="mx-1 h-4 w-px bg-ink-700" />
      <Button size="xs" variant={debug.bones ? 'active' : 'ghost'} onClick={() => controller.toggleDebug('bones')} testId="quick-bones" title="顯示骨骼 (B)">
        骨骼
      </Button>
      <Button size="xs" variant={debug.meshTriangles ? 'active' : 'ghost'} onClick={() => controller.toggleDebug('meshTriangles')} testId="quick-mesh">
        網格
      </Button>
      <Button size="xs" variant={debug.boundingBoxes ? 'active' : 'ghost'} onClick={() => controller.toggleDebug('boundingBoxes')} testId="quick-bbox">
        碰撞框
      </Button>
      <div className="mx-1 h-4 w-px bg-ink-700" />
      {BACKGROUND_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          title={BACKGROUND_LABEL[mode]}
          aria-label={BACKGROUND_LABEL[mode]}
          aria-pressed={background === mode}
          data-testid={`background-${mode}`}
          onClick={() => controller.setBackground(mode)}
          className={cx('h-4 w-4 rounded-sm border', SWATCH[mode], background === mode ? 'border-accent-400 ring-1 ring-accent-500/60' : 'border-ink-500')}
        />
      ))}
    </div>
  )
}
