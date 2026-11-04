#!/usr/bin/env node
/**
 * Verifies that Inter font digits (0-9) occupy identical horizontal width
 * when tabular figures ('tnum') and disambiguated lowercase l ('cv05') are active.
 *
 * Runs headless Chromium via Chrome DevTools Protocol (CDP) to measure exact pixel widths.
 */
/* global WebSocket */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DEBUG_PORT = 9335;
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findChrome() {
  const { stat } = await import('node:fs/promises');
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await stat(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error('No Chrome / Chromium binary found.');
}

async function waitForDebugger() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const pages = await res.json();
      const page = pages.find((p) => p.type === 'page');
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

async function main() {
  console.log('🔍 [Tabular Figures Verification] Starting headless Chromium verification...');
  const fontBuffer = await readFile(path.resolve('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'));
  const fontBase64 = fontBuffer.toString('base64');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 300 700;
  src: url('data:font/woff2;base64,${fontBase64}') format('woff2');
}
body {
  font-family: 'Inter', sans-serif;
  font-size: 32px;
  line-height: 1;
  margin: 0;
  padding: 20px;
}
.tabular {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' on, 'cv05' on;
}
.proportional {
  font-variant-numeric: normal;
  font-feature-settings: normal;
}
.digit-box {
  display: inline-block;
}
</style>
</head>
<body>
  <div id="test-container"></div>
</body>
</html>`;

  const chrome = await findChrome();
  const profileDir = await mkdtemp(path.join(tmpdir(), 'glassfolio-tnum-'));
  const browser = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profileDir}`,
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  try {
    const cdp = connect(await waitForDebugger());
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    const dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    await cdp.send('Page.navigate', { url: dataUri });
    await sleep(500);

    // Ensure font is loaded
    await evaluate(cdp, `document.fonts.load('32px Inter')`);
    await sleep(200);

    const themes = ['light', 'dark', 'night'];
    for (const theme of themes) {
      console.log(`\n🎨 Testing theme: [${theme}]`);
      const results = await evaluate(cdp, `
        (() => {
          document.documentElement.setAttribute('data-theme', '${theme}');
          const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

          // Measure tabular digits
          const tabularWidths = {};
          for (const d of digits) {
            const span = document.createElement('span');
            span.className = 'tabular digit-box';
            span.textContent = d;
            document.body.appendChild(span);
            tabularWidths[d] = span.getBoundingClientRect().width;
            document.body.removeChild(span);
          }

          // Measure proportional digits
          const propWidths = {};
          for (const d of digits) {
            const span = document.createElement('span');
            span.className = 'proportional digit-box';
            span.textContent = d;
            document.body.appendChild(span);
            propWidths[d] = span.getBoundingClientRect().width;
            document.body.removeChild(span);
          }

          return { tabularWidths, propWidths };
        })()
      `);

      const { tabularWidths, propWidths } = results;
      console.log(`  Tabular widths (0-9): ${JSON.stringify(tabularWidths)}`);
      console.log(`  Proportional width '1': ${propWidths['1'].toFixed(3)}px | '8': ${propWidths['8'].toFixed(3)}px`);

      // 1. Proportional check: '1' must be narrower than '8'
      if (propWidths['1'] >= propWidths['8']) {
        throw new Error(`Expected proportional '1' (${propWidths['1']}) to be narrower than '8' (${propWidths['8']})`);
      }

      // 2. Tabular check: '1' and '8' must have identical width
      const width1 = tabularWidths['1'];
      const width8 = tabularWidths['8'];
      const diff18 = Math.abs(width1 - width8);
      if (diff18 > 0.001) {
        throw new Error(`Theme ${theme}: Tabular '1' (${width1}) and '8' (${width8}) differ by ${diff18}px!`);
      }

      // 3. Tabular check: all digits 0-9 must have identical width
      const uniqueTabularWidths = new Set(Object.values(tabularWidths).map(w => Number(w.toFixed(2))));
      if (uniqueTabularWidths.size !== 1) {
        throw new Error(`Theme ${theme}: Not all tabular digits have equal width! Widths: ${JSON.stringify(tabularWidths)}`);
      }

      console.log(`  ✅ Tabular digits width equality confirmed: all digits exactly ${width1.toFixed(3)}px!`);
    }

    console.log('\n🎉 ALL TABULAR FIGURES TESTS PASSED SUCCESSFULLY ACROSS ALL THEMES!');
  } finally {
    browser.kill();
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('\n❌ Verification failed:', err.message);
  process.exit(1);
});
