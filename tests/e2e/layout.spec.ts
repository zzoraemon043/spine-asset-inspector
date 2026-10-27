import { test, expect } from './fixtures'

for (const width of [390, 768, 1024, 1280]) {
  test(`fits a ${width} px wide window without horizontal scrolling`, async ({ app }) => {
    await app.setViewportSize({ width, height: 800 })
    await expect
      .poll(() => app.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width)
    const header = await app.getByTestId('top-bar').evaluate((element) => element.scrollWidth - element.clientWidth)
    expect(header).toBeLessThanOrEqual(0)
    const stage = await app.getByTestId('stage-canvas').boundingBox()
    expect(stage?.width ?? 0).toBeGreaterThan(width < 1024 ? width * 0.8 : width - 400)
    const panel = await app.getByTestId('side-panel').boundingBox()
    expect(panel?.width ?? 0).toBeLessThanOrEqual(width < 1024 ? width : 340)
  })
}
