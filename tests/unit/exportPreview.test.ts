import { beforeEach, describe, expect, it } from 'vitest'
import { fitScale, frameFor, frameWorld, overflow, placeContent, previewGeometry, viewAround, worldToFrame, worldToView } from '../../src/core/export/placement'
import { useInspectorStore } from '../../src/store/inspectorStore'
import { useLiveStore } from '../../src/store/liveStore'
import { createHarness, previewDisposals, type FakeHarness } from '../support/fakeEnvironment'

const base = { sizeMode: 'fixed' as const, scale: 1, width: 200, height: 400, padding: 0, background: null }

describe('export placement geometry', () => {
  it('centers, bottom-aligns and offsets content inside the output frame', () => {
    const bounds = { x: -50, y: 0, width: 100, height: 100 }
    const size = { width: 200, height: 400, scale: 2 }
    expect(placeContent(bounds, size)).toEqual({ centerX: 0, centerY: 50 })
    expect(placeContent(bounds, size, { align: 'bottom', offsetX: 0, offsetY: 0 })).toEqual({ centerX: 0, centerY: 100 })
    expect(placeContent(bounds, size, { align: 'center', offsetX: 20, offsetY: 10 })).toEqual({ centerX: -10, centerY: 55 })
    const centered = worldToFrame(bounds, size, placeContent(bounds, size))
    expect(centered).toEqual({ x: 0, y: 100, width: 200, height: 200 })
    const bottom = worldToFrame(bounds, size, placeContent(bounds, size, { align: 'bottom', offsetX: 0, offsetY: 0 }))
    expect(bottom.y + bottom.height).toBe(400)
    expect(overflow({ x: -3, y: 0, width: 10, height: 10 }, 10, 10)).toBe(3)
    expect(overflow({ x: 0, y: 2, width: 10, height: 10 }, 10, 10)).toBe(2)
    expect(overflow({ x: 0, y: 0, width: 10, height: 10 }, 10, 10)).toBe(0)
    expect(fitScale(720, 600, 360, 300)).toBe(0.5)
    expect(fitScale(100, 100, 360, 300)).toBe(3)
  })

  it('renders a wider view around the output frame with rectangles in preview pixels', () => {
    const content = { x: -50, y: 0, width: 100, height: 200 }
    const fitted = previewGeometry(content, content, { ...base, padding: 10 }, 360, 300)
    expect(fitted.size).toEqual({ width: 200, height: 400, scale: Math.min(200 / 120, 400 / 220) })
    expect(fitted.view).toEqual(viewAround(fitted.frameWorld, content, content))
    expect(fitted.view.width).toBeGreaterThan(fitted.frameWorld.width)
    expect(Math.max(fitted.small.width, fitted.small.height) <= 360).toBe(true)
    expect(fitted.small.height).toBe(300)
    expect(fitted.previewScale).toBeCloseTo(fitted.viewScale / fitted.size.scale)
    expect(fitted.frame).toEqual(worldToView(fitted.frameWorld, fitted.view, fitted.viewScale))
    expect(fitted.frame.x).toBeGreaterThan(0)
    expect(fitted.contentOverflow).toBe(0)
    expect(fitted.paddedRect.width).toBeCloseTo(120 * fitted.viewScale)
    expect(fitted.content.width).toBeCloseTo(100 * fitted.viewScale)
    const shifted = previewGeometry(content, content, { ...base, offsetX: 50 }, 360, 300)
    expect(shifted.contentOverflow).toBe(50)
    const bottom = previewGeometry(content, { x: 40, y: 0, width: 30, height: 30 }, { ...base, align: 'bottom' }, 360, 300)
    expect(bottom.content.y + bottom.content.height).toBeCloseTo(bottom.frame.y + bottom.frame.height)
    expect(bottom.poseOverflow).toBeGreaterThan(0)
    const scaled = previewGeometry(content, content, { ...base, sizeMode: 'scale', scale: 2, padding: 5 }, 360, 300)
    expect(scaled.size).toMatchObject({ width: 220, height: 420 })
    expect(scaled.contentOverflow).toBe(0)
    const locked = previewGeometry(content, content, base, 360, 300, { x: -500, y: -500, width: 1000, height: 1000 })
    expect(locked.view).toEqual({ x: -500, y: -500, width: 1000, height: 1000 })
    expect(locked.viewScale).toBeCloseTo(0.3)
  })

  it('crops a world rectangle at the output scale without resizing the character', () => {
    const content = { x: -50, y: 0, width: 100, height: 200 }
    const crop = { x: 0, y: 50, width: 80, height: 60 }
    const framing = frameFor(content, { ...base, sizeMode: 'crop', scale: 1.5, crop, padding: 30, offsetX: 99 })
    expect(framing.size).toEqual({ width: 120, height: 90, scale: 1.5 })
    expect(framing.placement).toEqual({ centerX: 40, centerY: 80 })
    expect(frameWorld(framing.size, framing.placement)).toEqual(crop)
    const geometry = previewGeometry(content, content, { ...base, sizeMode: 'crop', scale: 1.5, crop }, 360, 300)
    expect(geometry.frameWorld).toEqual(crop)
    expect(geometry.contentOverflow).toBeGreaterThan(0)
    expect(geometry.content.width).toBeCloseTo(100 * geometry.viewScale)
    const fallback = frameFor(content, { ...base, sizeMode: 'crop', scale: 1, crop: null, padding: 0 })
    expect(fallback.size).toMatchObject({ width: 100, height: 200, scale: 1 })
  })
})

