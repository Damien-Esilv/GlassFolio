import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../src/services/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../src/services/db')>();
  return { ...actual, delay: () => Promise.resolve() };
});

import { calculateReconciliation } from '../../../../src/services/import/snapshotService';
import type { ExistingPosition, SnapshotPosition } from '../../../../src/services/import/snapshotService';

const held = (symbol: string, quantity: string): ExistingPosition => ({
  assetKey: symbol, assetSymbol: symbol, quantity, totalCost: '1000', avgPrice: '100',
} as unknown as ExistingPosition);
const row = (symbol: string, quantity: string): SnapshotPosition => ({
  assetKey: symbol, assetSymbol: symbol, displayName: symbol, quantity, avgPrice: '100',
} as unknown as SnapshotPosition);

describe('snapshot reconciliation keeps assets of unreadable rows (TGLA-188)', () => {
  it('never closes an asset listed on a row that has an error', async () => {
    const existing = [held('AAPL', '10'), held('MSFT', '5')];
    // MSFT's row could not be read (bad number): it is listed, so it is not "missing"
    const result = await calculateReconciliation([row('AAPL', '10')], existing, {
      closeMissing: true,
      keepAssets: [{ assetSymbol: 'MSFT' } as SnapshotPosition],
    });

    expect(result.diffs.some(d => d.isClosure && d.assetSymbol === 'MSFT')).toBe(false);
  });

  it('still closes an asset the file does not list at all', async () => {
    const result = await calculateReconciliation([row('AAPL', '10')], [held('AAPL', '10'), held('MSFT', '5')], { closeMissing: true });
    expect(result.diffs.some(d => d.isClosure && d.assetSymbol === 'MSFT')).toBe(true);
  });
});
