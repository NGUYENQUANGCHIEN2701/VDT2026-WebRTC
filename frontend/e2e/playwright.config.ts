import { defineConfig, devices } from '@playwright/test'

// Playwright config for the 1-1 P2P call E2E test.
// testDir is relative to this config file's own directory (frontend/e2e/),
// so it only picks up specs colocated here — never frontend/src/**.
export default defineConfig({
  testDir: './',
  // The call spec drives two browser contexts through a deterministic
  // caller/callee handshake — running it in parallel with itself (or other
  // future e2e specs) would race on shared backend state, so keep it serial.
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-fake-media',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
          ],
        },
      },
    },
  ],
})
