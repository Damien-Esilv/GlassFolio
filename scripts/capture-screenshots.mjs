#!/usr/bin/env node
/**
 * Captures the product screenshots used by the README and the showcase (public/screenshots/).
 *
 * Zero dependencies: drives a local Chrome/Chromium in headless mode over the DevTools protocol
 * with Node's built-in WebSocket. Start the app first (`npm run dev`), then:
 *
 *   npm run screenshots
 *   CHROME_PATH=/usr/bin/chromium npm run screenshots -- --base http://localhost:3000
 *
 * It signs in with the demo account (`/?demo=1`), so no personal data ends up in the images.
 */
/* global WebSocket -- built into Node 22+ */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, index, all) => {
    if (arg.startsWith('--')) pairs.push([arg.slice(2), all[index + 1]]);
    return pairs;
  }, [])
);

const BASE_URL = args.base ?? 'http://localhost:3000';
const OUT_DIR = path.resolve(args.out ?? 'public/screenshots');
/** README hero lives outside public/ so it never ships with (or weighs on) the site. */
const README_HERO = path.resolve('.github/assets/readme-hero.webp');
const README_MOCKUP = path.resolve('scripts/readme-mockup.html');
const THEME = args.theme ?? 'night';
const LANG = args.lang ?? 'en';
const DEBUG_PORT = 9333;
const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1.5 };
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

/** Pages to capture, in order. `settleMs` covers the mock DB delay, price refresh and chart animations. */
const SHOTS = [
  { name: 'dashboard', path: '/', settleMs: 14000 },
  { name: 'positions', path: '/positions', settleMs: 5000 },
  { name: 'analytics', path: '/analytics/performance', settleMs: 6000 },
  { name: 'fees', path: '/analytics/fees', settleMs: 5000 },
  { name: 'tax', path: '/tax', settleMs: 5000 },
  { name: 'import', path: '/import', settleMs: 4000 },
  { name: 'progress', path: '/progress', settleMs: 5000 },
  { name: 'ai-assistant', path: '/', settleMs: 4000, openAssistant: true },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findChrome() {
  const { access } = await import('node:fs/promises');
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try the next one
    }
  }
  throw new Error('Chrome not found. Set CHROME_PATH to a Chrome or Chromium executable.');
}

async function waitForDebugger() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting
    }
    await sleep(200);
  }
  throw new Error('Chrome did not expose a debuggable page.');
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const handlers = pending.get(message.id);
    if (!handlers) return;
    pending.delete(message.id);
    if (message.error) handlers.reject(new Error(`${message.error.message} (${message.error.code})`));
    else handlers.resolve(message.result);
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  return { ready, send, close: () => socket.close() };
}

async function evaluate(cdp, expression) {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.text);
  return result.value;
}

/** Client-side navigation keeps the unlocked demo session (a full reload would lock the vault). */
const goTo = (cdp, route) =>
  evaluate(cdp, `history.pushState({}, '', ${JSON.stringify(route)}); dispatchEvent(new PopStateEvent('popstate')); true`);

async function capture(cdp, file, format = 'webp') {
  const { data } = await cdp.send('Page.captureScreenshot', { format, quality: format === 'png' ? undefined : 74 });
  await writeFile(file, Buffer.from(data, 'base64'));
  console.log(`  ✓ ${path.relative(process.cwd(), file)}`);
}

async function main() {
  const chrome = await findChrome();
  const profileDir = await mkdtemp(path.join(tmpdir(), 'glassfolio-shots-'));
  const browser = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profileDir}`,
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  try {
    const cdp = connect(await waitForDebugger());
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, mobile: false });
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await mkdir(OUT_DIR, { recursive: true });

    console.log(`Signing in to the demo account on ${BASE_URL} …`);
    await cdp.send('Page.navigate', { url: `${BASE_URL}/?demo=1&theme=${THEME}&lang=${LANG}` });
    await sleep(6000);
    // Refuse optional analytics if the consent banner is shown (it would cover the page).
    await evaluate(
      cdp,
      `(() => { const b = [...document.querySelectorAll('button')].find((x) => /refuse|refuser/i.test(x.textContent)); b?.click(); return Boolean(b); })()`
    );

    for (const shot of SHOTS) {
      await goTo(cdp, shot.path);
      if (shot.openAssistant) {
        await sleep(1500);
        await evaluate(
          cdp,
          `(() => { const b = [...document.querySelectorAll('button')].find((x) => /assistant/i.test(x.textContent)); b?.click(); return Boolean(b); })()`
        );
      }
      await sleep(shot.settleMs);
      await capture(cdp, path.join(OUT_DIR, `${shot.name}.webp`));
      if (shot.openAssistant) await evaluate(cdp, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); true`);
    }

    // Social preview card (Open Graph): 1200×630, dashboard.
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
    await goTo(cdp, '/');
    await sleep(6000);
    await capture(cdp, path.join(OUT_DIR, 'og-cover.png'), 'png');

    // README hero: the fresh screenshots composed in browser frames (scripts/readme-mockup.html).
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1.5, mobile: false });
    await mkdir(path.dirname(README_HERO), { recursive: true });
    await cdp.send('Page.navigate', { url: pathToFileURL(README_MOCKUP).href });
    await sleep(2000);
    await capture(cdp, README_HERO);
    cdp.close();
  } finally {
    const exited = new Promise((resolve) => browser.once('exit', resolve));
    browser.kill();
    await exited;
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
