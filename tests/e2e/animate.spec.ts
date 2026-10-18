import { readFileSync } from 'node:fs'
import type { Locator, Page } from '@playwright/test'
import { test, expect, stageShot } from './fixtures'

const FRAME_WIDTH = 16

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

async function centerOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element not visible')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function gizmoPoint(page: Page, attribute: 'origin' | 'rotate') {
  const canvas = page.getByTestId('stage-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('stage canvas not visible')
  if (attribute === 'origin') {
    const [x, y] = ((await canvas.getAttribute('data-gizmo-origin')) ?? '0,0').split(',').map(Number)
    return { x: box.x + x, y: box.y + y }
  }
  const handles = JSON.parse((await canvas.getAttribute('data-gizmo-handles')) ?? '{}') as Record<string, [number, number]>
  return { x: box.x + handles.rotate[0], y: box.y + handles.rotate[1] }
}

async function seekRuler(page: Page, frame: number) {
  const ruler = page.getByTestId('dopesheet-ruler')
  const box = await ruler.boundingBox()
  if (!box) throw new Error('ruler not visible')
  await page.mouse.click(box.x + frame * FRAME_WIDTH + FRAME_WIDTH / 2, box.y + box.height / 2)
  await expect(page.getByTestId('dopesheet-frame')).toHaveText(`第 ${frame} 格`)
}

async function enterAnimate(page: Page, bone = 'torso') {
  await page.getByTestId('animation-item-walk').click()
  await page.getByTestId('animate-mode-toggle').click()
  await expect(page.getByTestId('dopesheet')).toBeVisible()
  await expect(page.getByTestId('stage-canvas')).toHaveAttribute('data-animate-mode', 'on')
  await page.getByTestId(`tree-bone-${bone}`).click()
  await expect(page.getByTestId('stage-canvas')).toHaveAttribute('data-gizmo-bone', bone)
}

async function rotateGizmo(page: Page, radians: number) {
  await page.keyboard.press('e')
  await expect(page.getByTestId('stage-canvas')).toHaveAttribute('data-gizmo-mode', 'rotate')
  const origin = await gizmoPoint(page, 'origin')
  const knob = await gizmoPoint(page, 'rotate')
  const radius = Math.hypot(knob.x - origin.x, knob.y - origin.y)
  const start = Math.atan2(knob.y - origin.y, knob.x - origin.x)
  await page.mouse.move(knob.x, knob.y)
  await page.mouse.down()
  await page.mouse.move(origin.x + Math.cos(start - radians) * radius, origin.y + Math.sin(start - radians) * radius, { steps: 10 })
  await page.mouse.up()
  const box = await page.getByTestId('stage-canvas').boundingBox()
  await page.mouse.move(box!.x + 8, box!.y + 8)
}

test.describe('animate mode and dopesheet', () => {
  test('auto-keys a gizmo rotation on the current frame and undoes it', async ({ app }) => {
    await enterAnimate(app)
    await seekRuler(app, 8)
    await expect(app.getByTestId('key-torso:rotate-8')).toHaveCount(0)
    await app.keyboard.press('e')
    await expect(app.getByTestId('stage-canvas')).toHaveAttribute('data-gizmo-mode', 'rotate')
    const before = await settledShot(app)
    await rotateGizmo(app, Math.PI / 6)
    await expect(app.getByTestId('key-torso:rotate-8')).toBeVisible()
    await expect(app.getByTestId('key-torso:rotate-8')).toHaveAttribute('data-selected', 'true')
    await expect(app.getByTestId('edit-undo')).toBeEnabled()
    expect((await settledShot(app)).equals(before)).toBe(false)
    await app.getByTestId('edit-undo').click()
    await expect(app.getByTestId('key-torso:rotate-8')).toHaveCount(0)
    expect((await settledShot(app)).equals(before)).toBe(true)
  })

  test('drags a keyframe to a new frame with the mouse', async ({ app }) => {
    await enterAnimate(app)
    const key = app.getByTestId('key-torso:rotate-15')
    const start = await centerOf(key)
    await app.mouse.move(start.x, start.y)
    await app.mouse.down()
    await app.mouse.move(start.x + FRAME_WIDTH * 5, start.y, { steps: 8 })
    await app.mouse.up()
    await expect(app.getByTestId('key-torso:rotate-20')).toBeVisible()
    await expect(app.getByTestId('key-torso:rotate-15')).toHaveCount(0)
    await app.getByTestId('stage-canvas').click({ position: { x: 5, y: 5 } })
    await app.keyboard.press('Control+z')
    await expect(app.getByTestId('key-torso:rotate-15')).toBeVisible()
  })

  test('box selects, copies, pastes and deletes keys with shortcuts', async ({ app }) => {
    await enterAnimate(app)
    const from = await centerOf(app.getByTestId('key-torso:rotate-15'))
    const to = await centerOf(app.getByTestId('key-cape:rotate-30'))
    await app.mouse.move(from.x - FRAME_WIDTH, from.y - 8)
    await app.mouse.down()
    await app.mouse.move(to.x + FRAME_WIDTH / 2, to.y + 8, { steps: 6 })
    await app.mouse.up()
    await expect(app.getByTestId('key-torso:rotate-15')).toHaveAttribute('data-selected', 'true')
    await expect(app.getByTestId('key-cape:rotate-30')).toHaveAttribute('data-selected', 'true')
    await expect(app.getByTestId('key-torso:rotate-0')).toHaveAttribute('data-selected', 'false')
    await expect(app.getByTestId('key-selection-count')).toHaveText('已選 4')
    await app.keyboard.press('Control+c')
    await seekRuler(app, 3)
    await app.keyboard.press('Control+v')
    await expect(app.getByTestId('key-torso:rotate-3')).toBeVisible()
    await expect(app.getByTestId('key-cape:rotate-18')).toBeVisible()
    await expect(app.getByTestId('key-selection-count')).toHaveText('已選 4')
    await app.keyboard.press('Delete')
    await expect(app.getByTestId('key-torso:rotate-3')).toHaveCount(0)
    await expect(app.getByTestId('key-cape:rotate-18')).toHaveCount(0)
    await expect(app.getByTestId('key-torso:rotate-15')).toBeVisible()
  })

  test('keeps changes pending without auto-key until K writes them, then saves JSON', async ({ app }) => {
    await enterAnimate(app, 'torso')
    await app.getByTestId('autokey-toggle').click()
    await expect(app.getByTestId('autokey-toggle')).toHaveAttribute('aria-pressed', 'false')
    await seekRuler(app, 12)
    await rotateGizmo(app, Math.PI / 8)
    await expect(app.getByTestId('pending-pose')).toContainText('torso')
    await expect(app.getByTestId('edit-undo')).toBeDisabled()
    await app.keyboard.press('k')
    await expect(app.getByTestId('pending-pose')).toHaveCount(0)
    await expect(app.getByTestId('key-torso:rotate-12')).toBeVisible()
    await expect(app.getByTestId('key-torso:translate-12')).toBeVisible()
    await expect(app.getByTestId('key-torso:scale-12')).toBeVisible()
    const [download] = await Promise.all([app.waitForEvent('download'), app.getByTestId('topbar-save-json').click()])
    const json = JSON.parse(readFileSync(await download.path(), 'utf8'))
    const rotate = json.animations.walk.bones.torso.rotate as Array<{ time?: number; value?: number }>
    const keyed = rotate.find((key) => Math.abs((key.time ?? 0) - 0.4) < 1e-4)
    expect(keyed).toBeDefined()
    expect(Math.abs(keyed!.value ?? 0)).toBeGreaterThan(10)
  })
})
