import type { Page } from '@playwright/test'
import { test, expect, stageShot } from './fixtures'

type Point = { x: number; y: number }

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

async function canvasBox(page: Page) {
  const box = await page.getByTestId('stage-canvas').boundingBox()
  if (!box) throw new Error('stage canvas not visible')
  return box
}

async function attrPoint(page: Page, name: string): Promise<Point> {
  const value = await page.getByTestId('stage-canvas').getAttribute(name)
  if (!value) throw new Error(`missing ${name}`)
  const [x, y] = value.split(',').map(Number)
  const box = await canvasBox(page)
  return { x: box.x + x, y: box.y + y }
}

async function handlePoint(page: Page, handle: string): Promise<Point> {
  const value = await page.getByTestId('stage-canvas').getAttribute('data-gizmo-handles')
  const handles = JSON.parse(value ?? '{}') as Record<string, [number, number]>
  const box = await canvasBox(page)
  return { x: box.x + handles[handle][0], y: box.y + handles[handle][1] }
}

async function enterSetup(page: Page, bone: string) {
  await page.getByTestId('setup-mode-toggle').click()
  await expect(page.getByTestId('stage-canvas')).toHaveAttribute('data-setup-mode', 'on')
  await expect(page.getByTestId('play-toggle')).toHaveAttribute('data-state', 'paused')
  await page.getByTestId(`tree-bone-${bone}`).click()
  await expect(page.getByTestId('stage-canvas')).toHaveAttribute('data-gizmo-bone', bone)
}

async function selectBone(page: Page, bone: string) {
  await page.getByTestId(`tree-bone-${bone}`).click()
  await expect(page.getByTestId('stage-canvas')).toHaveAttribute('data-gizmo-bone', bone)
}

async function drag(page: Page, from: Point, to: Point, during?: () => Promise<void>) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 12 })
  if (during) await during()
  await page.mouse.up()
}

