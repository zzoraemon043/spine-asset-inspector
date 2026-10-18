import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

const bundledChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const executablePath = process.env.PW_CHROMIUM_PATH ?? (existsSync(bundledChromium) ? bundledChromium : undefined)
const port = Number(process.env.E2E_PORT ?? 4319)

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    acceptDownloads: true,
    viewport: { width: 1600, height: 960 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1600, height: 960 },
        launchOptions: {
          executablePath,
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
        },
      },
    },
  ],
  webServer: {
    command: `${process.env.E2E_SKIP_BUILD ? '' : 'npx vite build && '}npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
