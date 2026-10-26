/**
 * Position recalculation keys (TGLA-147)
 * Rows stored without an instrument (older imports of ISIN-only files, failed instrument
 * lookups) must still feed the positions instead of silently disappearing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../src/services/db';
import { vaultService } from '../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../src/services/security/authService';
import { portfolioService } from '../../../src/services/portfolioService';

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
