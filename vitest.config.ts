import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) }

export default defineConfig({
  resolve: { alias },
  test: {
    globals: false,
    coverage: { provider: 'v8', include: ['src/core/**', 'src/store/**', 'src/controller/**'] },
    projects: [
      {
        resolve: { alias },
        test: { name: 'core', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        resolve: { alias },
        test: { name: 'dom', include: ['tests/unit/**/*.test.tsx'], environment: 'jsdom' },
      },
    ],
  },
})
