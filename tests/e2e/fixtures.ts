import { test as base, expect, type Page } from '@playwright/test'

export interface PageIssues {
  readonly errors: string[]
  readonly violations: string[]
}

export const test = base.extend<{ issues: PageIssues; app: Page }>({
  issues: async ({}, use) => {
    await use({ errors: [], violations: [] })
  },
  app: async ({ page, issues }, use) => {
    page.on('pageerror', (error) => issues.errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') issues.errors.push(message.text())
    })
    await page.addInitScript(() => {
      const store: string[] = []
      Object.defineProperty(window, '__cspViolations', { value: store })
      document.addEventListener('securitypolicyviolation', (event) => store.push(`${event.violatedDirective} ${event.blockedURI}`))
    })
    await page.goto('/')
    await expect(page.getByTestId('load-status')).toHaveAttribute('data-status', 'ready')
    await expect(page.getByTestId('asset-name')).toHaveText('inspector-demo')
    await use(page)
  },
})

export { expect }

export async function stageShot(page: Page): Promise<Buffer> {
  return page.getByTestId('stage-canvas').screenshot()
}

export async function pause(page: Page): Promise<void> {
  const toggle = page.getByTestId('play-toggle')
  if ((await toggle.getAttribute('data-state')) === 'playing') await toggle.click()
  await expect(toggle).toHaveAttribute('data-state', 'paused')
}

export async function readFrame(page: Page): Promise<number> {
  return Number(await page.getByTestId('frame-display').textContent())
}

export async function readTime(page: Page): Promise<number> {
  return Number.parseFloat((await page.getByTestId('time-display').textContent()) ?? '0')
}

export async function openTool(page: Page, tab: string): Promise<void> {
  if ((await page.getByTestId('advanced-drawer').count()) === 0) await page.getByTestId('advanced-toggle').click()
  await page.getByTestId(`tab-${tab}`).click()
}
