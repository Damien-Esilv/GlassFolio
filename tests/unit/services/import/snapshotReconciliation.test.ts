/**
 * Tests — snapshot reconciliation invariants (E28 — TGLA-102)
 * Property under test: after committing a snapshot, the account positions equal
 * the snapshot (quantity and cost basis), and re-importing it is a no-op.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { db } from '../../../../src/services/db';
import {
  getExistingPositions,
  calculateReconciliation,
  buildSnapshotCommit,
  SnapshotPosition,
} from '../../../../src/services/import/snapshotService';
import type { UnifiedTransaction } from '../../../../src/types/types.backend';

const ACCOUNT = 'acc-snap';

const position = (symbol: string, quantity: number, avgPrice: number): SnapshotPosition => ({
  assetSymbol: symbol,
  quantity: quantity.toString(),
  avgPrice: avgPrice.toString(),
  displayName: symbol,
  assetKey: symbol,
});

let batch = 0;
async function commit(positions: SnapshotPosition[], mode: 'replace' | 'synthetic', closeMissing = true): Promise<UnifiedTransaction[]> {
  batch++;
  const txs = await buildSnapshotCommit({
    mode,
    positions,
    accountId: ACCOUNT,
    batchId: `batch-${batch}`,
    date: `2024-0${Math.min(batch, 9)}-01T00:00:00.000Z`,
    userId: 'user-1',
    closeMissing,
  });
  db.saveUnifiedTransactions([...db.getUnifiedTransactions(), ...txs]);
  return txs;
}

async function holdings(): Promise<Record<string, { qty: number; cost: number }>> {
  const result: Record<string, { qty: number; cost: number }> = {};
  for (const p of await getExistingPositions(ACCOUNT)) {
    result[p.assetSymbol || p.assetKey] = { qty: parseFloat(p.quantity), cost: parseFloat(p.totalCost) };
  }
  return result;
}

describe.each(['replace', 'synthetic'] as const)('snapshot reconciliation — %s mode', mode => {
  beforeEach(() => {
    localStorage.clear();
    db.saveUnifiedTransactions([]);
    db.saveImportBatches([]);
  });

  it('first import creates the snapshot positions', async () => {
    await commit([position('AAPL', 10, 100), position('MSFT', 3, 400)], mode);
    const h = await holdings();
    expect(h.AAPL.qty).toBeCloseTo(10);
    expect(h.AAPL.cost).toBeCloseTo(1000);
    expect(h.MSFT.cost).toBeCloseTo(1200);
  });

  it('re-importing the same snapshot adds nothing (regression: positions doubled)', async () => {
    const snapshot = [position('AAPL', 10, 100), position('MSFT', 3, 400)];
    await commit(snapshot, mode);
    const second = await commit(snapshot, mode);
    expect(second).toHaveLength(0);
    const h = await holdings();
    expect(h.AAPL.qty).toBeCloseTo(10);
    expect(h.MSFT.qty).toBeCloseTo(3);
  });

  it('matches the next snapshot exactly: increase, decrease, PRU-only change and closure', async () => {
    await commit([position('AAPL', 10, 100), position('MSFT', 3, 400), position('TTE', 25, 58.45), position('LVMH', 2, 700)], mode);
    await commit([position('AAPL', 12, 80), position('MSFT', 1, 410), position('TTE', 25, 57.9)], mode);

    const h = await holdings();
    expect(h.AAPL.qty).toBeCloseTo(12);
    expect(h.AAPL.cost).toBeCloseTo(960);
    expect(h.MSFT.qty).toBeCloseTo(1);
    expect(h.MSFT.cost).toBeCloseTo(410);
    expect(h.TTE.qty).toBeCloseTo(25);
    expect(h.TTE.cost).toBeCloseTo(25 * 57.9);
    expect(h.LVMH).toBeUndefined();
  });

  it('keeps assets absent from the file when closeMissing is off', async () => {
    await commit([position('AAPL', 10, 100), position('LVMH', 2, 700)], mode);
    await commit([position('AAPL', 10, 100)], mode, false);
    expect((await holdings()).LVMH.qty).toBeCloseTo(2);
  });

  it('generated adjustments are never fiscal', async () => {
    await commit([position('AAPL', 10, 100)], mode);
    const txs = await commit([position('AAPL', 5, 100)], mode);
    expect(txs.length).toBeGreaterThan(0);
    expect(txs.every(t => t.isFiscal === false && t.isSynthetic === true)).toBe(true);
  });
});

describe('reconciliation on top of a transaction history', () => {
  beforeEach(() => {
    localStorage.clear();
    db.saveUnifiedTransactions([]);
  });

  it('uses the ledger PRU (sale does not inflate the average cost)', async () => {
    const base = {
      ownerId: 'u', batchId: 'h', accountId: ACCOUNT, instrumentId: '', sourceOrigin: 'FILE', isSynthetic: false,
      isFiscal: true, sourceMode: 'history', rawType: '', rawLabel: '', assetSymbol: 'AAPL',
      createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', version: 1,
    } as const;
    db.saveUnifiedTransactions([
      { ...base, id: 'h1', rowHash: 'h1', type: 'BUY', transactionDate: '2024-01-01T00:00:00.000Z', quantity: '10', priceUnit: '100', amountPrimary: '1000' },
      { ...base, id: 'h2', rowHash: 'h2', type: 'SELL', transactionDate: '2024-02-01T00:00:00.000Z', quantity: '5', priceUnit: '150', amountPrimary: '750' },
    ] as UnifiedTransaction[]);

    const existing = await getExistingPositions(ACCOUNT);
    expect(parseFloat(existing[0].avgPrice)).toBeCloseTo(100);

    const { diffs } = await calculateReconciliation([position('AAPL', 5, 100)], existing);
    expect(diffs[0].syntheticType).toBe('NONE');
    expect(diffs[0].hasSourceModeConflict).toBe(true);
  });

  it('flags a negative implied price as a warning, not a blocking error', async () => {
    const { diffs, stats } = await calculateReconciliation(
      [position('AAPL', 12, 80)],
      [{ assetSymbol: 'AAPL', quantity: '10', avgPrice: '100', totalCost: '1000', assetKey: 'AAPL', sourceMode: 'snapshot' }]
    );
    expect(diffs[0].isValid).toBe(true);
    expect(diffs[0].validationMessage).toBe('snapshotWizard.warnings.negativeImpliedPrice');
    expect(stats.hasErrors).toBe(0);
  });
});
