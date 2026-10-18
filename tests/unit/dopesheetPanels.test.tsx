import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ControllerProvider } from '../../src/controller/ControllerContext'
import type { InspectorController } from '../../src/controller/InspectorController'
import { Dopesheet, FRAME_WIDTH } from '../../src/components/dopesheet/Dopesheet'
import { ViewportToolbar } from '../../src/components/stage/ViewportToolbar'
import { StageHud } from '../../src/components/stage/StageHud'
import { PropertiesPanel } from '../../src/components/properties/PropertiesPanel'
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts'
import { useInspectorStore } from '../../src/store/inspectorStore'
import { useLiveStore } from '../../src/store/liveStore'
import { channelKeys } from '../../src/core/animation/keyCommands'
import { createHarness, type FakeHarness } from '../support/fakeEnvironment'

let harness: FakeHarness
const state = () => useInspectorStore.getState()
const frames = (bone: string, channel: string) => channelKeys(state().editor.document!, 'walk', bone, channel).map((key) => Math.round(key.time * 30))

function Shortcuts() {
  useKeyboardShortcuts(harness.controller as unknown as InspectorController<ImageBitmap>)
  return null
}

function mount(node: ReactNode) {
  return render(<ControllerProvider controller={harness.controller as unknown as InspectorController<ImageBitmap>}>{node}</ControllerProvider>)
}

const center = (frame: number) => frame * FRAME_WIDTH + FRAME_WIDTH / 2

beforeEach(async () => {
  harness = createHarness()
  await harness.controller.loadDemo()
  act(() => {
    harness.controller.selectAnimation('walk')
    harness.controller.setAnimateMode(true)
    harness.controller.select({ kind: 'bone', name: 'torso' })
  })
})

afterEach(() => cleanup())

