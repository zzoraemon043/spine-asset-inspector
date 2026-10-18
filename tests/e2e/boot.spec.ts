import { test, expect, stageShot, openTool } from './fixtures'

test.describe('boot and security', () => {
  test('starts with the procedural demo asset and renders it', async ({ app, issues }) => {
    await expect(app.getByTestId('asset-version')).toHaveText('v4.2.120')
    await expect(app.getByTestId('stat-bones')).toHaveText('18')
    await expect(app.getByTestId('animation-item-idle')).toHaveAttribute('aria-selected', 'true')
    for (const name of ['idle', 'walk', 'run', 'attack', 'shoot', 'hit', 'death']) await expect(app.getByTestId(`animation-item-${name}`)).toBeVisible()
    const first = await stageShot(app)
    await app.waitForTimeout(400)
    const second = await stageShot(app)
    expect(first.equals(second)).toBe(false)
    await expect.poll(async () => Number((await app.getByTestId('render-fps').textContent())?.split(' ')[0])).toBeGreaterThan(0)
    expect(issues.errors).toEqual([])
  })

  test('ships a strict content security policy that blocks network access', async ({ app, page }) => {
    const response = await page.request.get('/')
    const header = response.headers()['content-security-policy']
    expect(header).toContain("connect-src 'none'")
    expect(header).toContain("default-src 'none'")
    expect(header).toContain("frame-ancestors 'none'")
    const meta = await app.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
    expect(meta).toContain("script-src 'self'")
    expect(meta).not.toContain('unsafe-inline')
    expect(meta).not.toContain('unsafe-eval')
    const outcome = await app.evaluate(async () => {
      try {
        await fetch('https://example.com/telemetry', { mode: 'no-cors' })
        return 'reachable'
      } catch {
        return 'blocked'
      }
    })
    expect(outcome).toBe('blocked')
    await expect.poll(() => app.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations.join('|'))).toContain('connect-src')
  })

  test('renders no inline style or script violations during normal use', async ({ app, issues }) => {
    await openTool(app, 'debug')
    await app.getByTestId('debug-all-on').click()
    await app.getByTestId('export-open').click()
    await expect(app.getByTestId('export-dialog')).toBeVisible()
    await app.waitForTimeout(300)
    const violations = await app.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)
    expect(violations).toEqual([])
    expect(issues.errors).toEqual([])
  })
})
