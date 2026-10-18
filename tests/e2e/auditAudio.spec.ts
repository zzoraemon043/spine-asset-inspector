import { test, expect, openTool } from './fixtures'
import { encodeWav, synthesizeClicks } from '../support/wav'

function clickWav(clicks: number[]): Buffer {
  return Buffer.from(encodeWav(synthesizeClicks({ sampleRate: 22050, duration: 1, clicks }), 22050))
}

test.describe('performance auditor', () => {
  test('grades the demo skeleton and reacts to pose changes', async ({ app }) => {
    await openTool(app, 'audit')
    await expect(app.getByTestId('audit-grade')).toHaveText('優良')
    await expect(app.getByTestId('audit-grade')).toHaveAttribute('data-level', 'good')
    await expect(app.getByTestId('audit-value-bones')).toHaveText('18')
    await expect(app.getByTestId('audit-value-slots')).toHaveText('18')
    await expect(app.getByTestId('audit-value-totalVertices')).toHaveText('82')
    await expect(app.getByTestId('audit-value-activeVertices')).toHaveText('70')
    await expect(app.getByTestId('audit-value-ikConstraints')).toHaveText('0')
    await expect(app.locator('[data-testid^="audit-metric-"]')).toHaveCount(15)
    await expect(app.getByTestId('audit-grade-dot')).toBeVisible()
    for (const skin of ['armor/red', 'helmet/knight', 'weapon/sword']) await app.getByTestId(`skin-toggle-${skin}`).uncheck()
    await expect(app.getByTestId('audit-value-activeVertices')).toHaveText('58')
  })
})

test.describe('audio event sync', () => {
  test('loads a clip, renders the waveform and aligns events', async ({ app }) => {
    await app.getByTestId('animation-item-walk').click()
    await openTool(app, 'audio')
    await app.getByTestId('audio-input').setInputFiles({ name: 'step.wav', mimeType: 'audio/wav', buffer: clickWav([0.0, 0.5]) })
    await expect(app.getByTestId('audio-clip-step')).toContainText('起音點 2')
    await expect(app.getByTestId('audio-waveform')).toBeVisible()
    await expect(app.getByTestId('timeline-waveform')).toBeVisible()
    await expect(app.getByTestId('audio-onset')).toHaveCount(2)
    const rows = app.getByTestId('audio-alignment-row')
    await expect(rows).toHaveCount(2)
    await expect(rows.first()).toHaveAttribute('data-status', 'aligned')
    await expect(app.getByTestId('audio-bind-step')).not.toHaveValue('')
    await expect.poll(async () => Number.parseInt(((await app.getByTestId('audio-trigger-count').textContent()) ?? '').replace(/\D/g, '') || '0', 10), { timeout: 8000 }).toBeGreaterThan(0)
    await app.getByTestId('audio-offset').fill('0.1')
    await expect(app.getByTestId('audio-offset-value')).toHaveText('+100ms')
    await expect(rows.first()).toHaveAttribute('data-status', 'off')
    await app.getByTestId('audio-suggest-offset').click()
    await expect(rows.first()).toHaveAttribute('data-status', 'aligned')
  })

  test('plays timeline sync and stops on pause', async ({ app }) => {
    await app.getByTestId('animation-item-run').click()
    await openTool(app, 'audio')
    await app.getByTestId('audio-input').setInputFiles({ name: 'music.wav', mimeType: 'audio/wav', buffer: clickWav([0.1, 0.4]) })
    await app.getByTestId('audio-play-sync').click()
    await expect(app.getByTestId('audio-sync-state')).toHaveText('播放中')
    await app.getByTestId('play-toggle').click()
    await expect(app.getByTestId('audio-sync-state')).toHaveText('待命')
    await app.getByTestId('audio-remove-music').click()
    await expect(app.getByTestId('audio-clip-music')).toHaveCount(0)
  })

  test('accepts audio dropped on the stage without replacing the asset', async ({ app }) => {
    const base64 = clickWav([0.2]).toString('base64')
    await app.getByTestId('stage').evaluate((stage, payload) => {
      const binary = atob(payload)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'fx.wav', { type: 'audio/wav' }))
      stage.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
    }, base64)
    await openTool(app, 'audio')
    await expect(app.getByTestId('tab-audio')).toContainText('1')
    await expect(app.getByTestId('audio-clip-fx')).toBeVisible()
    await expect(app.getByTestId('asset-name')).toHaveText('inspector-demo')
  })
})
