import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'
import { TextureAtlas } from '@esotericsoftware/spine-core'
import { test, expect, pause, stageShot, openTool } from './fixtures'
import { createDemoFiles } from '../../src/core/demo/demoAsset'
import { describeAtlas } from '../../src/core/atlas/atlasModel'
import { sliceRegion } from '../../src/core/atlas/atlasSlicer'
import { encodePng } from '../../src/core/image/pngEncode'
import { decodePng } from '../support/pngDecode'

function magentaPng(width: number, height: number): Buffer {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) pixels.set([255, 0, 255, 255], i * 4)
  return Buffer.from(encodePng({ width, height, pixels }))
}

test.describe('atlas toolkit', () => {
  test('slices every region into a lossless zip', async ({ app }) => {
    await openTool(app, 'atlas')
    await expect(app.locator('[data-testid^="atlas-region-"]')).toHaveCount(20)
    await expect(app.getByTestId('atlas-page-preview')).toBeVisible()
    const [download] = await Promise.all([app.waitForEvent('download'), app.getByTestId('atlas-export-zip').click()])
    expect(download.suggestedFilename()).toBe('inspector-demo_regions_20.zip')
    const entries = unzipSync(new Uint8Array(readFileSync(await download.path())))
    expect(Object.keys(entries)).toHaveLength(21)
    const files = createDemoFiles()
    const info = describeAtlas(new TextureAtlas(files.atlasText))
    for (const region of info.regions) {
      const png = decodePng(entries[`${region.name}.png`])
      const expected = sliceRegion(files.texture, region)
      expect(png.width).toBe(expected.width)
      expect(png.height).toBe(expected.height)
      expect(Buffer.from(png.pixels).equals(Buffer.from(expected.pixels))).toBe(true)
    }
  })

  test('downloads a single region png', async ({ app }) => {
    await openTool(app, 'atlas')
    const [download] = await Promise.all([app.waitForEvent('download'), app.getByTestId('atlas-download-head').click()])
    expect(download.suggestedFilename()).toBe('head.png')
    expect(decodePng(new Uint8Array(readFileSync(await download.path())))).toMatchObject({ width: 64, height: 64, colorType: 6 })
  })

  test('hot swaps a region texture on the live stage and restores it', async ({ app }) => {
    await pause(app)
    await openTool(app, 'atlas')
    const before = await stageShot(app)
    await app.getByTestId('atlas-replace-input-sword').setInputFiles({ name: 'laser.png', mimeType: 'image/png', buffer: magentaPng(48, 12) })
    await expect(app.getByTestId('atlas-replaced-sword')).toBeVisible()
    await expect(app.getByTestId('atlas-region-sword')).toContainText('laser.png 48x12')
    await expect(app.getByTestId('tab-atlas')).toContainText('1')
    const swapped = await stageShot(app)
    expect(swapped.equals(before)).toBe(false)
    await openTool(app, 'audit')
    await expect(app.getByTestId('audit-value-drawCalls')).toHaveText('3')
    await openTool(app, 'atlas')
    await app.getByTestId('atlas-restore-sword').click()
    await expect(app.getByTestId('atlas-replaced-sword')).toHaveCount(0)
    await expect.poll(async () => (await stageShot(app)).equals(before)).toBe(true)
  })

  test('replaces the selected region from a png dropped on the stage', async ({ app }) => {
    await openTool(app, 'atlas')
    await app.getByTestId('atlas-select-head').click()
    const base64 = magentaPng(16, 16).toString('base64')
    await app.getByTestId('stage').evaluate((stage, payload) => {
      const binary = atob(payload)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'face.png', { type: 'image/png' }))
      stage.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
    }, base64)
    await expect(app.getByTestId('atlas-replaced-head')).toBeVisible()
    await expect(app.getByTestId('asset-name')).toHaveText('inspector-demo')
  })

  test('keeps semi transparent pixels exact for locally loaded pages', async ({ app }) => {
    const files = createDemoFiles()
    const width = files.texture.width
    const height = files.texture.height
    const pixels = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < width * height; i++) pixels.set([(i * 7) & 0xff, (i * 13) & 0xff, (i * 29) & 0xff, 1 + (i % 255)], i * 4)
    const gradient = { width, height, pixels }
    await app.getByTestId('file-input').setInputFiles([
      { name: 'grad.json', mimeType: 'application/json', buffer: Buffer.from(files.skeletonJson) },
      { name: 'grad.atlas', mimeType: 'text/plain', buffer: Buffer.from(files.atlasText) },
      { name: files.pageName, mimeType: 'image/png', buffer: Buffer.from(encodePng(gradient)) },
    ])
    await expect(app.getByTestId('asset-name')).toHaveText('grad')
    await openTool(app, 'atlas')
    const [download] = await Promise.all([app.waitForEvent('download'), app.getByTestId('atlas-export-zip').click()])
    const entries = unzipSync(new Uint8Array(readFileSync(await download.path())))
    const info = describeAtlas(new TextureAtlas(files.atlasText))
    for (const region of info.regions) {
      const png = decodePng(entries[`${region.name}.png`])
      expect(Buffer.from(png.pixels).equals(Buffer.from(sliceRegion(gradient, region).pixels))).toBe(true)
    }
  })
})
