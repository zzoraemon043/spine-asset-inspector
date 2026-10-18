import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
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

async function seekRuler(page: Page, frame: number) {
  const box = await page.getByTestId('dopesheet-ruler').boundingBox()
  if (!box) throw new Error('ruler not visible')
  await page.mouse.click(box.x + frame * FRAME_WIDTH + FRAME_WIDTH / 2, box.y + box.height / 2)
  await expect(page.getByTestId('dopesheet-frame')).toHaveText(`第 ${frame} 格`)
}

async function enterAnimate(page: Page, animation = 'walk') {
  await page.getByTestId(`animation-item-${animation}`).click()
  await page.getByTestId('animate-mode-toggle').click()
  await expect(page.getByTestId('dopesheet')).toBeVisible()
}

async function commitField(page: Page, testId: string, value: string) {
  const input = page.getByTestId(testId)
  await input.fill(value)
  await input.press('Enter')
}

test.describe('curve editor and extended channels', () => {
  test('applies an easing preset and drags a bezier handle with undo', async ({ app }) => {
    await enterAnimate(app)
    await seekRuler(app, 6)
    const linear = await settledShot(app)
    await app.getByTestId('key-cape:rotate-0').click()
    await expect(app.getByTestId('curve-editor')).toBeVisible()
    await app.getByTestId('curve-preset-ease-in').click()
    await expect(app.getByTestId('segment-cape:rotate-0')).toHaveAttribute('data-kind', 'bezier')
    await expect(app.getByTestId('curve-graph')).toHaveAttribute('data-handles', '0.42,0,1,1')
    const eased = await settledShot(app)
    expect(eased.equals(linear)).toBe(false)
    const handle = await app.getByTestId('curve-handle-0').boundingBox()
    const graph = await app.getByTestId('curve-graph').boundingBox()
    await app.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2)
    await app.mouse.down()
    await app.mouse.move(graph!.x + graph!.width * 0.25, graph!.y + graph!.height * 0.25, { steps: 6 })
    await app.mouse.up()
    await expect(app.getByTestId('curve-graph')).not.toHaveAttribute('data-handles', '0.42,0,1,1')
    await expect(app.getByTestId('edit-undo')).toHaveAttribute('title', /調整曲線控制桿/)
    await app.getByTestId('edit-undo').click()
    await expect(app.getByTestId('curve-graph')).toHaveAttribute('data-handles', '0.42,0,1,1')
    await app.getByTestId('edit-undo').click()
    await expect(app.getByTestId('segment-cape:rotate-0')).toHaveAttribute('data-kind', 'linear')
    expect((await settledShot(app)).equals(linear)).toBe(true)
    await app.getByTestId('curve-kind-stepped').click()
    await expect(app.getByTestId('segment-cape:rotate-0')).toHaveAttribute('data-kind', 'stepped')
  })

  test('keys a hidden attachment and a fade-out on the head slot', async ({ app }) => {
    await enterAnimate(app)
    await app.getByTestId('tree-slot-head').click()
    await seekRuler(app, 8)
    const visible = await settledShot(app)
    await app.getByTestId('slot-key-attachment').selectOption('__none__')
    await expect(app.getByTestId('key-slot:head:attachment-8')).toBeVisible()
    const hidden = await settledShot(app)
    expect(hidden.equals(visible)).toBe(false)
    await app.getByTestId('edit-undo').click()
    await expect(app.getByTestId('key-slot:head:attachment-8')).toHaveCount(0)
    expect((await settledShot(app)).equals(visible)).toBe(true)
    await commitField(app, 'slot-key-alpha', '0.25')
    await expect(app.getByTestId('key-slot:head:rgba-8')).toBeVisible()
    await expect(app.getByTestId('slot-key-color')).toHaveValue('ffffff40')
    expect((await settledShot(app)).equals(visible)).toBe(false)
    await commitField(app, 'slot-key-color', 'ff000040')
    await expect(app.getByTestId('slot-key-swatch')).toHaveAttribute('style', /rgba\(255, 0, 0, 0\.25/)
  })

  test('adds an event key, edits parameters and saves them to JSON', async ({ app }) => {
    await enterAnimate(app)
    await seekRuler(app, 10)
    await app.getByTestId('event-add-name').selectOption('hit')
    await app.getByTestId('event-add').click()
    await expect(app.getByTestId('key-events-10')).toBeVisible()
    await expect(app.getByTestId('event-key-editor')).toBeVisible()
    await commitField(app, 'event-key-int', '9')
    await commitField(app, 'event-key-string', 'critical')
    await app.getByTestId('key-events-10').click()
    await expect(app.getByTestId('event-key-int')).toHaveValue('9')
    const [download] = await Promise.all([app.waitForEvent('download'), app.getByTestId('topbar-save-json').click()])
    const json = JSON.parse(readFileSync(await download.path(), 'utf8'))
    const added = (json.animations.walk.events as Array<Record<string, unknown>>).find((event) => event.name === 'hit')
    expect(added).toEqual({ time: 0.333333, name: 'hit', int: 9, string: 'critical' })
    const box = await app.getByTestId('key-events-10').boundingBox()
    await app.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await app.mouse.down()
    await app.mouse.move(box!.x + box!.width / 2 + FRAME_WIDTH * 4, box!.y + box!.height / 2, { steps: 5 })
    await app.mouse.up()
    await expect(app.getByTestId('key-events-14')).toBeVisible()
    await app.keyboard.press('Delete')
    await expect(app.getByTestId('key-events-14')).toHaveCount(0)
  })
})
