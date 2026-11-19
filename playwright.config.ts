import { defineConfig, devices } from '@playwright/test';

/**
 * GlassFolio — Playwright End-to-End & Accessibility Configuration
 *
 * Two execution tiers:
 *  - `chromium-core`  (Tier 1): Fast deterministic critical user journeys + `@axe-core/playwright`
 *                               accessibility gates (`tests/e2e/*.core.spec.ts`).
 *  - `chromium-tier2` (Tier 2): Offline-to-online sync chaos, multi-tab vault lock propagation,
 *                               and 5-theme visual stability (`tests/e2e/*.tier2.spec.ts`).
 *
 * Each test spawns an isolated ephemeral `server/docker-server.mjs` instance via `tests/e2e/fixtures.ts`
 * backed by a temporary `DATA_DIR` so parallel workers never share vault headers or encrypted records.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
  },
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    viewport: { width: 1280, height: 800 },
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium-core',
      testMatch: /.*\.core\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-tier2',
      testMatch: /.*\.tier2\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
