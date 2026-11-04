import { test as base, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

interface IsolatedServerFixture {
  serverUrl: string;
  dataDir: string;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      if (address && typeof address === 'object') {
        const { port } = address;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('Unable to allocate free port')));
      }
    });
  });
}

async function waitForHealth(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // Server still booting
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for local E2E server health at ${url}/health`);
}

export const test = base.extend<IsolatedServerFixture>({
  // eslint-disable-next-line no-empty-pattern
  dataDir: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-e2e-vault-'));
    try {
      await use(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },

  serverUrl: async ({ dataDir }, use) => {
    const port = await getFreePort();
    const distDir = path.resolve(process.cwd(), 'dist');
    const serverScript = path.resolve(process.cwd(), 'server', 'docker-server.mjs');

    const child: ChildProcess = spawn(process.execPath, [serverScript], {
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        STATIC_DIR: distDir,
        DATA_DIR: dataDir,
      },
      stdio: 'ignore',
    });

    const url = `http://localhost:${port}`;
    try {
      await waitForHealth(`http://127.0.0.1:${port}`);
      await use(url);
    } finally {
      child.kill('SIGTERM');
    }
  },

  page: async ({ page, serverUrl }, use) => {
    // Intercept external/proxy Yahoo Finance requests for deterministic offline E2E runs
    await page.route('**/yf/**', async (route) => {
      const reqUrl = route.request().url();
      if (reqUrl.includes('/v8/finance/chart/')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            chart: {
              result: [
                {
                  meta: {
                    currency: 'USD',
                    symbol: 'AAPL',
                    regularMarketPrice: 195.5,
                    chartPreviousClose: 192.0,
                  },
                  timestamp: [1700000000],
                  indicators: {
                    quote: [{ close: [195.5] }],
                  },
                },
              ],
              error: null,
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ quotes: [] }),
      });
    });

    // Override baseURL navigation so page.goto('/...') resolves against the isolated server
    const originalGoto = page.goto.bind(page);
    page.goto = (url: string, options?: Parameters<Page['goto']>[1]) => {
      const resolved = url.startsWith('http://') || url.startsWith('https://')
        ? url
        : `${serverUrl}${url.startsWith('/') ? '' : '/'}${url}`;
      return originalGoto(resolved, options);
    };

    await use(page);
  },
});

/**
 * Client-side SPA navigation helper so React Router transitions without a full page reload
 * (preserving the zero-knowledge VaultKeyManager RAM key across routes).
 */
export async function navigateSpa(page: Page, targetPath: string): Promise<void> {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, targetPath);
}

/**
 * Runs WCAG 2.1 A/AA structural, ARIA, form-label & keyboard accessibility checks via @axe-core/playwright
 * and asserts zero raw untranslated i18n keys leak into visible text.
 * (Theme typography token contrast is verified deterministically in tests/unit/standards/wcagThemeContrast.test.ts).
 */
export async function expectAccessible(
  page: Page,
  options?: { enforceContrast?: boolean }
): Promise<void> {
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light');
  const shouldCheckContrast = options?.enforceContrast ?? false;

  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  if (!shouldCheckContrast) {
    builder = builder.disableRules(['color-contrast']);
  }

  const results = await builder.analyze();
  const blockingViolations = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(
    blockingViolations,
    `Blocking axe-core violations on ${page.url()} (theme=${theme}): ${JSON.stringify(
      blockingViolations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.map((n) => n.html),
      })),
      null,
      2
    )}`
  ).toEqual([]);

  const bodyText = await page.evaluate(() => document.body.innerText || '');
  expect(bodyText).not.toMatch(
    /\b(common|dashboard|portfolio|transactions|settings|security|auth|ai|gamification):[a-zA-Z0-9_.]+\b/
  );
}

export { expect };
