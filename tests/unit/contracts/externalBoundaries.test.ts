import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CoinGeckoSearchResponseSchema,
  CoinGeckoSimplePriceSchema,
  CreateGoalArgsSchema,
  PriceCacheSchema,
  SupabaseVaultHeaderRowsSchema,
  SupabaseVaultRecordRowsSchema,
  YahooChartResponseSchema,
  YahooSearchResponseSchema,
} from '../../../src/services/contracts/externalSchemas';
import { refreshPositionPrices, clearPriceCache } from '../../../src/services/priceService';
import { searchLiveAssets, fetchAssetHistory } from '../../../src/services/assetSearchService';
import { supabaseClient } from '../../../src/services/supabase/supabaseClient';
import { createGoalTool } from '../../../src/services/ai/tools/goalTools';
import { appStorage } from '../../../src/services/storage/appStorage';

describe('External API, Cache & AI Tool Runtime Zod Contracts (TGLA-211)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearPriceCache();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://mock-contract.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'mock-anon-key-contract');
    process.env.VITE_SUPABASE_URL = 'https://mock-contract.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key-contract';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    clearPriceCache();
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
  });

  describe('PriceCacheSchema & Corrupted Timestamp Expiry Regression', () => {
    it('rejects cache payloads with corrupted fetchedAt timestamps (NaN expiry bug)', async () => {
      // Previously, Date.now() - new Date("corrupted").getTime() evaluated to NaN,
      // and NaN > CACHE_TTL_MS evaluated to false, locking stale prices forever.
      appStorage.setItem(
        'gf_price_cache',
        JSON.stringify({
          data: { AAPL: 9999.99 },
          fetchedAt: 'not-a-valid-iso-date',
        })
      );

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          chart: {
            result: [{ meta: { symbol: 'AAPL', regularMarketPrice: 225.5, currency: 'USD' } }],
          },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const updated = await refreshPositionPrices([
        {
          id: 'p1',
          instrument: 'Apple',
          symbol: 'AAPL',
          quantity: 1,
          avgCost: 150,
          lastPrice: 150,
          marketValue: 150,
          unrealizedPL: 0,
          unrealizedPLPercent: 0,
          currency: 'USD',
          type: 'Stock',
        },
      ]);

      expect(mockFetch).toHaveBeenCalled();
      expect(updated[0]?.lastPrice).toBe(225.5);
    });

    it('rejects stringified, negative, or non-finite numbers in PriceCacheSchema', () => {
      expect(
        PriceCacheSchema.safeParse({
          data: { AAPL: '225.50' },
          fetchedAt: new Date().toISOString(),
        }).success
      ).toBe(false);

      expect(
        PriceCacheSchema.safeParse({
          data: { AAPL: -10 },
          fetchedAt: new Date().toISOString(),
        }).success
      ).toBe(false);

      expect(
        PriceCacheSchema.safeParse({
          data: { AAPL: 225.5 },
          fetchedAt: new Date().toISOString(),
        }).success
      ).toBe(true);
    });
  });

  describe('Yahoo Finance & CoinGecko Upstream Contracts', () => {
    it('validates legitimate Yahoo Chart & Search payloads and rejects stringified/negative prices', () => {
      expect(
        YahooChartResponseSchema.safeParse({
          chart: {
            result: [
              {
                meta: { symbol: 'CW8.PA', regularMarketPrice: 540.25, currency: 'EUR' },
                timestamp: [1700000000, 1700086400],
                indicators: { quote: [{ close: [535.1, null, 540.25] }] },
              },
            ],
            error: null,
          },
        }).success
      ).toBe(true);

      expect(
        YahooChartResponseSchema.safeParse({
          chart: {
            result: [{ meta: { symbol: 'CW8.PA', regularMarketPrice: '540.25' } }],
          },
        }).success
      ).toBe(false);

      expect(
        YahooSearchResponseSchema.safeParse({
          quotes: [{ symbol: 'AAPL', shortname: 'Apple Inc.', quoteType: 'EQUITY' }],
        }).success
      ).toBe(true);
    });

    it('validates CoinGecko simple price and search schemas', () => {
      expect(CoinGeckoSimplePriceSchema.safeParse({ bitcoin: { usd: 68500.5 } }).success).toBe(true);
      expect(CoinGeckoSimplePriceSchema.safeParse({ bitcoin: { usd: -1 } }).success).toBe(false);
      expect(
        CoinGeckoSearchResponseSchema.safeParse({
          coins: [{ id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', market_cap_rank: 1 }],
        }).success
      ).toBe(true);
    });

    it('gracefully drops malformed upstream market responses in searchLiveAssets & fetchAssetHistory', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ quotes: 'malformed-not-an-array', chart: { result: 'corrupt' } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const searchResults = await searchLiveAssets('AAPL');
      expect(searchResults).toEqual([]);

      const history = await fetchAssetHistory('AAPL', '1Y');
      expect(history).toEqual([]);
    });
  });

  describe('Supabase PostgREST Vault Contracts', () => {
    it('throws a descriptive error when Supabase returns a non-array or malformed vault header row', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ user_id: 'usr-1', header_json: 'not-an-object', totp_enabled: false }],
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(supabaseClient.getVaultHeader('tok-123')).rejects.toThrow(
        /Malformed vault header response/i
      );
    });

    it('throws a descriptive error when Supabase returns vault records missing ciphertext', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ record_key: 'glassfolio_transactions', ciphertext: '' }],
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(supabaseClient.getVaultRecords('tok-123')).rejects.toThrow(
        /Malformed vault records response/i
      );
    });

    it('accepts valid PostgREST vault header and record projections', () => {
      expect(
        SupabaseVaultHeaderRowsSchema.safeParse([
          {
            user_id: 'u1',
            header_json: { version: 1, wrappedKeys: {} },
            totp_enabled: true,
          },
        ]).success
      ).toBe(true);

      expect(
        SupabaseVaultRecordRowsSchema.safeParse([
          {
            record_key: 'glassfolio_transactions',
            ciphertext: '{"v":1,"alg":"A256GCM","iv":"abc","ct":"def"}',
          },
        ]).success
      ).toBe(true);
    });
  });

  describe('AI / MCP Tool Input Contracts', () => {
    it('rejects negative, NaN, or empty-title arguments in createGoalTool before persistence', async () => {
      const negResult = await createGoalTool.execute({ title: 'House', targetAmount: -5000 }, {});
      expect(negResult.success).toBe(false);
      expect(negResult.goalId).toBe('');

      const emptyTitleResult = await createGoalTool.execute({ title: '   ', targetAmount: 10000 }, {});
      expect(emptyTitleResult.success).toBe(false);

      expect(
        CreateGoalArgsSchema.safeParse({
          title: 'Emergency Fund',
          targetAmount: 15000,
          deadline: '2027-12-31',
        }).success
      ).toBe(true);
    });
  });
});
