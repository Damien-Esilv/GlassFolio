/**
 * Capital gains correctness (TGLA-149)
 * Hand-computed scenarios for CTO (PMP, art. 150-0 D) and crypto (art. 150 VH bis).
 */
import { describe, it, expect } from 'vitest';
import {
  calculateCTOCapitalGains,
  calculateCryptoGains,
  EnrichedTransaction,
} from '../../../../src/services/fiscal/taxEngine';
import { getFiscalRulesOrThrow } from '../../../../src/services/fiscal/taxRules';
import type { Instrument } from '../../../../src/types/types.backend';

const rules2024 = getFiscalRulesOrThrow('2024', 'FR');

let seq = 0;
const instrument = (symbol: string, type: Instrument['type'], currency = 'EUR'): Instrument => ({
  id: `inst-${symbol}`, ownerId: 'u', name: symbol, type, marketIdentifier: { symbol },
  isMarketReady: true, denominationCurrency: currency,
  createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z',
});

const tx = (symbol: string, type: Instrument['type'], overrides: Partial<EnrichedTransaction>): EnrichedTransaction => {
  seq++;
  const inst = instrument(symbol, type);
  return {
    id: `tx-${seq}`, ownerId: 'u', accountId: 'acc-1', instrumentId: inst.id, batchId: 'b1', rowHash: `h${seq}`,
    sourceOrigin: 'FILE', isSynthetic: false, isFiscal: true, sourceMode: 'history',
    transactionDate: '2024-01-01T00:00:00Z', type: 'BUY', rawType: 'BUY', rawLabel: '',
    amountPrimary: '0', assetSymbol: symbol, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', version: 1,
    instrument: inst, resolvedWrapperType: 'CTO',
    ...overrides,
  } as EnrichedTransaction;
};

const coin = (symbol: string, overrides: Partial<EnrichedTransaction>) => tx(symbol, 'crypto', overrides);
const stock = (symbol: string, overrides: Partial<EnrichedTransaction>) => tx(symbol, 'stock', overrides);

