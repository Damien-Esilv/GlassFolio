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
if (!globalThis.crypto?.subtle) {
  const { webcrypto } = await import('node:crypto');
  globalThis.crypto = webcrypto as unknown as Crypto;
}

// ── fetch stub ─────────────────────────────────────────────────────────────
// All external network calls must be mocked in tests.
// Default: throw if fetch is called without explicit vi.fn() override.
if (!globalThis.fetch) {
  globalThis.fetch = vi.fn().mockRejectedValue(
    new Error('[TEST] Unmocked fetch call — use vi.fn() to mock this request.')
  );
}

// ── IntersectionObserver stub for jsdom ───────────────────────────────────
if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class MockIntersectionObserver {
    readonly root: Element | null = null;
    readonly rootMargin: string = '';
    readonly thresholds: ReadonlyArray<number> = [];
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn(() => []);
  } as unknown as typeof IntersectionObserver;
}

// ── Canvas 2D context stub for jsdom ──────────────────────────────────────
if (typeof HTMLCanvasElement !== 'undefined') {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (contextId: string, ...args: any[]) {
    if (contextId === '2d') {
      return {
        canvas: this,
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        scale: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        setTransform: vi.fn(),
        resetTransform: vi.fn(),
        drawImage: vi.fn(),
        createLinearGradient: vi.fn(() => ({
          addColorStop: vi.fn(),
        })),
        measureText: vi.fn(() => ({ width: 0 })),
        fillStyle: '#000',
        strokeStyle: '#000',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        filter: 'none',
      } as unknown as RenderingContext;
    }
    return originalGetContext ? originalGetContext.call(this, contextId, ...args) : null;
  } as any;
}

