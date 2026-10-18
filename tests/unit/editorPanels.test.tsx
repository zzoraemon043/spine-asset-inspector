import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ControllerProvider } from '../../src/controller/ControllerContext'
import type { InspectorController } from '../../src/controller/InspectorController'
import { PropertiesPanel } from '../../src/components/properties/PropertiesPanel'
import { HistoryPanel } from '../../src/components/panels/HistoryPanel'
import { TopBar } from '../../src/components/layout/TopBar'
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts'
import { useUnsavedGuard } from '../../src/hooks/useUnsavedGuard'
import { useInspectorStore } from '../../src/store/inspectorStore'
import { createHarness, type FakeHarness } from '../support/fakeEnvironment'

let harness: FakeHarness
const state = () => useInspectorStore.getState()

function Hooks() {
  useKeyboardShortcuts(harness.controller as unknown as InspectorController<ImageBitmap>)
  useUnsavedGuard()
  return null
}

function mount(node: ReactNode) {
  return render(<ControllerProvider controller={harness.controller as unknown as InspectorController<ImageBitmap>}>{node}</ControllerProvider>)
}

function commit(testId: string, value: string) {
  const input = screen.getByTestId(testId)
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value } })
  fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.blur(input)
}

beforeEach(async () => {
  harness = createHarness()
  await harness.controller.loadDemo()
})

afterEach(() => cleanup())

