/**
 * Position recalculation keys (TGLA-147)
 * Rows stored without an instrument (older imports of ISIN-only files, failed instrument
 * lookups) must still feed the positions instead of silently disappearing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../src/services/db';
import { vaultService } from '../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../src/services/security/authService';
import { portfolioService } from '../../../src/services/portfolioService';
import { clearPriceCache, recordProviderQuotes, refreshPositionPrices } from '../../../src/services/priceService';
import { resetYahooPause } from '../../../src/services/market/yahooClient';
import type { Instrument } from '../../../src/types';

const row = (id: string, overrides: Record<string, unknown>) => ({
  id, ownerId: 'u', accountId: 'acc-1', instrumentId: '', batchId: 'batch-1', rowHash: `h-${id}`,
  sourceOrigin: 'FILE', isSynthetic: false, isFiscal: true, sourceMode: 'history',
  transactionDate: '2024-01-08T00:00:00.000Z', type: 'BUY', rawType: 'BUY', rawLabel: '',
  amountPrimary: '927.5', assetSymbol: 'UNKNOWN', quantity: '5', priceUnit: '185.5',
  createdAt: '2024-01-08T00:00:00.000Z', updatedAt: '2024-01-08T00:00:00.000Z', version: 1,
  ...overrides,
}) as never;

describe('recalculatePositions with rows that have no instrument', () => {
  beforeEach(async () => {
    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('recalc@example.test', 'Recalc-Test-Key-2026!#xx', 'Recalc');
  });

  it('groups an ISIN-only row by its ISIN and names the position after it', async () => {
    db.saveUnifiedTransactions([row('t1', { assetIsin: 'US0378331005' })]);

    await portfolioService.recalculatePositions();

    const positions = db.getPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0].quantity).toBe(5);
    expect(positions[0].symbol).toBe('US0378331005');
  });

  it('keeps a row that has a symbol but no instrument', async () => {
    db.saveUnifiedTransactions([row('t1', { assetSymbol: 'AAPL' })]);

    await portfolioService.recalculatePositions();

    expect(db.getPositions().map(p => p.symbol)).toEqual(['AAPL']);
  });

  it('ignores a row with no identity at all (UNKNOWN symbol, no ISIN, no instrument)', async () => {
    db.saveUnifiedTransactions([row('t1', {})]);

    await portfolioService.recalculatePositions();

    expect(db.getPositions()).toEqual([]);
  });
});

describe('recalculatePositions keeps the ISIN for the bank-quote fallback (TGLA-242)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('recalc@example.test', 'Recalc-Test-Key-2026!#xx', 'Recalc');
    resetYahooPause();
    clearPriceCache();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('values a bank line at the bank quote when Yahoo refuses, so its gain is no longer zero', async () => {
    const wpea: Instrument = {
      id: 'ins-wpea', ownerId: 'u', name: 'ISHARES MSCI WORLD SWAP PEA UCITS ETF', type: 'etf',
      marketIdentifier: { symbol: 'WPEA.PA', isin: 'IE0002XZSHO1' }, isMarketReady: true, denominationCurrency: 'EUR',
      createdAt: '2026-11-23T00:00:00.000Z', updatedAt: '2026-11-23T00:00:00.000Z',
    };
    db.saveInstruments([wpea]);
    // A snapshot line: bought at the bank's unit cost (PRU)
    db.saveUnifiedTransactions([row('t1', { instrumentId: 'ins-wpea', assetSymbol: 'WPEA.PA', assetIsin: 'IE0002XZSHO1', quantity: '234', priceUnit: '5.8', amountPrimary: '1357.2' })]);

    await portfolioService.recalculatePositions();
    const [position] = db.getPositions();
    expect(position.isin).toBe('IE0002XZSHO1');
    expect(position.unrealizedPL).toBe(0);

    vi.stubGlobal('fetch', vi.fn(async () => new Response('Too Many Requests', { status: 429 })));
    recordProviderQuotes([{ key: 'IE0002XZSHO1', price: 6.32, currency: 'EUR' }]);
    const [priced] = await refreshPositionPrices([position]);

    expect(priced.lastPrice).toBeCloseTo(6.32);
    expect(priced.unrealizedPL).toBeCloseTo(234 * (6.32 - 5.8));
  });
});
