import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, stageShot, openTool } from './fixtures'
import { buildSpine36Fixture, FIXTURE_ATLAS } from '../support/spine36Writer'
import { encodePng } from '../../src/core/image/pngEncode'

const root = process.cwd()

function solidPage(): Buffer {
  const pixels = new Uint8ClampedArray(64 * 64 * 4).fill(200)
  return Buffer.from(encodePng({ width: 64, height: 64, pixels }))
}

test.describe('spine 3.6 binary upgrade', () => {
  test('loads a synthetic 3.6 binary and marks it as upgraded', async ({ app }) => {
    await app.getByTestId('file-input').setInputFiles([
      { name: 'fixture.skel', mimeType: 'application/octet-stream', buffer: Buffer.from(buildSpine36Fixture()) },
      { name: 'fixture.atlas', mimeType: 'text/plain', buffer: Buffer.from(FIXTURE_ATLAS) },
      { name: 'fixture.png', mimeType: 'image/png', buffer: solidPage() },
    ])
    await expect(app.getByTestId('asset-name')).toHaveText('fixture')
    await expect(app.getByTestId('asset-version')).toHaveText('v3.6.52')
    await expect(app.getByTestId('asset-upgraded')).toBeVisible()
    await expect(app.getByTestId('asset-warnings')).toContainText('3.6.52')
    await expect(app.getByTestId('animation-item-act')).toBeVisible()
  })

  for (const asset of [
    { dir: '054可达鸭', base: 'hero_kedaya', version: 'v3.6.53', animation: 'attack', event: 'hit', animations: 9 },
    { dir: '003妙蛙花', base: 'hero_miaowahua', version: 'v3.6.52', animation: 'attack', event: '999999', animations: 7 },
  ]) {
    test(`renders reference asset ${asset.base} and fires its events`, async ({ app }) => {
      test.skip(!existsSync(join(root, asset.dir, `${asset.base}.skel`)), 'reference asset not present')
      const read = (ext: string) => readFileSync(join(root, asset.dir, `${asset.base}${ext}`))
      const before = await stageShot(app)
      await app.getByTestId('file-input').setInputFiles([
        { name: `${asset.base}.skel`, mimeType: 'application/octet-stream', buffer: read('.skel') },
        { name: `${asset.base}.atlas`, mimeType: 'text/plain', buffer: read('.atlas') },
        { name: `${asset.base}.png`, mimeType: 'image/png', buffer: read('.png') },
      ])
      await expect(app.getByTestId('asset-name')).toHaveText(asset.base)
      await expect(app.getByTestId('asset-version')).toHaveText(asset.version)
      await expect(app.getByTestId('asset-upgraded')).toBeVisible()
      await expect(app.locator('[data-testid^="animation-item-"]')).toHaveCount(asset.animations)
      expect((await stageShot(app)).equals(before)).toBe(false)
      await app.getByTestId(`animation-item-${asset.animation}`).click()
      await openTool(app, 'events')
      await expect(app.locator(`[data-testid="event-row"][data-event="${asset.event}"]`).first()).toBeVisible({ timeout: 15_000 })
      await openTool(app, 'audit')
      await expect(app.getByTestId('audit-grade')).toBeVisible()
    })
  }
})
