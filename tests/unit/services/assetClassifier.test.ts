/**
 * assetClassifier — what an asset is, from the file, the account and (best effort) market-data lookups.
 * No real network: fetch is stubbed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  classifyAsset,
  clearAssetClassCache,
  defaultTypeForAccount,
  isAssetLookupEnabled,
  mapYahooQuoteType,
  setAssetLookupEnabled,
} from '../../../src/services/assetClassifier';

const mockFetch = vi.fn();

const yahoo = (...quotes: Array<Record<string, string>>) => ({ ok: true, json: async () => ({ quotes }) });
const gecko = (...coins: Array<Record<string, unknown>>) => ({ ok: true, json: async () => ({ coins }) });
/** Routes by host so one test can script both providers. */
const routes = (yahooBody: unknown, geckoBody: unknown) =>
  mockFetch.mockImplementation(async (url: string) =>
    String(url).includes('coingecko') ? geckoBody : yahooBody
  );

describe('assetClassifier', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    mockFetch.mockRejectedValue(new Error('offline'));
    clearAssetClassCache();
    setAssetLookupEnabled(true);
  });

  describe('without any lookup', () => {
    it('keeps a type the caller already knows', async () => {
      expect(await classifyAsset({ symbol: 'NEAR', type: 'other' })).toEqual({ type: 'other', source: 'given' });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('reads a currency code as cash, whatever the account (cash lives in every account)', async () => {
      for (const accountType of ['crypto_spot', 'investment', 'other'] as const) {
        expect((await classifyAsset({ symbol: 'eur', accountType })).type).toBe('cash');
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('lets a crypto account make NEAR a crypto, with no lookup and no hard-coded list', async () => {
      const res = await classifyAsset({ symbol: 'NEAR', accountType: 'crypto_spot' });
      expect(res).toEqual({ type: 'crypto', source: 'account' });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('lets an "other" account make an asset "other" (manual price, no lookup)', async () => {
      expect((await classifyAsset({ symbol: 'WINE', accountType: 'other' })).type).toBe('other');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('a token (network or contract) is a crypto even in a securities account', async () => {
      expect((await classifyAsset({ symbol: 'ABC', network: 'ethereum', accountType: 'investment' })).type).toBe('crypto');
    });

    it('a valid ISIN beats the crypto default of the account (it is a listed security)', async () => {
      routes(yahoo({ symbol: 'CW8.PA', quoteType: 'ETF', exchange: 'PAR', longname: 'Amundi MSCI World' }), gecko());
      const res = await classifyAsset({ symbol: 'LU1681043599', isin: 'LU1681043599', accountType: 'crypto_spot' });
      expect(res).toMatchObject({ type: 'etf', exchange: 'PAR', name: 'Amundi MSCI World', source: 'yahoo' });
    });

    it('maps the account types to a default', () => {
      expect(defaultTypeForAccount('crypto_earn')).toBe('crypto');
      expect(defaultTypeForAccount('other')).toBe('other');
      expect(defaultTypeForAccount('investment')).toBeUndefined();
      expect(defaultTypeForAccount('checking')).toBeUndefined();
      expect(defaultTypeForAccount(undefined)).toBeUndefined();
    });

    it.each([
      ['EQUITY', 'stock'], ['ETF', 'etf'], ['MUTUALFUND', 'fund'], ['CRYPTOCURRENCY', 'crypto'],
      ['CURRENCY', 'cash'], ['INDEX', 'stock'], ['FUTURE', 'stock'], [undefined, 'stock'],
    ] as const)('maps Yahoo quoteType %s to %s (never "other")', (quoteType, expected) => {
      expect(mapYahooQuoteType(quoteType)).toBe(expected);
    });
  });

  describe('lookups', () => {
    it('finds a crypto listed on Yahoo as NEAR-USD for a bare NEAR in a securities account', async () => {
      routes(yahoo({ symbol: 'NEAR-USD', quoteType: 'CRYPTOCURRENCY', shortname: 'NEAR Protocol USD' }), gecko());
      const res = await classifyAsset({ symbol: 'NEAR', accountType: 'investment' });
      expect(res).toMatchObject({ type: 'crypto', name: 'NEAR Protocol USD', source: 'yahoo' });
      expect(String(mockFetch.mock.calls[0][0])).toContain('/v1/finance/search?q=NEAR');
    });

    it('classifies a stock and keeps its name and exchange', async () => {
      routes(yahoo({ symbol: 'AAPL', quoteType: 'EQUITY', longname: 'Apple Inc.', exchange: 'NMS' }), gecko());
      expect(await classifyAsset({ symbol: 'AAPL', accountType: 'investment' })).toMatchObject({ type: 'stock', name: 'Apple Inc.', exchange: 'NMS' });
    });

    it('prefers the exact symbol over a look-alike', async () => {
      routes(yahoo({ symbol: 'OPEN', quoteType: 'EQUITY' }, { symbol: 'OP', quoteType: 'EQUITY' }), gecko());
      expect((await classifyAsset({ symbol: 'OP' })).type).toBe('stock');
    });

    it('falls back on CoinGecko with an exact symbol match only', async () => {
      routes(yahoo(), gecko({ symbol: 'near', name: 'NEAR Protocol', market_cap_rank: 30 }, { symbol: 'nearai', name: 'Near AI', market_cap_rank: 900 }));
      expect(await classifyAsset({ symbol: 'NEAR' })).toMatchObject({ type: 'crypto', name: 'NEAR Protocol', source: 'coingecko' });

      clearAssetClassCache();
      routes(yahoo(), gecko({ symbol: 'nearai', name: 'Near AI' }));
      expect((await classifyAsset({ symbol: 'NEAR' })).type).toBe('stock');
    });

    it('remembers an answer on the device: the second call makes no request', async () => {
      routes(yahoo({ symbol: 'NEAR-USD', quoteType: 'CRYPTOCURRENCY' }), gecko());
      await classifyAsset({ symbol: 'NEAR' });
      mockFetch.mockClear();
      const again = await classifyAsset({ symbol: 'NEAR' });
      expect(again).toMatchObject({ type: 'crypto', source: 'cache' });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('works offline: the short list of known cryptos, else a stock, and no repeated attempts', async () => {
      mockFetch.mockRejectedValue(new Error('offline'));
      expect(await classifyAsset({ symbol: 'BTC' })).toEqual({ type: 'crypto', source: 'local' });
      expect(await classifyAsset({ symbol: 'NEAR' })).toEqual({ type: 'stock', source: 'local' });
      const calls = mockFetch.mock.calls.length;
      await classifyAsset({ symbol: 'NEAR' });
      expect(mockFetch.mock.calls.length).toBe(calls); // the failed lookup is remembered for a day
    });

    it('gives up after 3 seconds instead of holding the import', async () => {
      vi.useFakeTimers();
      try {
        mockFetch.mockImplementation((_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))
        );
        const pending = classifyAsset({ symbol: 'SLOW' });
        await vi.advanceTimersByTimeAsync(7000); // Yahoo, then CoinGecko
        expect(await pending).toEqual({ type: 'stock', source: 'local' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('never calls a provider when the lookup is switched off', async () => {
      setAssetLookupEnabled(false);
      expect(isAssetLookupEnabled()).toBe(false);
      expect((await classifyAsset({ symbol: 'NEAR' })).type).toBe('stock');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('is off by default in unit tests, so nothing reaches the network by accident', () => {
      localStorage.clear();
      expect(isAssetLookupEnabled()).toBe(false);
    });
  });
});
