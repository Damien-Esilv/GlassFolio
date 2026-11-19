import { describe, it, expect } from 'vitest';
import {
  CoinGeckoSimplePriceSchema,
  YahooChartResponseSchema,
  YahooSearchResponseSchema,
} from '../../../src/services/contracts/externalSchemas';

const isLiveProbe = process.env.LIVE_CONTRACT_PROBE === '1';

/**
 * Tier 3 Nightly Upstream Contract Drift Probe.
 *
 * Skipped during deterministic PR / push CI (`LIVE_CONTRACT_PROBE !== '1'`) so third-party
 * rate limits never block developer branches or production promotions.
 * Executed on schedule in `.github/workflows/ci-nightly.yml`.
 */
describe.skipIf(!isLiveProbe)('Live Upstream API Contract Drift Probe (Tier 3 Nightly)', () => {
  it('Yahoo Finance v8 chart endpoint still conforms to YahooChartResponseSchema', async () => {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=5d', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GlassFolio contract-probe)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 429) return; // Upstream rate-limit on shared runner IP
    expect(res.ok).toBe(true);
    const json: unknown = await res.json();
    const parsed = YahooChartResponseSchema.safeParse(json);
    expect(parsed.success).toBe(true);
  });

  it('Yahoo Finance v1 search endpoint still conforms to YahooSearchResponseSchema', async () => {
    const res = await fetch('https://query1.finance.yahoo.com/v1/finance/search?q=AAPL&quotesCount=3', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GlassFolio contract-probe)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 429) return;
    expect(res.ok).toBe(true);
    const json: unknown = await res.json();
    const parsed = YahooSearchResponseSchema.safeParse(json);
    expect(parsed.success).toBe(true);
  });

  it('CoinGecko v3 simple price endpoint still conforms to CoinGeckoSimplePriceSchema', async () => {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 429) return;
    expect(res.ok).toBe(true);
    const json: unknown = await res.json();
    const parsed = CoinGeckoSimplePriceSchema.safeParse(json);
    expect(parsed.success).toBe(true);
  });
});
