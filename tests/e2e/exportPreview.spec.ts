import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { test, expect, pause } from './fixtures'
import { alphaStats, decodePng } from '../support/pngDecode'

async function openFixed(page: Page, format: string) {
  await page.getByTestId('export-open').click()
  await page.getByTestId(`export-format-${format}`).click()
  await page.getByTestId('export-size-fixed').click()
  await page.getByTestId('export-width').fill('256')
  await page.getByTestId('export-height').fill('256')
  await expect(page.getByTestId('export-preview-size')).toContainText('256x256')
}

async function previewOpaquePixels(page: Page): Promise<number> {
  return page.getByTestId('export-preview-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d')
    if (!context) return -1
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let index = 3; index < data.length; index += 4) if (data[index] > 0) count += 1
    return count
  })
}

async function exportFrame(page: Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()])
  return alphaStats(decodePng(new Uint8Array(readFileSync(await download.path()))))
}

test.describe('export dialog live preview', () => {
  test('renders the cropped character with guide lines and scrubs frames', async ({ app }) => {
    await openFixed(app, 'sequence')
    await app.getByTestId('export-animation').selectOption('attack')
    await app.getByTestId('export-padding').fill('24')
    await expect(app.getByTestId('export-preview-frame-label')).toHaveText('第 0 格（1 / 24）')
    await expect(app.getByTestId('export-preview-border')).toBeVisible()
    await expect(app.getByTestId('export-preview-mask')).toBeVisible()
    await expect.poll(() => previewOpaquePixels(app)).toBeGreaterThan(500)
    const padding = app.getByTestId('export-preview-padding')
    await expect(padding).toBeVisible()
    await expect(app.getByTestId('export-preview-content-status')).toHaveText('整段動作都在畫布內，不會被裁切')
    const firstPose = await app.getByTestId('export-preview-pose').getAttribute('x')
    await app.getByTestId('export-preview-frame').fill('12')
    await expect(app.getByTestId('export-preview-frame-label')).toHaveText('第 12 格（13 / 24）')
    await expect.poll(() => app.getByTestId('export-preview-pose').getAttribute('x')).not.toBe(firstPose)
    await app.getByTestId('export-offset-x').fill('160')
    await expect(app.getByTestId('export-preview-content-status')).toContainText('超出畫布')
    await app.getByTestId('export-align-bottom').click()
    await app.getByTestId('export-offset-x').fill('0')
    await expect(app.getByTestId('export-preview-content-status')).toHaveText('整段動作都在畫布內，不會被裁切')
    await app.getByTestId('export-bg-color').click()
    await expect(app.getByTestId('export-preview-frame-box')).not.toHaveClass(/stage-checker/)
  })

  test('applies the previewed offset to the exported image', async ({ app }) => {
    await pause(app)
    await openFixed(app, 'frame')
    await expect(app.getByTestId('export-preview-frame')).toHaveCount(0)
    const centered = await exportFrame(app)
    await app.getByTestId('export-offset-x').fill('200')
    await expect(app.getByTestId('export-preview-content-status')).toContainText('超出畫布')
    const shifted = await exportFrame(app)
    expect(centered.opaque).toBeGreaterThan(1000)
    expect(shifted.opaque).toBeLessThan(centered.opaque * 0.6)
  })

  test('drags single crop edges like the Spine export viewport and exports the cropped size', async ({ app }) => {
    await pause(app)
    await app.getByTestId('export-open').click()
    await app.getByTestId('export-format-frame').click()
    await expect(app.getByTestId('export-preview-size')).toContainText('像素')
    await expect.poll(() => previewOpaquePixels(app)).toBeGreaterThan(500)
    const contentBefore = Number(await app.getByTestId('export-preview-content').getAttribute('width'))
    const handle = await app.getByTestId('export-preview-handle-w').boundingBox()
    if (!handle) throw new Error('missing handle')
    const leftBefore = handle.x
    await app.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await app.mouse.down()
    await app.mouse.move(handle.x + handle.width / 2 + 30, handle.y + handle.height / 2, { steps: 6 })
    const during = await app.getByTestId('export-preview-handle-w').boundingBox()
    expect(during!.x).toBeGreaterThan(leftBefore + 25)
    await app.mouse.up()
    await expect(app.getByTestId('export-size-crop')).toHaveAttribute('aria-pressed', 'true')
    await expect(app.getByTestId('export-preview-content-status')).toContainText('超出畫布')
    const contentAfter = Number(await app.getByTestId('export-preview-content').getAttribute('width'))
    const right = await app.getByTestId('export-preview-handle-e').boundingBox()
    expect(right).not.toBeNull()
    expect(Math.abs(contentAfter - contentBefore)).toBeLessThan(contentBefore * 0.35)
    const width = Number(await app.getByTestId('export-crop-width').inputValue())
    const height = Number(await app.getByTestId('export-crop-height').inputValue())
    await app.getByTestId('export-scale').fill('2')
    await expect(app.getByTestId('export-preview-size')).toContainText(`${width * 2}x${height * 2}`)
    const [download] = await Promise.all([app.waitForEvent('download'), app.getByTestId('export-run').click()])
    const image = decodePng(new Uint8Array(readFileSync(await download.path())))
    expect([image.width, image.height]).toEqual([width * 2, height * 2])
    await app.getByTestId('export-preview-drag').dblclick()
    await expect(app.getByTestId('export-preview-content-status')).toHaveText('整段動作都在畫布內，不會被裁切')
  })
})
