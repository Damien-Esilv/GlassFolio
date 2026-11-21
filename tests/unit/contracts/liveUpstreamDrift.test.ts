import { describe, it, expect } from 'vitest';
import {
  CoinGeckoSimplePriceSchema,
  EsploraAddressSchema,
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

  // Watch-only wallets (TGLA-221), on the public addresses used by the demo
  it('Blockstream Esplora still answers address stats for the Electrum docs address', async () => {
    const res = await fetch('https://blockstream.info/api/address/bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 429) return;
    expect(res.ok).toBe(true);
    expect(EsploraAddressSchema.safeParse(await res.json()).success).toBe(true);
  });

  it('PublicNode Ethereum RPC still answers balances and token calls in one batch (vitalik.eth)', async () => {
    const owner = 'd8da6bf26964af9d7eed9e03e53415d37aa96045';
    const res = await fetch('https://ethereum-rpc.publicnode.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 0, method: 'eth_getBalance', params: [`0x${owner}`, 'latest'] },
        { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', data: `0x70a08231${owner.padStart(64, '0')}` }, 'latest'] },
      ]),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 429) return;
    expect(res.ok).toBe(true);
    const json = await res.json() as Array<{ result?: string }>;
    expect(json.every(entry => typeof entry.result === 'string' && entry.result.startsWith('0x'))).toBe(true);
  });

  it('PublicNode Solana RPC still answers getBalance (Solana docs example wallet)', async () => {
    const res = await fetch('https://solana-rpc.publicnode.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ jsonrpc: '2.0', id: 0, method: 'getBalance', params: ['vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg'] }]),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 429) return;
    expect(res.ok).toBe(true);
    const [entry] = await res.json() as Array<{ result?: { value?: number } }>;
    expect(typeof entry.result?.value).toBe('number');
  });
});
