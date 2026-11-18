import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import { demoSource } from '../support/fakeTexture'

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
  it.each(['取消', '捨棄變更', '儲存 JSON 後切換'])('guards dirty skeleton switches with %s', async (choice) => {
    const original = window.HTMLDialogElement.prototype.showModal
    window.HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true })
    return verifySwitch(choice).finally(() => { window.HTMLDialogElement.prototype.showModal = original })
  })

  async function verifySwitch(choice: string) {
    const first = 'first.json'
    const second = 'second.json'
    harness = createHarness({
      createLocalSource: async (_files, preferred) => {
        const source = demoSource()
        return { ...source, origin: 'local', skeletonCandidates: [first, second], skeleton: { ...source.skeleton, fileName: preferred ?? first } }
      },
    })
    const { controller } = harness
    await controller.loadFiles([])
    expect(controller.editor.setBoneField('head', 'x', 123)).toBe(true)
    mount(<PropertiesPanel />)

    fireEvent.change(screen.getByTestId('skeleton-select'), { target: { value: second } })
    expect(screen.getByRole('dialog', { name: '切換骨架' })).toBeTruthy()
    expect(state().asset?.fileName).toBe(first)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: choice })))

    if (choice === '取消') {
      expect(state().asset?.fileName).toBe(first)
      expect(state().editor).toMatchObject({ dirty: true, canUndo: true })
      expect(controller.instance?.data.findBone('head')?.x).toBe(123)
    } else {
      await waitFor(() => expect(state().asset?.fileName).toBe(second))
      expect(state().editor).toMatchObject({ dirty: false, canUndo: false })
      expect(controller.instance?.data.findBone('head')?.x).not.toBe(123)
    }
    if (choice === '儲存 JSON 後切換') {
      expect(harness.saved).toHaveLength(1)
      const json = JSON.parse(new TextDecoder().decode(await harness.saved[0].blob.arrayBuffer()))
      expect(json.bones.find((bone: { name: string }) => bone.name === 'head').x).toBe(123)
    } else expect(harness.saved).toHaveLength(0)
  }

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

  it('saves with Ctrl+S while an edit field has focus and keeps the typed value', () => {
    act(() => harness.controller.select({ kind: 'bone', name: 'head' }))
    mount(
      <>
        <PropertiesPanel />
        <Hooks />
      </>,
    )
    const input = screen.getByTestId('edit-bone-rotation')
    input.focus()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '45' } })
    const event = createEvent.keyDown(input, { key: 's', ctrlKey: true })
    fireEvent(input, event)
    expect(event.defaultPrevented).toBe(true)
    expect(harness.saved).toHaveLength(1)
    expect(harness.controller.instance!.data.findBone('head')!.rotation).toBe(45)
  })

  it('lets Space press a focused button instead of toggling playback', () => {
    mount(
      <>
        <TopBar />
        <Hooks />
      </>,
    )
    const playing = state().playing
    const button = screen.getByTestId('topbar-save-json')
    const event = createEvent.keyDown(button, { key: ' ' })
    fireEvent(button, event)
    expect(event.defaultPrevented).toBe(false)
    expect(state().playing).toBe(playing)
    fireEvent.keyDown(document.body, { key: ' ' })
    expect(state().playing).toBe(!playing)
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
