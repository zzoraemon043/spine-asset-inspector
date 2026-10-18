import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ControllerProvider } from '../../src/controller/ControllerContext'
import type { InspectorController } from '../../src/controller/InspectorController'
import { ViewportToolbar } from '../../src/components/stage/ViewportToolbar'
import { StageHud } from '../../src/components/stage/StageHud'
import { PropertiesPanel } from '../../src/components/properties/PropertiesPanel'
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts'
import { useInspectorStore } from '../../src/store/inspectorStore'
import { useLiveStore } from '../../src/store/liveStore'
import { worldToScreen } from '../../src/core/render/camera'
import { createHarness, type FakeHarness } from '../support/fakeEnvironment'

let harness: FakeHarness
const state = () => useInspectorStore.getState()

function Shortcuts() {
  useKeyboardShortcuts(harness.controller as unknown as InspectorController<ImageBitmap>)
  return null
}

function mount(node: ReactNode) {
  return render(<ControllerProvider controller={harness.controller as unknown as InspectorController<ImageBitmap>}>{node}</ControllerProvider>)
}

beforeEach(async () => {
  harness = createHarness()
  await harness.controller.loadDemo()
})

afterEach(() => cleanup())

describe('setup mode interface', () => {
  it('toggles setup mode and gizmo tools from the viewport toolbar', () => {
    mount(<ViewportToolbar />)
    expect(screen.queryByTestId('gizmo-mode-rotate')).toBeNull()
    fireEvent.click(screen.getByTestId('setup-mode-toggle'))
    expect(state().setupMode).toBe(true)
    expect(screen.getByTestId('setup-mode-toggle').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByTestId('gizmo-mode-rotate'))
    expect(state().gizmoMode).toBe('rotate')
    fireEvent.click(screen.getByTestId('gizmo-mode-scale'))
    expect(state().gizmoMode).toBe('scale')
    fireEvent.click(screen.getByTestId('gizmo-snap'))
    expect(state().gizmoSnap).toBe(true)
    fireEvent.click(screen.getByTestId('setup-mode-toggle'))
    expect(state().setupMode).toBe(false)
  })

  it('disables the toggle for read-only assets', () => {
    act(() => harness.controller.editor.onAssetLoaded(null, '僅供檢視'))
    mount(<ViewportToolbar />)
    const toggle = screen.getByTestId('setup-mode-toggle') as HTMLButtonElement
    expect(toggle.disabled).toBe(true)
    expect(toggle.title).toBe('僅供檢視')
  })

  it('switches modes and cancels drags from the keyboard', () => {
    mount(<Shortcuts />)
    fireEvent.keyDown(window, { key: 'e' })
    expect(state().gizmoMode).toBe('translate')
    fireEvent.keyDown(window, { key: 's' })
    expect(state().setupMode).toBe(true)
    fireEvent.keyDown(window, { key: 'e' })
    expect(state().gizmoMode).toBe('rotate')
    fireEvent.keyDown(window, { key: 'R' })
    expect(state().gizmoMode).toBe('scale')
    fireEvent.keyDown(window, { key: 'w' })
    expect(state().gizmoMode).toBe('translate')
    act(() => {
      harness.controller.select({ kind: 'bone', name: 'torso' })
      harness.runFrames(1)
    })
    const origin = useLiveStore.getState().gizmo!.origin
    act(() => {
      harness.controller.gizmo.begin(origin[0], origin[1])
      harness.controller.gizmo.move(origin[0] + 40, origin[1])
    })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(harness.controller.gizmo.dragging).toBe(false)
    expect(state().editor.entries).toHaveLength(0)
    fireEvent.keyDown(window, { key: 'S' })
    expect(state().setupMode).toBe(false)
  })

  it('shows live drag values in the hud and the properties panel', () => {
    act(() => {
      harness.controller.setSetupMode(true)
      harness.controller.select({ kind: 'bone', name: 'torso' })
      harness.runFrames(1)
    })
    mount(
      <>
        <StageHud />
        <PropertiesPanel />
      </>,
    )
    expect(screen.getByTestId('hud-setup').textContent).toContain('拖曳控制軸調整 torso')
    const x = (screen.getByTestId('edit-bone-x') as HTMLInputElement).value
    const bone = harness.controller.instance!.skeleton.findBone('torso')!
    const start = worldToScreen(harness.stage.getView(), harness.stage.viewport, bone.worldX, bone.worldY)
    act(() => {
      harness.controller.gizmo.begin(start.x, start.y)
      harness.controller.gizmo.move(start.x + 25, start.y)
    })
    expect(screen.getByTestId('hud-gizmo-preview').textContent).toContain('位置 X')
    expect((screen.getByTestId('edit-bone-x') as HTMLInputElement).value).not.toBe(x)
    expect(screen.getByText('設置姿勢（拖曳中）')).toBeTruthy()
    const live = (screen.getByTestId('edit-bone-x') as HTMLInputElement).value
    act(() => {
      harness.controller.gizmo.end()
    })
    expect((screen.getByTestId('edit-bone-x') as HTMLInputElement).value).toBe(live)
    expect(screen.queryByTestId('hud-gizmo-preview')).toBeNull()
    expect(state().editor.undoLabel).toBe('移動骨骼 torso')
  })
})