describe('editing interface', () => {
  it('edits bone setup values and names from the properties panel', () => {
    act(() => harness.controller.select({ kind: 'bone', name: 'head' }))
    mount(<PropertiesPanel />)
    commit('edit-bone-rotation', '30')
    expect(harness.controller.instance!.data.findBone('head')!.rotation).toBe(30)
    expect((screen.getByTestId('edit-bone-rotation') as HTMLInputElement).value).toBe('30')
    const x = (screen.getByTestId('edit-bone-x') as HTMLInputElement).value
    commit('edit-bone-x', 'abc')
    expect((screen.getByTestId('edit-bone-x') as HTMLInputElement).value).toBe(x)
    expect(state().editor.entries).toHaveLength(1)
    commit('edit-bone-name', 'skull')
    expect(state().selection).toEqual({ kind: 'bone', name: 'skull' })
    expect(screen.getByTestId('properties-title').textContent).toBe('skull')
    commit('edit-bone-name', 'torso')
    expect((screen.getByTestId('edit-bone-name') as HTMLInputElement).value).toBe('skull')
    expect(state().notices.at(-1)?.text).toBe('骨骼名稱已存在：torso')
  })

  it('cancels a pending value with Escape', () => {
    act(() => harness.controller.select({ kind: 'bone', name: 'head' }))
    mount(<PropertiesPanel />)
    const input = screen.getByTestId('edit-bone-y') as HTMLInputElement
    const before = input.value
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)
    expect(input.value).toBe(before)
    expect(state().editor.canUndo).toBe(false)
  })

  it('edits slots, animations, events and the skeleton', () => {
    act(() => harness.controller.select({ kind: 'slot', name: 'head' }))
    const view = mount(<PropertiesPanel />)
    commit('edit-slot-color', 'ff0000ff')
    expect(harness.controller.instance!.data.findSlot('head')!.color.g).toBe(0)
    fireEvent.change(screen.getByTestId('edit-slot-blend'), { target: { value: 'screen' } })
    fireEvent.change(screen.getByTestId('edit-slot-setup-attachment'), { target: { value: '__none__' } })
    expect(harness.controller.instance!.data.findSlot('head')!.attachmentName).toBeNull()
    act(() => harness.controller.select({ kind: 'animation', name: 'walk' }))
    view.rerender(<ControllerProvider controller={harness.controller as unknown as InspectorController<ImageBitmap>}><PropertiesPanel /></ControllerProvider>)
    fireEvent.click(screen.getByTestId('animation-duplicate'))
    expect(state().asset!.animations.map((item) => item.name)).toContain('walk 複本')
    commit('edit-animation-name', 'stroll')
    expect(state().selection).toEqual({ kind: 'animation', name: 'stroll' })
    fireEvent.click(screen.getByTestId('animation-delete'))
    expect(state().asset!.animations.map((item) => item.name)).not.toContain('stroll')
    act(() => harness.controller.select({ kind: 'event', name: 'hit' }))
    commit('edit-event-int', '4')
    commit('edit-event-string', 'boom')
    expect(state().asset!.events.find((item) => item.name === 'hit')).toMatchObject({ intValue: 4, stringValue: 'boom' })
    commit('edit-event-name', 'impact')
    expect(state().selection).toEqual({ kind: 'event', name: 'impact' })
    act(() => harness.controller.select({ kind: 'skeleton', name: 'inspector-demo' }))
    commit('edit-skeleton-fps', '24')
    expect(state().asset!.fps).toBe(24)
    expect(screen.getByTestId('edit-status').textContent).toBe('有未儲存的變更')
    fireEvent.click(screen.getByTestId('edit-save-json'))
    expect(harness.saved.at(-1)?.fileName).toBe('inspector-demo.json')
    expect(screen.getByTestId('edit-status').textContent).toBe('與檔案一致')
  })

  it('shows read-only properties with the reason when editing is unavailable', () => {
    act(() => harness.controller.editor.onAssetLoaded(null, '此格式僅供檢視'))
    act(() => harness.controller.select({ kind: 'bone', name: 'head' }))
    mount(<PropertiesPanel />)
    expect(screen.queryByTestId('edit-bone-x')).toBeNull()
    expect(screen.getByTestId('edit-disabled-reason').textContent).toBe('此格式僅供檢視')
    cleanup()
    mount(<HistoryPanel />)
    expect(screen.getByTestId('history-panel').textContent).toBe('此格式僅供檢視')
  })

  it('lists history steps and jumps between them', () => {
    act(() => {
      harness.controller.editor.setBoneField('head', 'x', 5)
      harness.runFrames(120)
      harness.controller.editor.setBoneField('head', 'y', 6)
    })
    mount(<HistoryPanel />)
    expect(screen.getByTestId('history-entry-0').textContent).toContain('開啟檔案')
    expect(screen.getByTestId('history-entry-2').getAttribute('aria-current')).toBe('step')
    fireEvent.click(screen.getByTestId('history-entry-0'))
    expect(state().editor.index).toBe(0)
    expect(screen.getByTestId('history-entry-0').getAttribute('aria-current')).toBe('step')
    expect(screen.getByTestId('history-entry-0').textContent).toContain('已儲存')
    fireEvent.click(screen.getByTestId('history-redo'))
    expect(state().editor.index).toBe(1)
    fireEvent.click(screen.getByTestId('history-undo'))
    expect(state().editor.index).toBe(0)
  })

  it('wires the top bar buttons and keyboard shortcuts', () => {
    mount(
      <>
        <TopBar />
        <Hooks />
      </>,
    )
    expect(screen.queryByTestId('edit-dirty')).toBeNull()
    expect((screen.getByTestId('edit-undo') as HTMLButtonElement).disabled).toBe(true)
    act(() => {
      harness.controller.editor.setBoneField('head', 'x', 5)
    })
    expect(screen.getByTestId('edit-dirty').textContent).toBe('未儲存變更')
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(state().editor.index).toBe(0)
    fireEvent.keyDown(window, { key: 'Z', ctrlKey: true, shiftKey: true })
    expect(state().editor.index).toBe(1)
    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    expect(state().editor.index).toBe(1)
    fireEvent.click(screen.getByTestId('edit-undo'))
    expect(state().editor.index).toBe(0)
    fireEvent.click(screen.getByTestId('edit-redo'))
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    expect(harness.saved.at(-1)?.fileName).toBe('inspector-demo.json')
    expect(screen.queryByTestId('edit-dirty')).toBeNull()
    fireEvent.click(screen.getByTestId('topbar-save-json'))
    expect(harness.saved.length).toBe(2)
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
  })
})
