/**
 * Realized P&L from the ledger (TGLA-148)
 * The P&L page used to show 15 % of every sale. The service now replays the journal.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});
vi.mock('../../../src/services/currencyService', () => ({
  currencyService: {
    getExchangeRates: vi.fn(async () => ({ USD: 0.5 })),
    convertAmount: vi.fn((amount: number, from: string, to: string, rates?: Record<string, number>) =>
      from === to ? amount : amount * (rates?.[from] ?? 1)),
  },
}));

import { db } from '../../../src/services/db';
import { vaultService } from '../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../src/services/security/authService';
import { portfolioService } from '../../../src/services/portfolioService';

const row = (id: string, overrides: Record<string, unknown>) => ({
  id, ownerId: 'u', accountId: 'acc-1', instrumentId: 'i-aapl', batchId: 'b1', rowHash: `h-${id}`,
  sourceOrigin: 'FILE', isSynthetic: false, isFiscal: true, sourceMode: 'history',
  rawType: 'x', rawLabel: '', assetSymbol: 'AAPL',
  createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', version: 1,
  ...overrides,
}) as never;

const instrument = (id: string, symbol: string, currency: string, type = 'stock') => ({
  id, ownerId: 'u', name: symbol, type, marketIdentifier: { symbol },
  denominationCurrency: currency, isMarketReady: true,
  createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
}) as never;

describe('portfolioService.getRealizedPL', () => {
  beforeEach(async () => {
    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('realized@example.test', 'Realized-Test-Key-2026!#xx', 'Realized');
    db.saveAccounts([{ id: 'acc-1', ownerId: 'u', instituteId: 'inst-1', name: 'CTO', type: 'investment', defaultCurrency: 'EUR', isActive: true } as never]);
    db.saveInstruments([instrument('i-aapl', 'AAPL', 'EUR'), instrument('i-msft', 'MSFT', 'USD')]);
  });

  it('is zero without any sale', async () => {
    db.saveUnifiedTransactions([row('t1', { type: 'BUY', transactionDate: '2024-01-01T00:00:00.000Z', quantity: '10', priceUnit: '100', amountPrimary: '1000' })]);

    const result = await portfolioService.getRealizedPL('EUR');

    expect(result.total).toBe(0);
    expect(result.byMonth).toEqual([]);
  });

  it('reports the gain of a sale in its month, not a percentage of the proceeds', async () => {
    db.saveUnifiedTransactions([
      row('t1', { type: 'BUY', transactionDate: '2024-01-01T00:00:00.000Z', quantity: '10', priceUnit: '100', amountPrimary: '1000' }),
      row('t2', { type: 'SELL', transactionDate: '2024-03-10T00:00:00.000Z', quantity: '10', priceUnit: '200', amountPrimary: '2000' }),
    ]);

    const result = await portfolioService.getRealizedPL('EUR');

    expect(result.total).toBeCloseTo(1000);
    expect(result.byMonth).toEqual([{ month: '2024-03', value: 1000 }]);
    expect(result.entries).toEqual([
      expect.objectContaining({ date: '2024-03-10T00:00:00.000Z', symbol: 'AAPL', assetType: 'Equity', value: 1000 }),
    ]);
  });

  it('follows the cost basis method of the account (FIFO vs WAC)', async () => {
    db.saveUnifiedTransactions([
      row('t1', { type: 'BUY', transactionDate: '2024-01-01T00:00:00.000Z', quantity: '10', priceUnit: '100', amountPrimary: '1000' }),
      row('t2', { type: 'BUY', transactionDate: '2024-02-01T00:00:00.000Z', quantity: '10', priceUnit: '200', amountPrimary: '2000' }),
      row('t3', { type: 'SELL', transactionDate: '2024-03-01T00:00:00.000Z', quantity: '10', priceUnit: '250', amountPrimary: '2500' }),
    ]);

    expect((await portfolioService.getRealizedPL('EUR')).total).toBeCloseTo(1000);

    db.saveAccounts([{ ...db.getAccounts()[0], costBasisMethod: 'FIFO' }]);
    expect((await portfolioService.getRealizedPL('EUR')).total).toBeCloseTo(1500);
  });

  it('converts each sale from the currency of its instrument to the base currency', async () => {
    db.saveUnifiedTransactions([
      row('t1', { type: 'BUY', instrumentId: 'i-msft', assetSymbol: 'MSFT', transactionDate: '2024-01-01T00:00:00.000Z', quantity: '1', priceUnit: '100', amountPrimary: '100' }),
      row('t2', { type: 'SELL', instrumentId: 'i-msft', assetSymbol: 'MSFT', transactionDate: '2024-04-01T00:00:00.000Z', quantity: '1', priceUnit: '300', amountPrimary: '300' }),
    ]);

    const result = await portfolioService.getRealizedPL('EUR');

    expect(result.total).toBeCloseTo(100); // 200 USD at 0.5
    expect(result.entries[0].symbol).toBe('MSFT');
  });
});