describe('export preview feature', () => {
  let harness: FakeHarness
  const state = () => useInspectorStore.getState()

  beforeEach(async () => {
    harness = createHarness()
    await harness.controller.loadDemo()
  })

  it('renders previews for sequences and the current frame and follows settings', async () => {
    const controller = harness.controller
    expect(controller.exportPreview.supported).toBe(true)
    controller.setExportOpen(true, 'walk')
    controller.updateExportSettings({ format: 'sequence', sizeMode: 'fixed', width: 300, height: 300, padding: 8, startFrame: 2 })
    await controller.exportPreview.request(4)
    const result = useLiveStore.getState().exportPreview!
    expect(result).toMatchObject({ frameWidth: 300, frameHeight: 300, frame: 4, firstFrame: 2, frameCount: 10, contentOverflow: 0 })
    expect(state().exportPreview).toEqual({ status: 'ready', frame: 4, error: null })
    controller.updateExportSettings({ offsetX: 400, offsetY: -10, align: 'bottom' })
    expect(state().exportSettings).toMatchObject({ offsetX: 400, offsetY: -10, align: 'bottom' })
    await controller.exportPreview.request()
    expect(useLiveStore.getState().exportPreview!.contentOverflow).toBeGreaterThan(0)
    controller.updateExportSettings({ format: 'frame' })
    await controller.exportPreview.request(7)
    expect(useLiveStore.getState().exportPreview).toMatchObject({ frameCount: 1, frame: 0 })
    controller.updateExportSettings({ offsetX: 99999, align: 'left' as never })
    expect(state().exportSettings).toMatchObject({ offsetX: 4096, align: 'center' })
    const disposals = previewDisposals.count
    controller.setExportOpen(false)
    expect(previewDisposals.count).toBe(disposals + 1)
    expect(useLiveStore.getState().exportPreview).toBeNull()
    expect(state().exportPreview.status).toBe('idle')
  })

  it('coalesces rapid requests and reports errors', async () => {
    const controller = harness.controller
    controller.setExportOpen(true, 'walk')
    const first = controller.exportPreview.request(1)
    const second = controller.exportPreview.request(6)
    expect(first).toBe(second)
    await second
    expect(state().exportPreview.frame).toBe(6)
    useInspectorStore.setState({ exportSettings: { ...state().exportSettings, animation: null, format: 'sequence' }, animation: null })
    await controller.exportPreview.request(0)
    expect(state().exportPreview).toMatchObject({ status: 'error', error: '目前無法產生預覽' })
    harness.env.exporter!.preview = async () => {
      throw new Error('繪圖失敗')
    }
    useInspectorStore.setState({ exportSettings: { ...state().exportSettings, animation: 'walk' }, animation: 'walk' })
    await controller.exportPreview.request(0)
    expect(state().exportPreview).toMatchObject({ status: 'error', error: '繪圖失敗' })
    expect(useLiveStore.getState().exportPreview).toBeNull()
  })

  it('passes alignment and offsets to real exports', async () => {
    const jobs: unknown[] = []
    const exporter = harness.env.exporter!
    const sheet = exporter.sheet
    exporter.sheet = (context, job, onProgress, signal) => {
      jobs.push(job)
      return sheet(context, job, onProgress, signal)
    }
    harness.controller.updateExportSettings({ align: 'bottom', offsetX: 12, offsetY: -4, animation: 'walk' })
    await harness.controller.exportSheet()
    expect(jobs[0]).toMatchObject({ align: 'bottom', offsetX: 12, offsetY: -4 })
    harness.controller.updateExportSettings({ sizeMode: 'crop', crop: { x: 10.4, y: -3.6, width: 0, height: Number.NaN } })
    expect(state().exportSettings).toMatchObject({ sizeMode: 'crop', crop: { x: 10, y: -4, width: 1, height: 1 } })
    harness.controller.updateExportSettings({ crop: { x: -0.4, y: 0, width: 20.8, height: 10 } })
    expect(state().exportSettings.crop).toEqual({ x: 0, y: 0, width: 20, height: 10 })
    harness.controller.updateExportSettings({ sizeMode: 'bogus' as never })
    expect(state().exportSettings.sizeMode).toBe('scale')
    await harness.controller.exportSheet()
    expect(jobs[1]).toMatchObject({ crop: { x: 0, y: 0, width: 20, height: 10 } })
  })
})
