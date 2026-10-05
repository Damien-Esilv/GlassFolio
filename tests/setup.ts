/**
 * Vitest global test setup
 * - Polyfills browser APIs not available in jsdom
 * - Resets localStorage between tests
 * - Extends Jest matchers via @testing-library/jest-dom
 */

import '@testing-library/jest-dom';
import { vi, beforeEach, afterEach } from 'vitest';

// ── localStorage mock ──────────────────────────────────────────────────────
// jsdom provides localStorage but we reset it between tests to ensure isolation.
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

// ── Web Crypto polyfill for Node/jsdom ─────────────────────────────────────
// Vitest runs in Node; jsdom exposes crypto but subtle.digest may be missing.
// @ts-expect-error – globalThis typing
if (!globalThis.crypto?.subtle) {
  const { webcrypto } = await import('node:crypto');
  // @ts-expect-error – patching globalThis
  globalThis.crypto = webcrypto;
}

// ── fetch stub ─────────────────────────────────────────────────────────────
// All external network calls must be mocked in tests.
// Default: throw if fetch is called without explicit vi.fn() override.
if (!globalThis.fetch) {
  globalThis.fetch = vi.fn().mockRejectedValue(
    new Error('[TEST] Unmocked fetch call — use vi.fn() to mock this request.')
  );
}