test.describe('setup mode gizmo', () => {
  test('translates a bone with live panel values, one history entry and undo', async ({ app }) => {
    await app.getByTestId('advanced-toggle').click()
    await app.getByTestId('tab-history').click()
    await enterSetup(app, 'torso')
    const before = await settledShot(app)
    const startX = await app.getByTestId('edit-bone-x').inputValue()
    const origin = await attrPoint(app, 'data-gizmo-origin')
    await drag(app, origin, { x: origin.x + 60, y: origin.y - 30 }, async () => {
      await expect(app.getByTestId('edit-bone-x')).not.toHaveValue(startX)
      await expect(app.getByTestId('hud-gizmo-preview')).toBeVisible()
      await expect(app.getByTestId('edit-undo')).toBeDisabled()
    })
    await expect(app.getByTestId('edit-undo')).toBeEnabled()
    await expect(app.getByTestId('hud-gizmo-preview')).toHaveCount(0)
    const box = await canvasBox(app)
    await app.mouse.move(box.x + 8, box.y + box.height - 8)
    const moved = await attrPoint(app, 'data-gizmo-origin')
    expect(moved.x - origin.x).toBeCloseTo(60, -1)
    expect(moved.y - origin.y).toBeCloseTo(-30, -1)
    expect((await settledShot(app)).equals(before)).toBe(false)
    await expect(app.getByTestId('history-list').locator('li')).toHaveCount(2)
    await expect(app.getByTestId('history-entry-1')).toContainText('移動骨骼 torso')
    await app.getByTestId('edit-undo').click()
    await expect(app.getByTestId('edit-bone-x')).toHaveValue(startX)
    expect((await settledShot(app)).equals(before)).toBe(true)
  })

  test('rotating a parent carries its child bones', async ({ app }) => {
    await enterSetup(app, 'head')
    const headBefore = await attrPoint(app, 'data-gizmo-origin')
    await selectBone(app, 'torso')
    await app.getByTestId('gizmo-mode-rotate').click()
    await expect(app.getByTestId('stage-canvas')).toHaveAttribute('data-gizmo-mode', 'rotate')
    const origin = await attrPoint(app, 'data-gizmo-origin')
    const knob = await handlePoint(app, 'rotate')
    const radius = Math.hypot(knob.x - origin.x, knob.y - origin.y)
    const start = Math.atan2(knob.y - origin.y, knob.x - origin.x)
    const target = { x: origin.x + Math.cos(start - Math.PI / 6) * radius, y: origin.y + Math.sin(start - Math.PI / 6) * radius }
    const rotation = Number(await app.getByTestId('edit-bone-rotation').inputValue())
    await drag(app, knob, target)
    await expect.poll(async () => Number(await app.getByTestId('edit-bone-rotation').inputValue())).toBeGreaterThan(rotation + 25)
    expect(Number(await app.getByTestId('edit-bone-rotation').inputValue())).toBeLessThan(rotation + 35)
    await selectBone(app, 'head')
    const headAfter = await attrPoint(app, 'data-gizmo-origin')
    expect(Math.hypot(headAfter.x - headBefore.x, headAfter.y - headBefore.y)).toBeGreaterThan(10)
    const reach = Math.hypot(headBefore.x - origin.x, headBefore.y - origin.y)
    expect(Math.hypot(headAfter.x - origin.x, headAfter.y - origin.y)).toBeCloseTo(reach, -1)
  })

  test('scales along the bone axis with snapping', async ({ app }) => {
    await enterSetup(app, 'torso')
    await app.keyboard.press('r')
    await expect(app.getByTestId('stage-canvas')).toHaveAttribute('data-gizmo-mode', 'scale')
    await app.getByTestId('gizmo-snap').click()
    const origin = await attrPoint(app, 'data-gizmo-origin')
    const handle = await handlePoint(app, 'scale-x')
    await drag(app, handle, { x: origin.x + (handle.x - origin.x) * 1.5, y: origin.y + (handle.y - origin.y) * 1.5 })
    await expect(app.getByTestId('edit-bone-scaleX')).toHaveValue('1.5')
    await expect(app.getByTestId('edit-bone-scaleY')).toHaveValue('1')
  })

  test('picks bones on the canvas and cancels drags with Escape', async ({ app }) => {
    await enterSetup(app, 'arm-front-lower')
    const origin = await attrPoint(app, 'data-gizmo-origin')
    const tip = await attrPoint(app, 'data-gizmo-tip')
    await app.getByTestId('tree-skeleton').click()
    await expect(app.getByTestId('stage-canvas')).not.toHaveAttribute('data-gizmo-bone', /./)
    await app.mouse.click((origin.x + tip.x) / 2, (origin.y + tip.y) / 2)
    await expect(app.getByTestId('properties-title')).toHaveText('arm-front-lower')
    await expect(app.getByTestId('stage-canvas')).toHaveAttribute('data-gizmo-bone', 'arm-front-lower')
    const startX = await app.getByTestId('edit-bone-x').inputValue()
    await app.mouse.move(origin.x, origin.y)
    await app.mouse.down()
    await app.mouse.move(origin.x + 80, origin.y, { steps: 8 })
    await app.keyboard.press('Escape')
    await app.mouse.up()
    await expect(app.getByTestId('edit-bone-x')).toHaveValue(startX)
    await expect(app.getByTestId('edit-undo')).toBeDisabled()
  })

  test('panel edits redraw the canvas and the gizmo immediately', async ({ app }) => {
    await enterSetup(app, 'head')
    const headBefore = await attrPoint(app, 'data-gizmo-origin')
    await selectBone(app, 'torso')
    const before = await settledShot(app)
    const field = app.getByTestId('edit-bone-rotation')
    await field.fill(String(Number(await field.inputValue()) + 40))
    await field.press('Enter')
    expect((await settledShot(app)).equals(before)).toBe(false)
    await selectBone(app, 'head')
    const headAfter = await attrPoint(app, 'data-gizmo-origin')
    expect(Math.hypot(headAfter.x - headBefore.x, headAfter.y - headBefore.y)).toBeGreaterThan(10)
    await app.getByTestId('play-toggle').click()
    await expect(app.getByTestId('stage-canvas')).toHaveAttribute('data-setup-mode', 'off')
    await expect(app.getByTestId('play-toggle')).toHaveAttribute('data-state', 'playing')
  })
})
