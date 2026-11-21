import { describe, it, expect } from 'vitest';
import {
  extractTrailingAssetUnit,
  isPairHeader,
  normalizeTradingPair,
} from '../../../../src/services/import/assetPairNormalizer';

describe('assetPairNormalizer', () => {
  describe('extractTrailingAssetUnit', () => {
    it('extracts attached tickers and currencies from numeric cells', () => {
      expect(extractTrailingAssetUnit('0.0001BNB')).toBe('BNB');
      expect(extractTrailingAssetUnit('0.5 BTC')).toBe('BTC');
      expect(extractTrailingAssetUnit('4750.00USDT')).toBe('USDT');
      expect(extractTrailingAssetUnit('9,94 CHF')).toBe('CHF');
      expect(extractTrailingAssetUnit('-0.25ETH')).toBe('ETH');
    });

    it('ignores plain numbers, currency prefixes, and scientific notation', () => {
      expect(extractTrailingAssetUnit('125.50')).toBeUndefined();
      expect(extractTrailingAssetUnit('USD 125.50')).toBeUndefined();
      expect(extractTrailingAssetUnit('€12.00')).toBeUndefined();
      expect(extractTrailingAssetUnit('1.2e-5')).toBeUndefined();
      expect(extractTrailingAssetUnit('')).toBeUndefined();
      expect(extractTrailingAssetUnit(undefined)).toBeUndefined();
    });
  });

  describe('isPairHeader', () => {
    it('recognizes pair/market headers and ignores normal symbol headers', () => {
      expect(isPairHeader('Pair')).toBe(true);
      expect(isPairHeader('pair')).toBe(true);
      expect(isPairHeader('Trading pair')).toBe(true);
      expect(isPairHeader('Market')).toBe(true);
      expect(isPairHeader('Symbol')).toBe(false);
      expect(isPairHeader('Ticker')).toBe(false);
      expect(isPairHeader(undefined)).toBe(false);
    });
  });

  describe('normalizeTradingPair', () => {
    it('splits delimited pairs', () => {
      expect(normalizeTradingPair('BTC/EUR')).toEqual({ base: 'BTC', quote: 'EUR' });
      expect(normalizeTradingPair('eth-usdt')).toEqual({ base: 'ETH', quote: 'USDT' });
      expect(normalizeTradingPair('XBT_USD')).toEqual({ base: 'BTC', quote: 'USD' });
    });

    it('normalizes Kraken 8-character X/Z-prefixed pairs', () => {
      expect(normalizeTradingPair('XXBTZEUR')).toEqual({ base: 'BTC', quote: 'EUR' });
      expect(normalizeTradingPair('XETHZUSD')).toEqual({ base: 'ETH', quote: 'USD' });
      expect(normalizeTradingPair('XETHXXBT')).toEqual({ base: 'ETH', quote: 'BTC' });
      expect(normalizeTradingPair('XXDGZUSD')).toEqual({ base: 'DOGE', quote: 'USD' });
    });

    it('splits concatenated crypto and fiat pairs', () => {
      expect(normalizeTradingPair('BTCUSDT')).toEqual({ base: 'BTC', quote: 'USDT' });
      expect(normalizeTradingPair('ETHEUR')).toEqual({ base: 'ETH', quote: 'EUR' });
      expect(normalizeTradingPair('BNBFDUSD')).toEqual({ base: 'BNB', quote: 'FDUSD' });
      expect(normalizeTradingPair('XBTUSD')).toEqual({ base: 'BTC', quote: 'USD' });
    });

    it('leaves standalone tickers unchanged', () => {
      expect(normalizeTradingPair('AAPL')).toEqual({ base: 'AAPL' });
      expect(normalizeTradingPair('')).toEqual({ base: '' });
    });
  });
});