describe('crypto gains — art. 150 VH bis', () => {
  it('reduces the total acquisition price after each cession', () => {
    const events = calculateCryptoGains([
      coin('BTC', { type: 'BUY', transactionDate: '2024-01-01T00:00:00Z', quantity: '10', priceUnit: '100', amountPrimary: '1000' }),
      coin('BTC', { type: 'SELL', transactionDate: '2024-02-01T00:00:00Z', quantity: '5', priceUnit: '200', amountPrimary: '1000' }),
      coin('BTC', { type: 'SELL', transactionDate: '2024-03-01T00:00:00Z', quantity: '2.5', priceUnit: '200', amountPrimary: '500' }),
    ], '2024', rules2024);

    expect(events.map(e => [e.grossAmount, Math.round(e.acquisitionCost), Math.round(e.taxableAmount)])).toEqual([
      [1000, 500, 500],
      [500, 250, 250],
    ]);
  });

  it('values the whole crypto portfolio, not only the asset that is sold', () => {
    const events = calculateCryptoGains([
      coin('BTC', { type: 'BUY', transactionDate: '2024-01-01T00:00:00Z', quantity: '1', priceUnit: '10000', amountPrimary: '10000' }),
      coin('ETH', { type: 'BUY', transactionDate: '2024-01-02T00:00:00Z', quantity: '10', priceUnit: '1000', amountPrimary: '10000' }),
      coin('BTC', { type: 'SELL', transactionDate: '2024-06-01T00:00:00Z', quantity: '0.5', priceUnit: '20000', amountPrimary: '10000' }),
    ], '2024', rules2024);

    expect(events).toHaveLength(1);
    // V = 1 × 20000 + 10 × 1000 = 30000 → 20000 × 10000 / 30000
    expect(events[0].acquisitionCost).toBeCloseTo(6666.67, 2);
    expect(events[0].taxableAmount).toBeCloseTo(3333.33, 2);
    expect(events[0].missingData).toEqual(['portfolio_valuation_approximated']);
  });

  it('flags a portfolio valuation that misses the price of a held asset', () => {
    const events = calculateCryptoGains([
      coin('ETH', { type: 'DEPOSIT', transactionDate: '2024-01-02T00:00:00Z', quantity: '10', amountPrimary: '0' }),
      coin('BTC', { type: 'BUY', transactionDate: '2024-01-03T00:00:00Z', quantity: '1', priceUnit: '10000', amountPrimary: '10000' }),
      coin('BTC', { type: 'SELL', transactionDate: '2024-06-01T00:00:00Z', quantity: '0.5', priceUnit: '20000', amountPrimary: '10000' }),
    ], '2024', rules2024);

    expect(events[0].missingData).toContain('portfolio_valuation_incomplete');
  });

  it('counts a negative fee as a cost and ignores a fee paid in another crypto', () => {
    const base = [
      coin('BTC', { type: 'BUY', transactionDate: '2024-01-01T00:00:00Z', quantity: '1', priceUnit: '1000', amountPrimary: '1000' }),
    ];
    const negative = calculateCryptoGains([
      ...base,
      coin('BTC', { type: 'SELL', transactionDate: '2024-02-01T00:00:00Z', quantity: '0.5', priceUnit: '2000', amountPrimary: '1000', feeAmount: '-100' }),
    ], '2024', rules2024);
    const inBnb = calculateCryptoGains([
      ...base,
      coin('BTC', { type: 'SELL', transactionDate: '2024-02-01T00:00:00Z', quantity: '0.5', priceUnit: '2000', amountPrimary: '1000', feeAmount: '0.01', feeAsset: 'BNB' }),
    ], '2024', rules2024);

    expect(negative[0].fees).toBe(100);
    expect(negative[0].taxableAmount).toBeCloseTo(1000 - 500 - 100);
    expect(inBnb[0].fees).toBe(0);
    expect(inBnb[0].taxableAmount).toBeCloseTo(500);
  });

  it('does not count a transfer between own wallets as a new acquisition', () => {
    const events = calculateCryptoGains([
      coin('BTC', { type: 'BUY', accountId: 'wallet-a', transactionDate: '2024-01-01T00:00:00Z', quantity: '1', priceUnit: '10000', amountPrimary: '10000' }),
      coin('BTC', { type: 'WITHDRAW', accountId: 'wallet-a', transactionDate: '2024-02-01T10:00:00Z', quantity: '1', amountPrimary: '0' }),
      coin('BTC', { type: 'DEPOSIT', accountId: 'wallet-b', transactionDate: '2024-02-01T10:30:00Z', quantity: '0.9995', priceUnit: '11000', amountPrimary: '10994.5' }),
      coin('BTC', { type: 'SELL', accountId: 'wallet-b', transactionDate: '2024-06-01T00:00:00Z', quantity: '0.9995', priceUnit: '12000', amountPrimary: '11994' }),
    ], '2024', rules2024);

    expect(events).toHaveLength(1);
    // The deposit adds no cost: only the original 10000 is attributed, 0.9995 / 1 of it
    expect(events[0].acquisitionCost).toBeCloseTo(9995, 0);
    expect(events[0].taxableAmount).toBeCloseTo(11994 - 9995, 0);
  });

  it('keeps an unpaired deposit as an acquisition', () => {
    const events = calculateCryptoGains([
      coin('SOL', { type: 'DEPOSIT', transactionDate: '2024-03-01T10:00:00Z', quantity: '10', priceUnit: '100', amountPrimary: '1000' }),
      coin('SOL', { type: 'SELL', transactionDate: '2024-08-01T10:00:00Z', quantity: '10', priceUnit: '150', amountPrimary: '1500' }),
    ], '2024', rules2024);

    expect(events[0].acquisitionCost).toBe(1000);
  });

  it('flags a sale made in a foreign currency without an exchange rate', () => {
    const events = calculateCryptoGains([
      coin('BTC', { type: 'BUY', transactionDate: '2024-01-01T00:00:00Z', quantity: '1', priceUnit: '1000', amountPrimary: '1000' }),
      coin('BTC', { type: 'SELL', transactionDate: '2024-02-01T00:00:00Z', quantity: '1', priceUnit: '2000', amountPrimary: '2000', originalCurrency: 'USD' }),
    ], '2024', rules2024);

    expect(events[0].currency).toBe('USD');
    expect(events[0].missingData).toContain('fx_rate_missing');
    expect(events[0].confidence).toBe('estimated');
  });
});

