import { describe, it, expect, vi, afterEach } from 'vitest';

describe('marketData (E31 — TGLA-136)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses the same-origin /yf proxy in local mode', async () => {
    vi.stubEnv('VITE_DEPLOYMENT_MODE', 'local');
    const { yahooFinanceUrl } = await import('../../../src/config/marketData');
    expect(yahooFinanceUrl('/v8/finance/chart/AAPL')).toBe('/yf/v8/finance/chart/AAPL');
  });

  it('exposes the proxy decision', async () => {
    vi.stubEnv('VITE_DEPLOYMENT_MODE', 'local');
    const { usesYahooProxy } = await import('../../../src/config/marketData');
    expect(usesYahooProxy()).toBe(true);
  });
});
