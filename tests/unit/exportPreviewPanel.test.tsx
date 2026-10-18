import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ControllerProvider } from '../../src/controller/ControllerContext'
import type { InspectorController } from '../../src/controller/InspectorController'
import { ExportDialog } from '../../src/components/export/ExportDialog'
import { useInspectorStore } from '../../src/store/inspectorStore'
import { useLiveStore } from '../../src/store/liveStore'
import { createHarness, type FakeHarness } from '../support/fakeEnvironment'

let harness: FakeHarness
const state = () => useInspectorStore.getState()

function mount() {
  return render(
    <ControllerProvider controller={harness.controller as unknown as InspectorController<ImageBitmap>}>
      <ExportDialog />
    </ControllerProvider>,
  )
}

beforeEach(async () => {
  harness = createHarness()
  await harness.controller.loadDemo()
})

afterEach(() => cleanup())

describe('export dialog preview', () => {
  it('shows a live preview with frame scrubbing, guide lines and overflow warnings', async () => {
    act(() => harness.controller.setExportOpen(true, 'walk'))
    mount()
    fireEvent.click(screen.getByTestId('export-size-fixed'))
    fireEvent.change(screen.getByTestId('export-width'), { target: { value: '200' } })
    fireEvent.change(screen.getByTestId('export-height'), { target: { value: '400' } })
    await waitFor(() => expect(screen.getByTestId('export-preview-size').textContent).toMatch(/^200x400 像素，預覽 \d+%$/))
    const result = useLiveStore.getState().exportPreview!
    expect(screen.getByTestId('export-preview-frame-box').style.width).toBe(`${result.image.width}px`)
    expect(Number(screen.getByTestId('export-preview-border').getAttribute('width'))).toBeCloseTo(result.frameRect.width, 3)
    expect(Number(screen.getByTestId('export-preview-content').getAttribute('width'))).toBeCloseTo(100 * result.viewScale, 3)
    expect(screen.getByTestId('export-preview-mask').getAttribute('fill-rule')).toBe('evenodd')
    expect(screen.getByTestId('export-preview-padding')).toBeTruthy()
    expect(screen.getByTestId('export-preview-content-status').textContent).toBe('整段動作都在畫布內，不會被裁切')
    expect(screen.getByTestId('export-preview-frame-label').textContent).toBe('第 0 格（1 / 10）')
    await act(async () => {
      fireEvent.change(screen.getByTestId('export-preview-frame'), { target: { value: '9' } })
      await harness.controller.exportPreview.request()
    })
    expect(screen.getByTestId('export-preview-frame-label').textContent).toBe('第 9 格（10 / 10）')
    expect(screen.getByTestId('export-preview-pose-status').textContent).toBe('此影格完整顯示')
    fireEvent.change(screen.getByTestId('export-padding'), { target: { value: '20' } })
    await waitFor(() => expect(useLiveStore.getState().exportPreview!.frameWorld.width).toBeGreaterThan(0))
    fireEvent.change(screen.getByTestId('export-offset-x'), { target: { value: '120' } })
    await waitFor(() => expect(screen.getByTestId('export-preview-content-status').textContent).toContain('超出畫布'))
    expect(screen.getByTestId('export-preview-pose-status').textContent).toContain('此影格超出畫布')
    fireEvent.click(screen.getByTestId('export-align-bottom'))
    fireEvent.change(screen.getByTestId('export-offset-y'), { target: { value: '-5' } })
    expect(state().exportSettings).toMatchObject({ align: 'bottom', offsetX: 120, offsetY: -5 })
    fireEvent.click(screen.getByTestId('export-align-center'))
    expect(state().exportSettings.align).toBe('center')
    fireEvent.click(screen.getByTestId('export-format-frame'))
    await waitFor(() => expect(screen.queryByTestId('export-preview-frame')).toBeNull())
    expect(screen.queryByTestId('export-preview-pose')).toBeNull()
    fireEvent.click(screen.getByTestId('export-close'))
    expect(state().exportPreview.status).toBe('idle')
  })

  it('crops by dragging single edges and moving the frame without resizing the character', async () => {
    act(() => harness.controller.setExportOpen(true, 'walk'))
    mount()
    await waitFor(() => expect(useLiveStore.getState().exportPreview).not.toBeNull())
    const before = useLiveStore.getState().exportPreview!
    const contentWidth = before.content.width
    const layer = screen.getByTestId('export-preview-drag')
    expect(layer.style.left).toBe(`${before.frameRect.x}px`)
    const scale = before.viewScale
    fireEvent.pointerDown(screen.getByTestId('export-preview-handle-e'), { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(layer, { pointerId: 1, clientX: 100 + 20 * scale, clientY: 140 })
    const world = before.frameWorld
    expect(state().exportSettings.sizeMode).toBe('crop')
    expect(state().exportSettings.crop).toEqual({ x: Math.round(world.x), y: Math.round(world.y), width: Math.round(world.x + world.width + 20) - Math.round(world.x), height: Math.round(world.y + world.height) - Math.round(world.y) })
    await act(async () => {
      await harness.controller.exportPreview.request()
    })
    expect(useLiveStore.getState().exportPreview!.view).toEqual(before.view)
    fireEvent.pointerUp(layer, { pointerId: 1 })
    await act(async () => {
      await harness.controller.exportPreview.request()
    })
    expect(useLiveStore.getState().exportPreview!.content.width).toBeCloseTo(contentWidth * (useLiveStore.getState().exportPreview!.viewScale / scale), 3)
    expect(screen.getByTestId('export-crop-width')).toBeTruthy()
    expect(screen.queryByTestId('export-offset-x')).toBeNull()
    expect(screen.queryByTestId('export-padding')).toBeNull()
    fireEvent.change(screen.getByTestId('export-crop-x'), { target: { value: '0' } })
    fireEvent.change(screen.getByTestId('export-crop-y'), { target: { value: '0' } })
    fireEvent.change(screen.getByTestId('export-crop-width'), { target: { value: '40' } })
    fireEvent.change(screen.getByTestId('export-crop-height'), { target: { value: '30' } })
    fireEvent.change(screen.getByTestId('export-scale'), { target: { value: '2' } })
    expect(state().exportSettings.crop).toEqual({ x: 0, y: 0, width: 40, height: 30 })
    await waitFor(() => expect(screen.getByTestId('export-preview-size').textContent).toMatch(/^80x60 像素/))
    expect(screen.getByTestId('export-summary').textContent).toContain('80x60 像素（裁剪範圍 x2）')
    await waitFor(() => expect(screen.getByTestId('export-preview-content-status').textContent).toContain('超出畫布'))
    const now = useLiveStore.getState().exportPreview!
    const moving = screen.getByTestId('export-preview-drag')
    fireEvent.pointerDown(moving, { button: 0, pointerId: 2, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(moving, { pointerId: 2, clientX: 10 + 10 * now.viewScale, clientY: 10 + 5 * now.viewScale })
    expect(state().exportSettings.crop).toEqual({ x: 10, y: -5, width: 40, height: 30 })
    fireEvent.pointerCancel(moving, { pointerId: 2 })
    fireEvent.pointerMove(moving, { pointerId: 2, clientX: 900, clientY: 900 })
    expect(state().exportSettings.crop).toEqual({ x: 10, y: -5, width: 40, height: 30 })
    fireEvent.pointerDown(moving, { button: 2, pointerId: 3, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(moving, { pointerId: 3, clientX: 50, clientY: 50 })
    expect(state().exportSettings.crop).toEqual({ x: 10, y: -5, width: 40, height: 30 })
    fireEvent.doubleClick(moving)
    expect(state().exportSettings.crop).toEqual({ x: -50, y: 0, width: 100, height: 200 })
    fireEvent.change(screen.getByTestId('export-crop-x'), { target: { value: '5' } })
    fireEvent.click(screen.getByTestId('export-crop-reset'))
    expect(state().exportSettings.crop).toEqual({ x: -50, y: 0, width: 100, height: 200 })
    expect(screen.getByTestId('export-preview-hint').textContent).toContain('角色大小不變')
    fireEvent.click(screen.getByTestId('export-size-scale'))
    expect(screen.getByTestId('export-offset-x')).toBeTruthy()
    fireEvent.click(screen.getByTestId('export-size-crop'))
    expect(state().exportSettings).toMatchObject({ sizeMode: 'crop', crop: { x: -50, y: 0, width: 100, height: 200 } })
  })

  it('shows preview errors', async () => {
    harness.env.exporter!.preview = async () => {
      throw new Error('預覽失敗')
    }
    act(() => harness.controller.setExportOpen(true, 'walk'))
    mount()
    await waitFor(() => expect(screen.getByTestId('export-preview-error').textContent).toBe('預覽失敗'))
  })
})
