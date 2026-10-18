import type { Page } from '@playwright/test'
import { test, expect, stageShot } from './fixtures'
import { demoFileSet } from '../support/demoFiles'
import { ikFixtureJson } from '../support/ikFixture'

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

async function loadFixture(page: Page) {
  const set = demoFileSet()
  await page.getByTestId('file-input').setInputFiles([
    { name: 'ik-demo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(ikFixtureJson())) },
    { name: 'ik-demo.atlas', mimeType: 'text/plain', buffer: Buffer.from(set.atlas) },
    { name: set.names.png, mimeType: 'image/png', buffer: Buffer.from(set.png) },
  ])
  await expect(page.getByTestId('asset-name')).toHaveText('ik-demo')
}

async function point(page: Page, attribute: string) {
  const canvas = page.getByTestId('stage-canvas')
  const box = await canvas.boundingBox()
  const [x, y] = ((await canvas.getAttribute(attribute)) ?? '0,0').split(',').map(Number)
  return { x: box!.x + x, y: box!.y + y }
}

async function selectBone(page: Page, bone: string) {
  await page.getByTestId(`tree-bone-${bone}`).click()
  await expect(page.getByTestId('stage-canvas')).toHaveAttribute('data-gizmo-bone', bone)
}

async function enterAnimate(page: Page, animation: string) {
  await page.getByTestId(`animation-item-${animation}`).click()
  await page.getByTestId('animate-mode-toggle').click()
  await expect(page.getByTestId('dopesheet')).toBeVisible()
}

async function seekRuler(page: Page, frame: number) {
  const box = await page.getByTestId('dopesheet-ruler').boundingBox()
  await page.mouse.click(box!.x + frame * FRAME_WIDTH + FRAME_WIDTH / 2, box!.y + box!.height / 2)
  await expect(page.getByTestId('dopesheet-frame')).toHaveText(`第 ${frame} 格`)
}

test.describe('constraints, draw order, mesh deform and structure', () => {
  test('dragging the IK target bends the controlled arm chain', async ({ app }) => {
    await loadFixture(app)
    await app.getByTestId('setup-mode-toggle').click()
    await selectBone(app, 'arm-front-lower')
    const elbow = await point(app, 'data-gizmo-origin')
    await selectBone(app, 'aim')
    const aim = await point(app, 'data-gizmo-origin')
    await app.mouse.move(aim.x, aim.y)
    await app.mouse.down()
    await app.mouse.move(aim.x - 90, aim.y + 110, { steps: 10 })
    await app.mouse.up()
    await expect(app.getByTestId('edit-undo')).toBeEnabled()
    await selectBone(app, 'arm-front-lower')
    const moved = await point(app, 'data-gizmo-origin')
    expect(Math.hypot(moved.x - elbow.x, moved.y - elbow.y)).toBeGreaterThan(5)
    await expect(app.getByTestId('tree-constraint-ik-arm-ik')).toBeVisible()
  })

  test('keys an IK mix with the slider and a draw order change', async ({ app }) => {
    await loadFixture(app)
    await enterAnimate(app, 'walk')
    await seekRuler(app, 6)
    await app.getByTestId('tree-constraint-ik-arm-ik').click()
    await app.getByTestId('constraint-key-slider-mix').fill('0.2')
    await expect(app.getByTestId('key-ik:arm-ik-6')).toBeVisible()
    await app.getByTestId('tree-slot-arm-front-upper').click()
    await expect(app.getByTestId('draw-order-index')).toBeVisible()
    const before = await settledShot(app)
    const index = await app.getByTestId('draw-order-index').textContent()
    for (let step = 0; step < 8; step += 1) await app.getByTestId('draw-order-backward').click()
    await expect(app.getByTestId('key-draworder-6')).toBeVisible()
    await expect(app.getByTestId('draw-order-index')).not.toHaveText(index ?? '')
    expect((await settledShot(app)).equals(before)).toBe(false)
    for (let step = 0; step < 8; step += 1) await app.getByTestId('edit-undo').click()
    await expect(app.getByTestId('key-draworder-6')).toHaveCount(0)
    await expect(app.getByTestId('draw-order-index')).toHaveText(index ?? '')
    expect((await settledShot(app)).equals(before)).toBe(true)
  })

  test('drags a mesh vertex and keys the deform', async ({ app }) => {
    await enterAnimate(app, 'idle')
    await seekRuler(app, 5)
    await app.getByTestId('tree-slot-cape').click()
    await app.getByTestId('tree-slot-cape-toggle').click()
    await app.getByTestId('tree-attachment-cape-cape').click()
    await expect(app.getByTestId('mesh-selection')).toHaveText('已選 0 / 6')
    const canvas = app.getByTestId('stage-canvas')
    await expect(canvas).toHaveAttribute('data-mesh-vertices', /\[/)
    const box = await canvas.boundingBox()
    const vertices = JSON.parse((await canvas.getAttribute('data-mesh-vertices'))!) as Array<[number, number]>
    const before = await settledShot(app)
    const start = { x: box!.x + vertices[3][0], y: box!.y + vertices[3][1] }
    await app.mouse.move(start.x, start.y)
    await app.mouse.down()
    await app.mouse.move(start.x + 25, start.y + 20, { steps: 6 })
    await app.mouse.up()
    await expect(app.getByTestId('mesh-selection')).toHaveText('已選 1 / 6')
    await expect(app.getByTestId('key-slot:cape:deform:default|cape-5')).toBeVisible()
    const moved = JSON.parse((await canvas.getAttribute('data-mesh-vertices'))!) as Array<[number, number]>
    expect(moved[3][0] - vertices[3][0]).toBeCloseTo(25, -1)
    expect(moved[0]).toEqual(vertices[0])
    expect((await settledShot(app)).equals(before)).toBe(false)
    await app.getByTestId('edit-undo').click()
    await expect(app.getByTestId('key-slot:cape:deform:default|cape-5')).toHaveCount(0)
  })

  test('creates a blank animation and a new skin with a bound attachment', async ({ app }) => {
    await app.getByTestId('new-animation-name').fill('turn')
    await app.getByTestId('new-animation').click()
    await expect(app.getByTestId('animation-item-turn')).toBeVisible()
    await expect(app.getByTestId('properties-title')).toHaveText('turn')
    await app.getByTestId('tree-skeleton').click()
    await app.getByTestId('new-skin-name').fill('armor/gold')
    await app.getByTestId('new-skin').click()
    await expect(app.getByTestId('tree-skin-armor/gold')).toBeVisible()
    await app.getByTestId('skin-attachment-choice').selectOption('helmet/knight::helmet::helmet')
    await app.getByTestId('skin-attachment-add').click()
    await expect(app.getByTestId('skin-attachments')).toContainText('helmet / helmet')
    await app.getByTestId('skin-toggle-armor/gold').click()
    await expect(app.getByTestId('skin-toggle-armor/gold')).toBeChecked()
  })
})