describe('CTO gains — PMP, art. 150-0 D', () => {
  it('does not depend on the order of rows that share a date', () => {
    const buy = stock('AAPL', { type: 'BUY', transactionDate: '2024-03-01', quantity: '10', priceUnit: '100', amountPrimary: '1000' });
    const sell = stock('AAPL', { type: 'SELL', transactionDate: '2024-03-01', quantity: '10', priceUnit: '110', amountPrimary: '1100' });

    const events = calculateCTOCapitalGains([sell, buy], '2024', rules2024);

    expect(events).toHaveLength(1);
    expect(events[0].taxableAmount).toBeCloseTo(100);
    expect(events[0].confidence).toBe('determined');
  });

  it('derives the quantity from amount and price instead of taking the amount as a share count', () => {
    const events = calculateCTOCapitalGains([
      stock('AAPL', { type: 'BUY', transactionDate: '2024-01-10', priceUnit: '100', amountPrimary: '1000' }),
      stock('AAPL', { type: 'SELL', transactionDate: '2024-02-10', quantity: '10', priceUnit: '110', amountPrimary: '1100' }),
    ], '2024', rules2024);

    expect(events[0].acquisitionCost).toBeCloseTo(1000);
    expect(events[0].taxableAmount).toBeCloseTo(100);
  });

  it('does not count a fee twice when the total column already includes it', () => {
    const events = calculateCTOCapitalGains([
      stock('PAIR', { type: 'BUY', transactionDate: '2024-01-10', quantity: '0.012', priceUnit: '58500', amountPrimary: '702.70', feeAmount: '0.702' }),
      stock('PAIR', { type: 'SELL', transactionDate: '2024-02-10', quantity: '0.012', priceUnit: '58500', amountPrimary: '702' }),
    ], '2024', rules2024);

    expect(events[0].acquisitionCost).toBeCloseTo(702.702, 3);
    expect(events[0].taxableAmount).toBeCloseTo(-0.702, 3);
  });

  it('never lets a quantity go negative after an earlier-year oversell', () => {
    const events = calculateCTOCapitalGains([
      stock('AAPL', { type: 'BUY', transactionDate: '2023-01-10', quantity: '10', priceUnit: '100', amountPrimary: '1000' }),
      stock('AAPL', { type: 'SELL', transactionDate: '2023-06-10', quantity: '15', priceUnit: '120', amountPrimary: '1800' }),
      stock('AAPL', { type: 'BUY', transactionDate: '2024-01-10', quantity: '10', priceUnit: '100', amountPrimary: '1000' }),
      stock('AAPL', { type: 'SELL', transactionDate: '2024-02-10', quantity: '5', priceUnit: '150', amountPrimary: '750' }),
    ], '2024', rules2024);

    expect(events).toHaveLength(1);
    expect(events[0].acquisitionCost).toBeCloseTo(500);
    expect(events[0].taxableAmount).toBeCloseTo(250);
  });

  it('removes transferred-out shares from the average price', () => {
    const events = calculateCTOCapitalGains([
      stock('AAPL', { type: 'BUY', transactionDate: '2024-01-10', quantity: '10', priceUnit: '100', amountPrimary: '1000' }),
      stock('AAPL', { type: 'WITHDRAW', transactionDate: '2024-01-20', quantity: '10', amountPrimary: '0' }),
      stock('AAPL', { type: 'BUY', transactionDate: '2024-02-01', quantity: '10', priceUnit: '200', amountPrimary: '2000' }),
      stock('AAPL', { type: 'SELL', transactionDate: '2024-03-01', quantity: '10', priceUnit: '250', amountPrimary: '2500' }),
    ], '2024', rules2024);

    expect(events[0].acquisitionCost).toBeCloseTo(2000);
    expect(events[0].taxableAmount).toBeCloseTo(500);
  });

  it('uses the cost carried by a snapshot adjustment when the history starts later', () => {
    const events = calculateCTOCapitalGains([
      stock('AAPL', {
        type: 'SNAPSHOT_ADJUSTMENT', isFiscal: false, isSynthetic: true, transactionDate: '2023-12-31',
        quantity: '10', priceUnit: '100', amountPrimary: '1000', metadata: { reconciliationType: 'increase', costDelta: 1000 },
      }),
      stock('AAPL', { type: 'SELL', transactionDate: '2024-02-10', quantity: '10', priceUnit: '130', amountPrimary: '1300' }),
    ], '2024', rules2024);

    expect(events[0].acquisitionCost).toBeCloseTo(1000);
    expect(events[0].taxableAmount).toBeCloseTo(300);
    expect(events[0].confidence).toBe('determined');
  });

  it('flags a sale made in a foreign currency without an exchange rate', () => {
    const events = calculateCTOCapitalGains([
      stock('AAPL', { type: 'BUY', transactionDate: '2024-01-10', quantity: '1', priceUnit: '100', amountPrimary: '100', originalCurrency: 'USD' }),
      stock('AAPL', { type: 'SELL', transactionDate: '2024-02-10', quantity: '1', priceUnit: '120', amountPrimary: '120', originalCurrency: 'USD' }),
    ], '2024', rules2024);

    expect(events[0].currency).toBe('USD');
    expect(events[0].missingData).toContain('fx_rate_missing');
    expect(events[0].confidence).toBe('estimated');
  });

  it('keeps an exact PMP when the sale has an exchange rate', () => {
    const events = calculateCTOCapitalGains([
      stock('AAPL', { type: 'BUY', transactionDate: '2024-01-10', quantity: '1', priceUnit: '100', amountPrimary: '100', originalCurrency: 'USD' }),
      stock('AAPL', { type: 'SELL', transactionDate: '2024-02-10', quantity: '1', priceUnit: '120', amountPrimary: '120', originalCurrency: 'USD', fxRate: '0.9' }),
    ], '2024', rules2024);

    expect(events[0].missingData ?? []).not.toContain('fx_rate_missing');
  });
});