describe('dopesheet', () => {
  it('lists bones and channels with keyframe diamonds', () => {
    mount(<Dopesheet />)
    expect(screen.getByTestId('dopesheet-animation').textContent).toBe('walk')
    expect(screen.getByTestId('dopesheet-row-torso')).toBeTruthy()
    expect(screen.getByTestId('dopesheet-row-torso:rotate').textContent).toContain('旋轉')
    expect(screen.getByTestId('key-torso:rotate-0')).toBeTruthy()
    expect(screen.getByTestId('key-torso:rotate-15')).toBeTruthy()
    fireEvent.click(screen.getByTestId('dopesheet-toggle-torso'))
    expect(screen.queryByTestId('dopesheet-row-torso:rotate')).toBeNull()
    fireEvent.click(screen.getByTestId('dopesheet-toggle-torso'))
    expect(screen.getByTestId('dopesheet-row-torso:rotate')).toBeTruthy()
  })

  it('selects keys by click, modifier click and bone summary', () => {
    mount(<Dopesheet />)
    const tracks = screen.getByTestId('dopesheet-tracks')
    fireEvent.pointerDown(screen.getByTestId('key-torso:rotate-15'), { button: 0, pointerId: 1, clientX: center(15), clientY: 5 })
    fireEvent.pointerUp(tracks, { pointerId: 1, clientX: center(15) })
    expect(state().keySelection).toEqual(['torso::rotate::1'])
    expect(screen.getByTestId('key-torso:rotate-15').getAttribute('data-selected')).toBe('true')
    fireEvent.pointerDown(screen.getByTestId('key-torso:rotate-30'), { button: 0, pointerId: 2, ctrlKey: true, clientX: center(30) })
    fireEvent.pointerUp(tracks, { pointerId: 2, clientX: center(30) })
    expect(state().keySelection).toEqual(['torso::rotate::1', 'torso::rotate::2'])
    fireEvent.pointerDown(screen.getByTestId('key-torso:rotate-30'), { button: 0, pointerId: 3, ctrlKey: true, clientX: center(30) })
    fireEvent.pointerUp(tracks, { pointerId: 3, clientX: center(30) })
    expect(state().keySelection).toEqual(['torso::rotate::1'])
    fireEvent.pointerDown(screen.getByTestId('key-torso-0'), { button: 0, pointerId: 4, shiftKey: true, clientX: center(0) })
    fireEvent.pointerUp(tracks, { pointerId: 4, clientX: center(0) })
    expect(state().keySelection).toEqual(['torso::rotate::1', 'torso::rotate::0'])
    expect(screen.getByTestId('key-selection-count').textContent).toBe('已選 2')
  })

  it('drags selected keys to a new frame as one history entry', () => {
    mount(<Dopesheet />)
    const tracks = screen.getByTestId('dopesheet-tracks')
    fireEvent.pointerDown(screen.getByTestId('key-torso:rotate-15'), { button: 0, pointerId: 1, clientX: center(15) })
    fireEvent.pointerMove(tracks, { pointerId: 1, clientX: center(15) + FRAME_WIDTH * 3 })
    expect(screen.getByTestId('key-torso:rotate-15').style.left).toBe(`${center(18)}px`)
    fireEvent.pointerUp(tracks, { pointerId: 1, clientX: center(18) })
    expect(frames('torso', 'rotate')).toEqual([0, 18, 30])
    expect(state().editor.undoLabel).toBe('移動 1 個關鍵影格')
    expect(state().keySelection).toEqual(['torso::rotate::1'])
  })

  it('box selects keys, clicks empty space to seek and scrubs the ruler', () => {
    mount(<Dopesheet />)
    const tracks = screen.getByTestId('dopesheet-tracks')
    fireEvent.pointerDown(tracks, { button: 0, pointerId: 1, clientX: center(10), clientY: 1 })
    fireEvent.pointerMove(tracks, { pointerId: 1, clientX: center(31), clientY: 200 })
    expect(screen.getByTestId('dopesheet-box')).toBeTruthy()
    fireEvent.pointerUp(tracks, { pointerId: 1, clientX: center(31), clientY: 200 })
    expect(state().keySelection.length).toBeGreaterThan(4)
    expect(state().keySelection.every((id) => !id.endsWith('::0'))).toBe(true)
    fireEvent.pointerDown(tracks, { button: 0, pointerId: 2, clientX: center(7), clientY: 400 })
    fireEvent.pointerUp(tracks, { pointerId: 2, clientX: center(7), clientY: 400 })
    expect(state().keySelection).toEqual([])
    expect(useLiveStore.getState().snapshot.frame).toBe(7)
    const ruler = screen.getByTestId('dopesheet-ruler')
    fireEvent.pointerDown(ruler, { button: 0, pointerId: 3, clientX: center(12) })
    fireEvent.pointerMove(ruler, { pointerId: 3, clientX: center(20) })
    fireEvent.pointerUp(ruler, { pointerId: 3 })
    expect(useLiveStore.getState().snapshot.frame).toBe(20)
    expect(screen.getByTestId('dopesheet-frame').textContent).toBe('第 20 格')
  })

  it('keys, copies, pastes and deletes from toolbar buttons', () => {
    mount(<Dopesheet />)
    act(() => harness.controller.seekFrame(5))
    fireEvent.click(screen.getByTestId('key-selected'))
    expect(frames('torso', 'translate')).toEqual([5])
    expect(screen.getByTestId('key-torso:translate-5')).toBeTruthy()
    expect((screen.getByTestId('keys-paste') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTestId('keys-copy'))
    act(() => harness.controller.seekFrame(9))
    fireEvent.click(screen.getByTestId('keys-paste'))
    expect(frames('torso', 'translate')).toEqual([5, 9])
    fireEvent.click(screen.getByTestId('keys-delete'))
    expect(frames('torso', 'translate')).toEqual([5])
    fireEvent.click(screen.getByTestId('autokey-toggle'))
    expect(state().autoKey).toBe(false)
    act(() => {
      harness.controller.animate.applyPose('torso', { rotation: 120 }, '旋轉骨骼 torso')
    })
    expect(screen.getByTestId('pending-pose').textContent).toContain('torso')
    fireEvent.click(screen.getByTestId('key-all'))
    expect(screen.queryByTestId('pending-pose')).toBeNull()
    expect(state().editor.undoLabel).toBe('K 幀：全部骨骼')
  })
})

describe('animate mode controls', () => {
  it('toggles modes from the toolbar and shows the hud badge', () => {
    act(() => harness.controller.setAnimateMode(false))
    mount(
      <>
        <ViewportToolbar />
        <StageHud />
      </>,
    )
    fireEvent.click(screen.getByTestId('animate-mode-toggle'))
    expect(state().animateMode).toBe(true)
    expect(screen.getByTestId('hud-animate').textContent).toBe('動畫模式・自動 K 幀')
    expect(screen.getByTestId('gizmo-mode-rotate')).toBeTruthy()
    fireEvent.click(screen.getByTestId('setup-mode-toggle'))
    expect(state()).toMatchObject({ animateMode: false, setupMode: true })
  })

  it('edits the current pose from the properties panel', () => {
    mount(<PropertiesPanel />)
    act(() => harness.controller.seekFrame(3))
    const field = screen.getByTestId('pose-bone-rotation') as HTMLInputElement
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: '45' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    fireEvent.blur(field)
    expect(frames('torso', 'rotate')).toContain(3)
    expect(harness.controller.instance!.skeleton.findBone('torso')!.rotation).toBeCloseTo(45, 3)
    expect(screen.getByTestId('pose-status').textContent).toBe('自動 K 幀：修改即寫入')
    fireEvent.click(screen.getByTestId('pose-key'))
    expect(frames('torso', 'scale')).toEqual([3])
  })

  it('handles keyframe keyboard shortcuts', () => {
    mount(<Shortcuts />)
    act(() => harness.controller.seekFrame(4))
    fireEvent.keyDown(window, { key: 'k' })
    expect(frames('torso', 'scale')).toEqual([4])
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
    expect(state().keyClipboard).toBe(3)
    act(() => harness.controller.seekFrame(8))
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })
    expect(frames('torso', 'scale')).toEqual([4, 8])
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(frames('torso', 'scale')).toEqual([4])
    fireEvent.keyDown(window, { key: 'K', shiftKey: true })
    expect(state().editor.undoLabel).toBe('K 幀：全部骨骼')
    fireEvent.keyDown(window, { key: 'a' })
    expect(state().animateMode).toBe(false)
    fireEvent.keyDown(window, { key: 'k' })
    fireEvent.keyDown(window, { key: 'A' })
    expect(state().animateMode).toBe(true)
    act(() => harness.controller.animate.selectKeys([]))
    act(() => harness.controller.select({ kind: 'slot', name: 'helmet' }))
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(state().asset!.slots.map((slot) => slot.name)).toContain('helmet')
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(state().asset!.slots.map((slot) => slot.name)).not.toContain('helmet')
    expect(state().editor.undoLabel).toBe('刪除插槽 helmet')
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(state().editor.undoLabel).toBe('刪除插槽 helmet')
  })
})
