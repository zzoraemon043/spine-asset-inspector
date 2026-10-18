import { test, expect, openTool } from './fixtures'

test.describe('event monitor', () => {
  test('records custom events with parameters', async ({ app }) => {
    await app.getByTestId('animation-item-walk').click()
    await openTool(app, 'events')
    await expect(app.locator('[data-testid="event-row"][data-event="step"]').first()).toBeVisible({ timeout: 5000 })
    await expect(app.locator('[data-testid="event-row"]').first()).toContainText('walk')
    await expect(app.getByTestId('event-count-badge')).toBeVisible()
    await app.getByTestId('animation-item-attack').click()
    await expect(app.locator('[data-testid="event-row"][data-event="hit"]').first()).toContainText('i=25', { timeout: 5000 })
    await expect(app.locator('[data-testid="event-row"][data-event="hit"]').first()).toContainText('s="slash"')
    await expect(app.locator('[data-testid="event-row"][data-event="hit"]').first()).toContainText('0.400s')
  })

  test('filters, pauses, records lifecycle and clears', async ({ app }) => {
    await app.getByTestId('animation-item-run').click()
    await openTool(app, 'events')
    await expect(app.locator('[data-testid="event-row"]').first()).toBeVisible({ timeout: 5000 })
    await app.getByTestId('event-filter').fill('zzz')
    await expect(app.locator('[data-testid="event-row"]')).toHaveCount(0)
    await app.getByTestId('event-filter').fill('')
    await app.getByTestId('event-lifecycle').click()
    await app.getByTestId('animation-item-hit').click()
    await expect(app.locator('[data-testid="event-row"][data-kind="start"]').first()).toBeVisible({ timeout: 5000 })
    await app.getByTestId('event-capture').click()
    await app.getByTestId('event-clear').click()
    await app.getByTestId('animation-item-walk').click()
    await app.waitForTimeout(1200)
    await expect(app.locator('[data-testid="event-row"]')).toHaveCount(0)
  })
})
