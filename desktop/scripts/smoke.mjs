#!/usr/bin/env node
/* global window, crypto -- these run inside the Electron page (page.evaluate), not in Node */
/**
 * Smoke test of the desktop shell: starts the real Electron app (throwaway profile), then checks from inside
 * its window that the local server, the CSP, the vault API, the MCP bridge config and the preload API all work.
 *
 *   npm run build:local && npm --prefix desktop ci && node desktop/scripts/smoke.mjs [--screenshot <file>]
 *   node desktop/scripts/smoke.mjs --executable <path to the packaged app binary>   (checks an installer build)
 *
 * Uses Playwright's Electron driver (playwright-core comes with the root devDependencies).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshotIndex = process.argv.indexOf('--screenshot');
const screenshotPath = screenshotIndex > -1 ? process.argv[screenshotIndex + 1] : null;
const executableIndex = process.argv.indexOf('--executable');
const packagedExecutable = executableIndex > -1 ? path.resolve(process.argv[executableIndex + 1]) : null;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'glassfolio-desktop-smoke-'));
const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(label);
};

// Electron lives in desktop/node_modules, not next to Playwright: hand its binary path over explicitly
const executablePath = packagedExecutable ?? createRequire(path.join(desktopDir, 'package.json'))('electron');

const app = await electron.launch({
  executablePath,
  args: [...(packagedExecutable ? [] : [desktopDir]), ...(process.env.CI ? ['--no-sandbox'] : [])],
  env: { ...process.env, GLASSFOLIO_DESKTOP_USER_DATA: profile },
  timeout: 60_000,
});

try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#root > *', { timeout: 30_000 });

  const url = new URL(page.url());
  check('window shows the local server on localhost', url.hostname === 'localhost' && /^\d+$/.test(url.port), page.url());
  check('default desktop port is used when free', Number(url.port) >= 3790 && Number(url.port) <= 3799, url.port);

  const probe = await page.evaluate(async () => {
    const info = await window.glassfolioDesktop?.getInfo?.();
    const vault = await fetch('/api/local-vault/config', { headers: { 'X-GlassFolio-Local': '1' } });
    const root = await fetch('/');
    const bridge = await fetch('/mcp/bridge/config');
    const bridgeBody = bridge.ok ? await bridge.json() : null;
    return {
      info,
      secure: window.isSecureContext,
      subtle: typeof crypto.subtle?.digest === 'function',
      vaultStatus: vault.status,
      csp: root.headers.get('content-security-policy') ?? '',
      bridgeStatus: bridge.status,
      bridgeHasToken: typeof bridgeBody?.token === 'string' && bridgeBody.token.length >= 16,
      hasNode: typeof window.require !== 'undefined' || typeof window.process !== 'undefined',
    };
  });

  check('preload API is exposed', typeof probe.info?.version === 'string' && probe.info.platform !== undefined, JSON.stringify(probe.info?.platform));
  check('node integration is off in the page', probe.hasNode === false);
  check('page is a secure context with Web Crypto', probe.secure && probe.subtle);
  check('vault API answers on the same origin', probe.vaultStatus === 200, String(probe.vaultStatus));
  check('CSP with Trusted Types is served', probe.csp.includes("require-trusted-types-for 'script'") && probe.csp.includes("script-src 'self'"));
  check('MCP bridge hands its token to the window', probe.bridgeStatus === 200 && probe.bridgeHasToken, String(probe.bridgeStatus));

  const state = await page.evaluate(() => window.glassfolioDesktop.getUpdateState());
  check('update state is readable', typeof state?.status === 'string', state?.strategy);

  const externalBlocked = await app.evaluate(({ BrowserWindow }) => {
    const [win] = BrowserWindow.getAllWindows();
    return win.webContents.getURL().startsWith('http://localhost:');
  });
  check('window stays on the local server', externalBlocked);

  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath });
    console.log(`screenshot: ${screenshotPath}`);
  }
} finally {
  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nDesktop smoke test passed.');
