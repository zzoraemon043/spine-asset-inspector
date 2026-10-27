import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'
import type { Page } from '@playwright/test'
import { test, expect, pause } from './fixtures'
import { alphaStats, decodePng, isPng } from '../support/pngDecode'

async function openExport(page: Page, format: string) {
  await page.getByTestId('export-open').click()
  await expect(page.getByTestId('export-dialog')).toBeVisible()
  await page.getByTestId(`export-format-${format}`).click()
}

async function runExport(page: Page) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByTestId('export-run').click()])
  return download
}

test.describe('export dialog', () => {
  test('exports the current frame as a transparent high resolution png', async ({ app }) => {
    await pause(app)
    await openExport(app, 'frame')
    await app.getByTestId('export-size-scale').click()
    await app.getByTestId('export-scale').fill('2')
    const download = await runExport(app)
    expect(download.suggestedFilename()).toMatch(/^inspector-demo_frame_\d+x\d+\.png$/)
    const png = decodePng(new Uint8Array(readFileSync(await download.path())))
    expect(png.colorType).toBe(6)
    expect(png.height).toBeGreaterThan(500)
    const stats = alphaStats(png)
    expect(stats.transparent).toBeGreaterThan(1000)
    expect(stats.opaque).toBeGreaterThan(1000)
    expect(png.pixels[3]).toBe(0)
    await expect(app.getByTestId('export-result')).toContainText('.png')
  })

  test('exports a png sequence with fixed size, frame range and background color', async ({ app }) => {
    await openExport(app, 'sequence')
    await app.getByTestId('export-animation').selectOption('hit')
    await app.getByTestId('export-fps').fill('20')
    await app.getByTestId('export-start').fill('2')
    await app.getByTestId('export-end').fill('5')
    await app.getByTestId('export-size-fixed').click()
    await app.getByTestId('export-width').fill('256')
    await app.getByTestId('export-height').fill('320')
    await app.getByTestId('export-bg-color').click()
    await app.getByTestId('export-color').fill('#00ff00')
    await expect(app.getByTestId('export-summary')).toContainText('輸出 4 格')
    const download = await runExport(app)
    expect(download.suggestedFilename()).toBe('inspector-demo_hit_4f_20fps_256x320.zip')
    const entries = unzipSync(new Uint8Array(readFileSync(await download.path())))
    const names = Object.keys(entries).sort()
    expect(names).toEqual(['inspector-demo_hit_0002.png', 'inspector-demo_hit_0003.png', 'inspector-demo_hit_0004.png', 'inspector-demo_hit_0005.png', 'manifest.json'])
    const manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json']))
    expect(manifest).toMatchObject({ animation: 'hit', fps: 20, frameCount: 4, width: 256, height: 320 })
    const frame = decodePng(entries['inspector-demo_hit_0002.png'])
    expect(frame).toMatchObject({ width: 256, height: 320 })
    expect(alphaStats(frame).transparent).toBe(0)
    expect(Array.from(frame.pixels.slice(0, 4))).toEqual([0, 255, 0, 255])
  })

  test('exports a sprite sheet with frame coordinates', async ({ app }) => {
    await openExport(app, 'sheet')
    await app.getByTestId('export-animation').selectOption('shoot')
    await app.getByTestId('export-fps').fill('10')
    await app.getByTestId('export-size-fixed').click()
    await app.getByTestId('export-width').fill('128')
    await app.getByTestId('export-height').fill('128')
    await app.getByTestId('export-columns').fill('3')
    const download = await runExport(app)
    expect(download.suggestedFilename()).toBe('inspector-demo_shoot_sheet_3x2_10fps.zip')
    const entries = unzipSync(new Uint8Array(readFileSync(await download.path())))
    const sheet = decodePng(entries['inspector-demo_shoot_sheet.png'])
    expect(sheet).toMatchObject({ width: 384, height: 256, colorType: 6 })
    const manifest = JSON.parse(new TextDecoder().decode(entries['inspector-demo_shoot_sheet.json']))
    expect(Object.keys(manifest.frames)).toHaveLength(5)
    expect(manifest.meta).toMatchObject({ size: { w: 384, h: 256 }, columns: 3, rows: 2, fps: 10 })
    expect(manifest.frames['inspector-demo_shoot_0004.png'].frame).toEqual({ x: 128, y: 128, w: 128, h: 128 })
    expect(alphaStats(sheet).transparent).toBeGreaterThan(0)
    expect(isPng(entries['inspector-demo_shoot_sheet.png'])).toBe(true)
  })

  test('records a webm clip', async ({ app }) => {
    await openExport(app, 'webm')
    await app.getByTestId('export-animation').selectOption('hit')
    const download = await runExport(app)
    expect(download.suggestedFilename()).toMatch(/^inspector-demo_hit_30fps_\d+x\d+\.webm$/)
    const bytes = new Uint8Array(readFileSync(await download.path()))
    expect([...bytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3])
    expect(bytes.length).toBeGreaterThan(500)
    const simpleBlocks = bytes.reduce((count, byte, index) => count + (byte === 0xa3 && index > 0 && bytes[index - 1] !== 0 ? 1 : 0), 0)
    expect(Buffer.from(bytes).includes(Buffer.from([0x1f, 0x43, 0xb6, 0x75]))).toBe(true)
    expect(simpleBlocks).toBeGreaterThan(5)
  })

  test('opens the dialog for a specific animation from the properties panel', async ({ app }) => {
    await app.getByTestId('animation-item-walk').click()
    await app.getByTestId('animation-export').click()
    await expect(app.getByTestId('export-animation')).toHaveValue('walk')
    await app.keyboard.press('Escape')
    await expect(app.getByTestId('export-dialog')).toHaveCount(0)
  })
})
