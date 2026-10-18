import { zipSync } from 'fflate'
import { test, expect } from './fixtures'
import { demoFileSet } from '../support/demoFiles'

test.describe('asset loader', () => {
  test('loads loose json, atlas and png files from the file picker', async ({ app }) => {
    const set = demoFileSet()
    await app.getByTestId('file-input').setInputFiles([
      { name: 'hero.json', mimeType: 'application/json', buffer: Buffer.from(set.json) },
      { name: 'hero.atlas', mimeType: 'text/plain', buffer: Buffer.from(set.atlas) },
      { name: set.names.png, mimeType: 'image/png', buffer: Buffer.from(set.png) },
    ])
    await expect(app.getByTestId('asset-name')).toHaveText('hero')
    await expect(app.getByTestId('asset-badges')).toContainText('本機')
    await expect(app.getByTestId('stat-slots')).toHaveText('18')
    await expect(app.getByTestId('notice-success').last()).toContainText('hero')
  })

  test('loads a dropped zip archive', async ({ app }) => {
    const set = demoFileSet()
    const zip = zipSync({
      'pack/knight.json': set.json,
      'pack/knight.atlas': set.atlas,
      [`pack/${set.names.png}`]: set.png,
      '__MACOSX/pack/._knight.json': new Uint8Array([0]),
    })
    const base64 = Buffer.from(zip).toString('base64')
    await app.getByTestId('stage').evaluate(async (stage, payload) => {
      const binary = atob(payload)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'knight-pack.zip', { type: 'application/zip' }))
      stage.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true }))
      stage.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
    }, base64)
    await expect(app.getByTestId('asset-name')).toHaveText('knight')
    await expect(app.getByTestId('animation-item-death')).toBeVisible()
  })

  test('reports incomplete bundles and keeps the current asset', async ({ app }) => {
    const set = demoFileSet()
    await app.getByTestId('file-input').setInputFiles([{ name: 'lonely.json', mimeType: 'application/json', buffer: Buffer.from(set.json) }])
    await expect(app.getByTestId('notice-error')).toContainText('.atlas')
    await expect(app.getByTestId('asset-name')).toHaveText('inspector-demo')
    await expect(app.getByTestId('load-status')).toHaveAttribute('data-status', 'ready')
  })

  test('reloads the built-in demo on request', async ({ app }) => {
    const set = demoFileSet()
    await app.getByTestId('file-input').setInputFiles([
      { name: 'hero.json', mimeType: 'application/json', buffer: Buffer.from(set.json) },
      { name: 'hero.atlas', mimeType: 'text/plain', buffer: Buffer.from(set.atlas) },
      { name: set.names.png, mimeType: 'image/png', buffer: Buffer.from(set.png) },
    ])
    await expect(app.getByTestId('asset-name')).toHaveText('hero')
    await app.getByTestId('load-demo').click()
    await expect(app.getByTestId('asset-name')).toHaveText('inspector-demo')
  })
})
