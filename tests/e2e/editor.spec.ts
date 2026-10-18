import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import type { Page } from '@playwright/test'
import { test, expect, stageShot, pause, openTool } from './fixtures'
import { buildSpine36Fixture, FIXTURE_ATLAS } from '../support/spine36Writer'
import { encodePng } from '../../src/core/image/pngEncode'

async function settledShot(page: Page): Promise<Buffer> {
  let previous = await stageShot(page)
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await page.waitForTimeout(80)
    const next = await stageShot(page)
    if (next.equals(previous)) return next
    previous = next
  }
  return previous
}

async function commitField(page: Page, testId: string, value: string) {
  const input = page.getByTestId(testId)
  await input.fill(value)
  await input.press('Enter')
}

async function pauseAtStart(page: Page) {
  await pause(page)
  await page.getByTestId('stage-canvas').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Home')
}

test.describe('animation editing stage 1', () => {
  test('edits a bone setup value, then undoes and redoes it on the stage', async ({ app }) => {
    await pauseAtStart(app)
    await app.getByTestId('tree-bone-torso').click()
    await expect(app.getByTestId('properties-title')).toHaveText('torso')
    const original = await settledShot(app)
    await commitField(app, 'edit-bone-rotation', '150')
    await expect(app.getByTestId('edit-dirty')).toBeVisible()
    await expect(app.getByTestId('edit-bone-rotation')).toHaveValue('150')
    const edited = await settledShot(app)
    expect(edited.equals(original)).toBe(false)
    await app.getByTestId('edit-undo').click()
    await expect(app.getByTestId('edit-bone-rotation')).toHaveValue('90')
    await expect(app.getByTestId('edit-dirty')).toHaveCount(0)
    expect((await settledShot(app)).equals(original)).toBe(true)
    await app.getByTestId('edit-redo').click()
    await expect(app.getByTestId('edit-bone-rotation')).toHaveValue('150')
    expect((await settledShot(app)).equals(edited)).toBe(true)
  })

  test('deletes the selected bone with the Delete key and restores it with Ctrl+Z', async ({ app }) => {
    await pauseAtStart(app)
    const original = await settledShot(app)
    await app.getByTestId('tree-bone-arm-front-upper').click()
    await expect(app.getByTestId('properties-title')).toHaveText('arm-front-upper')
    await app.keyboard.press('Delete')
    await expect(app.getByTestId('tree-bone-arm-front-upper')).toHaveCount(0)
    await expect(app.getByTestId('tree-bone-weapon')).toHaveCount(0)
    await expect(app.getByTestId('edit-dirty')).toBeVisible()
    expect((await settledShot(app)).equals(original)).toBe(false)
    await app.keyboard.press('Control+z')
    await expect(app.getByTestId('tree-bone-weapon')).toHaveCount(1)
    expect((await settledShot(app)).equals(original)).toBe(true)
    await app.getByTestId('tree-bone-root').click()
    await app.getByTestId('selection-delete').click()
    await expect(app.getByTestId('tree-bone-root')).toHaveCount(1)
  })

  test('renames an animation and restores it with Ctrl+Z', async ({ app }) => {
    await app.getByTestId('animation-item-walk').click()
    await commitField(app, 'edit-animation-name', '行走')
    await expect(app.getByTestId('animation-item-行走')).toBeVisible()
    await expect(app.getByTestId('animation-item-walk')).toHaveCount(0)
    await expect(app.getByTestId('animation-item-行走')).toHaveAttribute('aria-selected', 'true')
    await expect(app.getByTestId('properties-title')).toHaveText('行走')
    await app.getByTestId('stage-canvas').click({ position: { x: 5, y: 5 } })
    await app.keyboard.press('Control+z')
    await expect(app.getByTestId('animation-item-walk')).toBeVisible()
    await expect(app.getByTestId('animation-item-行走')).toHaveCount(0)
    await app.keyboard.press('Control+Shift+z')
    await expect(app.getByTestId('animation-item-行走')).toBeVisible()
  })

  test('rejects duplicate names and keeps the field value', async ({ app }) => {
    await app.getByTestId('tree-bone-head').click()
    await commitField(app, 'edit-bone-name', 'torso')
    await expect(app.getByTestId('notice-error').last()).toContainText('骨骼名稱已存在：torso')
    await expect(app.getByTestId('edit-bone-name')).toHaveValue('head')
    await expect(app.getByTestId('edit-undo')).toBeDisabled()
  })

  test('saves Spine 4.2 JSON with the edits and clears the dirty badge', async ({ app }) => {
    await app.getByTestId('tree-bone-head').click()
    await commitField(app, 'edit-bone-x', '12.5')
    await app.getByTestId('animation-item-attack').click()
    await app.getByTestId('animation-duplicate').click()
    await expect(app.getByTestId('animation-item-attack 複本')).toBeVisible()
    const [download] = await Promise.all([app.waitForEvent('download'), app.getByTestId('topbar-save-json').click()])
    expect(download.suggestedFilename()).toBe('inspector-demo.json')
    const json = JSON.parse(readFileSync(await download.path(), 'utf8'))
    expect(json.skeleton.spine).toMatch(/^4\.2/)
    expect(json.bones.find((bone: { name: string }) => bone.name === 'head').x).toBe(12.5)
    expect(Object.keys(json.animations)).toContain('attack 複本')
    expect(json.animations['attack 複本']).toEqual(json.animations.attack)
    await expect(app.getByTestId('edit-dirty')).toHaveCount(0)
  })

  test('saves with Ctrl+S and exports a project zip', async ({ app }) => {
    if ((await app.getByTestId('tree-event-hit').count()) === 0) await app.getByTestId('tree-group-events-toggle').click()
    await app.getByTestId('tree-event-hit').click()
    await commitField(app, 'edit-event-string', 'boom')
    await app.getByTestId('stage-canvas').click({ position: { x: 5, y: 5 } })
    const [saved] = await Promise.all([app.waitForEvent('download'), app.keyboard.press('Control+s')])
    expect(JSON.parse(readFileSync(await saved.path(), 'utf8')).events.hit.string).toBe('boom')
    await app.getByTestId('tree-skeleton').click()
    const [project] = await Promise.all([app.waitForEvent('download'), app.getByTestId('edit-export-project').click()])
    expect(project.suggestedFilename()).toBe('inspector-demo_project.zip')
    const entries = unzipSync(new Uint8Array(readFileSync(await project.path())))
    expect(Object.keys(entries).sort()).toEqual(['inspector-demo.atlas', 'inspector-demo.json', 'inspector-demo.png'])
    expect(JSON.parse(new TextDecoder().decode(entries['inspector-demo.json'])).events.hit.string).toBe('boom')
  })

  test('lists history steps and jumps back to the original', async ({ app }) => {
    await app.getByTestId('tree-bone-head').click()
    await commitField(app, 'edit-bone-y', '40')
    await commitField(app, 'edit-bone-name', 'skull')
    await openTool(app, 'history')
    await expect(app.getByTestId('history-list').locator('li')).toHaveCount(3)
    await expect(app.getByTestId('history-entry-2')).toHaveAttribute('aria-current', 'step')
    await expect(app.getByTestId('history-entry-2')).toContainText('重新命名骨骼 head 為 skull')
    await app.getByTestId('history-entry-0').click()
    await expect(app.getByTestId('history-entry-0')).toHaveAttribute('aria-current', 'step')
    await expect(app.getByTestId('tree-bone-head')).toBeVisible()
    await expect(app.getByTestId('edit-dirty')).toHaveCount(0)
    await app.getByTestId('history-entry-2').click()
    await expect(app.getByTestId('tree-bone-skull')).toBeVisible()
  })

  test('edits an upgraded 3.6 binary and saves it as 4.2 JSON', async ({ app }) => {
    const page = Buffer.from(encodePng({ width: 64, height: 64, pixels: new Uint8ClampedArray(64 * 64 * 4).fill(200) }))
    await app.getByTestId('file-input').setInputFiles([
      { name: 'fixture.skel', mimeType: 'application/octet-stream', buffer: Buffer.from(buildSpine36Fixture()) },
      { name: 'fixture.atlas', mimeType: 'text/plain', buffer: Buffer.from(FIXTURE_ATLAS) },
      { name: 'fixture.png', mimeType: 'image/png', buffer: page },
    ])
    await expect(app.getByTestId('asset-upgraded')).toBeVisible()
    await app.getByTestId('animation-item-act').click()
    await commitField(app, 'edit-animation-name', 'action')
    await expect(app.getByTestId('animation-item-action')).toBeVisible()
    const [download] = await Promise.all([app.waitForEvent('download'), app.getByTestId('topbar-save-json').click()])
    expect(download.suggestedFilename()).toBe('fixture.json')
    const json = JSON.parse(readFileSync(await download.path(), 'utf8'))
    expect(json.skeleton.spine).toBe('4.2.0')
    expect(Object.keys(json.animations)).toContain('action')
  })

  test('round-trips a real 3.6 reference asset through the editor', async ({ app }) => {
    const dir = join(process.cwd(), '054可达鸭')
    test.skip(!existsSync(join(dir, 'hero_kedaya.skel')), 'reference asset not present')
    const read = (ext: string) => readFileSync(join(dir, `hero_kedaya${ext}`))
    await app.getByTestId('file-input').setInputFiles([
      { name: 'hero_kedaya.skel', mimeType: 'application/octet-stream', buffer: read('.skel') },
      { name: 'hero_kedaya.atlas', mimeType: 'text/plain', buffer: read('.atlas') },
      { name: 'hero_kedaya.png', mimeType: 'image/png', buffer: read('.png') },
    ])
    await expect(app.getByTestId('asset-name')).toHaveText('hero_kedaya')
    await app.getByTestId('tree-skeleton').click()
    await commitField(app, 'edit-skeleton-fps', '24')
    await app.getByTestId('edit-undo').click()
    const [download] = await Promise.all([app.waitForEvent('download'), app.getByTestId('edit-save-json').click()])
    const json = JSON.parse(readFileSync(await download.path(), 'utf8'))
    expect(json.skeleton.spine).toBe('4.2.0')
    expect(Object.keys(json.animations)).toHaveLength(9)
    await app.getByTestId('file-input').setInputFiles([
      { name: 'hero_kedaya.json', mimeType: 'application/json', buffer: readFileSync(await download.path()) },
      { name: 'hero_kedaya.atlas', mimeType: 'text/plain', buffer: read('.atlas') },
      { name: 'hero_kedaya.png', mimeType: 'image/png', buffer: read('.png') },
    ])
    await expect(app.getByTestId('load-status')).toHaveAttribute('data-status', 'ready')
    await expect(app.locator('[data-testid^="animation-item-"]')).toHaveCount(9)
    await expect(app.getByTestId('asset-upgraded')).toHaveCount(0)
  })
})
