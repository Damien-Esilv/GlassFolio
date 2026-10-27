/**
 * Tests — positionLedger (E28 — TGLA-102)
 * Hand-computed scenarios for weighted average cost (PRU) and FIFO.
 */

import { describe, it, expect } from 'vitest';
import {
  applyTransaction,
  buildLedger,
  buildRealizedEvents,
  emptyLedgerState,
  quantityDelta,
  resolveFee,
  resolveQuantity,
  LedgerState,
} from '../../../../src/services/portfolio/positionLedger';
import type { UnifiedTransaction, CostBasisMethod } from '../../../../src/types/types.backend';

let seq = 0;
const tx = (partial: Partial<UnifiedTransaction>): UnifiedTransaction => {
  seq++;
  return {
    id: `tx-${seq}`,
    ownerId: 'u1',
    batchId: 'b1',
    accountId: 'acc-1',
    instrumentId: 'inst-1',
    rowHash: `h${seq}`,
    sourceOrigin: 'FILE',
    isSynthetic: false,
    isFiscal: true,
    sourceMode: 'history',
    transactionDate: `2024-01-${String(seq % 28 + 1).padStart(2, '0')}T00:00:00.000Z`,
    type: 'BUY',
    rawType: 'Buy',
    rawLabel: '',
    amountPrimary: '0',
    assetSymbol: 'AAPL',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    version: 1,
    ...partial,
  } as UnifiedTransaction;
};

const replay = (txs: UnifiedTransaction[], method: CostBasisMethod = 'WAC'): LedgerState =>
  txs.reduce((state, t) => applyTransaction(state, t, method), emptyLedgerState());

describe('resolveQuantity', () => {
  it('prefers explicit quantity, then amount / price, then amount', () => {
    expect(resolveQuantity({ quantity: '5', amountPrimary: '927.5', priceUnit: '185.5' })).toBe(5);
    expect(resolveQuantity({ quantity: undefined, amountPrimary: '927.5', priceUnit: '185.5' })).toBe(5);
    expect(resolveQuantity({ quantity: undefined, amountPrimary: '-0.025', priceUnit: undefined })).toBe(0.025);
  });
});

describe('weighted average cost (PRU)', () => {
  it('buy, buy, partial sell: PRU unchanged by the sale, realized P&L correct', () => {
    const state = replay([
      tx({ type: 'BUY', quantity: '10', priceUnit: '100', amountPrimary: '1000' }),
      tx({ type: 'BUY', quantity: '10', priceUnit: '200', amountPrimary: '2000' }),
      tx({ type: 'SELL', quantity: '5', priceUnit: '250', amountPrimary: '1250' }),
    ]);
    expect(state.quantity).toBe(15);
    expect(state.costBasis).toBeCloseTo(2250); // PRU 150 × 15
    expect(state.costBasis / state.quantity).toBeCloseTo(150);
    expect(state.realizedPL).toBeCloseTo(500); // 1250 − 5 × 150
  });

  it('adds buy fees to the cost basis and deducts sell fees from realized P&L', () => {
    const state = replay([
      tx({ type: 'BUY', quantity: '10', priceUnit: '100', amountPrimary: '1000', feeAmount: '10' }),
      tx({ type: 'SELL', quantity: '10', priceUnit: '120', amountPrimary: '1200', feeAmount: '5' }),
    ]);
    expect(state.quantity).toBe(0);
    expect(state.costBasis).toBe(0);
    expect(state.realizedPL).toBeCloseTo(1200 - 1010 - 5);
  });

  it('uses qty × price rather than a fee-inclusive total column', () => {
    // Bitget: Total_USDT 702.70 already contains the 0.702 fee
    const state = replay([tx({ type: 'BUY', quantity: '0.012', priceUnit: '58500', amountPrimary: '702.70', feeAmount: '0.702' })]);
    expect(state.costBasis).toBeCloseTo(702 + 0.702);
  });

  it('ignores a fee paid in the traded asset itself', () => {
    const state = replay([tx({ type: 'BUY', quantity: '1', priceUnit: '100', amountPrimary: '100', feeAmount: '0.001', feeAsset: 'BTC', assetSymbol: 'BTC' })]);
    expect(state.costBasis).toBe(100);
  });

  it('resets cost after a full exit, then a re-entry starts fresh', () => {
    const state = replay([
      tx({ type: 'BUY', quantity: '10', priceUnit: '100' }),
      tx({ type: 'SELL', quantity: '10', priceUnit: '150' }),
      tx({ type: 'BUY', quantity: '2', priceUnit: '300' }),
    ]);
    expect(state.quantity).toBe(2);
    expect(state.costBasis / state.quantity).toBeCloseTo(300);
  });

  it('clamps an oversell to the held quantity', () => {
    const state = replay([
      tx({ type: 'BUY', quantity: '1', priceUnit: '100' }),
      tx({ type: 'SELL', quantity: '3', priceUnit: '100' }),
    ]);
    expect(state.quantity).toBe(0);
  });
});

describe('FIFO', () => {
  it('consumes the oldest lots first', () => {
    const txs = [
      tx({ type: 'BUY', quantity: '10', priceUnit: '100' }),
      tx({ type: 'BUY', quantity: '10', priceUnit: '200' }),
      tx({ type: 'SELL', quantity: '15', priceUnit: '250' }),
    ];
    const fifo = replay(txs, 'FIFO');
    expect(fifo.quantity).toBe(5);
    expect(fifo.costBasis).toBeCloseTo(1000); // 5 left from the 200 lot
    expect(fifo.realizedPL).toBeCloseTo(3750 - (1000 + 1000));

    const wac = replay(txs, 'WAC');
    expect(wac.costBasis).toBeCloseTo(750); // 5 × 150
  });

  it('matches WAC when there are no sales', () => {
    const txs = [tx({ type: 'BUY', quantity: '3', priceUnit: '10' }), tx({ type: 'BUY', quantity: '1', priceUnit: '30' })];
    expect(replay(txs, 'FIFO').costBasis).toBeCloseTo(replay(txs, 'WAC').costBasis);
  });
});

describe('snapshot adjustments', () => {
  it('a decrease adjustment reduces the position (regression: used to increase it)', () => {
    const decrease = tx({
      type: 'BALANCE_ADJUSTMENT', quantity: '4', priceUnit: '100', amountPrimary: '400', sourceMode: 'snapshot',
      metadata: { reconciliationType: 'decrease', costDelta: -400 },
    });
    expect(quantityDelta(decrease)).toBe(-4);
    const state = replay([tx({ type: 'BUY', quantity: '10', priceUnit: '100' }), decrease]);
    expect(state.quantity).toBe(6);
    expect(state.costBasis).toBeCloseTo(600);
  });

  it('a cost-only adjustment changes the PRU without touching the quantity', () => {
    const state = replay([
      tx({ type: 'BUY', quantity: '10', priceUnit: '100' }),
      tx({ type: 'BALANCE_ADJUSTMENT', quantity: '0', amountPrimary: '50', metadata: { reconciliationType: 'none', costDelta: -50 } }),
    ]);
    expect(state.quantity).toBe(10);
    expect(state.costBasis / state.quantity).toBeCloseTo(95);
  });

  it('keeps legacy increase adjustments (no metadata) working', () => {
    const state = replay([tx({ type: 'SNAPSHOT_ADJUSTMENT', quantity: '3', priceUnit: '50', amountPrimary: '-150' })]);
    expect(state.quantity).toBe(3);
    expect(state.costBasis).toBe(150);
  });

  it('treats cash balance statements as absolute balances (legacy and new format)', () => {
    const state = replay([
      tx({ type: 'BALANCE_ADJUSTMENT', rawType: 'Manual Cash Statement', quantity: '1', priceUnit: '1000', amountPrimary: '1000' }),
      tx({ type: 'BALANCE_ADJUSTMENT', rawType: 'CSV Cash Statement', quantity: '1', priceUnit: '1200', amountPrimary: '1200' }),
    ]);
    expect(state.quantity).toBe(1200);
    const next = applyTransaction(state, tx({ type: 'BALANCE_ADJUSTMENT', rawType: 'Cash Balance', amountPrimary: '800', metadata: { balanceStatement: true } }));
    expect(next.quantity).toBe(800);
  });
});

describe('buildLedger', () => {
  it('replays in chronological order regardless of input order and groups by account', () => {
    const sell = tx({ type: 'SELL', quantity: '5', priceUnit: '120', transactionDate: '2024-03-01T00:00:00.000Z' });
    const buy = tx({ type: 'BUY', quantity: '10', priceUnit: '100', transactionDate: '2024-01-01T00:00:00.000Z' });
    const other = tx({ type: 'BUY', quantity: '1', priceUnit: '10', accountId: 'acc-2' });
    const ledger = buildLedger([sell, buy, other]);
    expect(ledger.get('acc-1:inst-1')?.state.quantity).toBe(5);
    expect(ledger.get('acc-2:inst-1')?.state.quantity).toBe(1);
  });
});

describe('WAC and FIFO on the same lots', () => {
  const lots = () => [
    tx({ type: 'BUY', quantity: '10', priceUnit: '100', amountPrimary: '1000', transactionDate: '2024-01-01T00:00:00.000Z' }),
    tx({ type: 'BUY', quantity: '10', priceUnit: '200', amountPrimary: '2000', transactionDate: '2024-02-01T00:00:00.000Z' }),
    tx({ type: 'SELL', quantity: '10', priceUnit: '250', amountPrimary: '2500', transactionDate: '2024-03-01T00:00:00.000Z' }),
  ];

  it('keeps the same quantity but a different PRU and realized gain', () => {
    const wac = replay(lots(), 'WAC');
    const fifo = replay(lots(), 'FIFO');

    expect(wac.quantity).toBe(10);
    expect(fifo.quantity).toBe(10);
    expect(wac.costBasis / wac.quantity).toBeCloseTo(150);
    expect(fifo.costBasis / fifo.quantity).toBeCloseTo(200);
    expect(wac.realizedPL).toBeCloseTo(1000);
    expect(fifo.realizedPL).toBeCloseTo(1500);
  });
});

describe('ledger hardening', () => {
  it('never lets the cost basis go negative on a cost-only adjustment', () => {
    const state = replay([
      tx({ type: 'BUY', quantity: '1', priceUnit: '100', amountPrimary: '100' }),
      tx({ type: 'SNAPSHOT_ADJUSTMENT', quantity: '0', amountPrimary: '150', metadata: { reconciliationType: 'none', costDelta: -150 } }),
    ]);
    expect(state.quantity).toBe(1);
    expect(state.costBasis).toBe(0);
    expect(state.lots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0)).toBeGreaterThanOrEqual(0);
  });

  it('charges only the part of a sell fee that matches the quantity actually sold', () => {
    const state = replay([
      tx({ type: 'BUY', quantity: '5', priceUnit: '100', amountPrimary: '500' }),
      tx({ type: 'SELL', quantity: '10', priceUnit: '250', amountPrimary: '2500', feeAmount: '10' }),
    ]);
    expect(state.quantity).toBe(0);
    expect(state.realizedPL).toBeCloseTo(1250 - 500 - 5);
  });
});

describe('resolveFee', () => {
  const fee = (feeAmount: string, feeAsset?: string) =>
    resolveFee({ feeAmount, feeAsset, assetSymbol: 'BTC' });

  it('counts a fee with no asset, in a currency or in a stablecoin as a cash cost', () => {
    expect(fee('2')).toBe(2);
    expect(fee('2', 'EUR')).toBe(2);
    expect(fee('0.5', 'USDT')).toBe(0.5);
    expect(fee('-3', 'USDC')).toBe(3);
  });

  it('does not count a fee paid in the traded coin or in another crypto', () => {
    expect(fee('0.001', 'BTC')).toBe(0);
    expect(fee('0.002', 'BNB')).toBe(0);
  });

  it('keeps BNB fees out of the cost basis of a purchase', () => {
    const state = replay([tx({ type: 'BUY', quantity: '1', priceUnit: '100', amountPrimary: '100', assetSymbol: 'BTC', feeAmount: '0.002', feeAsset: 'BNB' })]);
    expect(state.costBasis).toBe(100);
  });
});

describe('buildRealizedEvents', () => {
  const journal = (): UnifiedTransaction[] => [
    tx({ type: 'BUY', quantity: '10', priceUnit: '100', amountPrimary: '1000', transactionDate: '2024-01-01T00:00:00.000Z' }),
    tx({ type: 'SELL', quantity: '4', priceUnit: '150', amountPrimary: '600', transactionDate: '2024-03-10T00:00:00.000Z' }),
    tx({ type: 'SELL', quantity: '6', priceUnit: '90', amountPrimary: '540', transactionDate: '2024-05-02T00:00:00.000Z' }),
    tx({ type: 'BUY', quantity: '1', priceUnit: '10', amountPrimary: '10', accountId: 'acc-2', transactionDate: '2024-02-01T00:00:00.000Z' }),
  ];

  it('returns one dated event per sell with the gain of that sale', () => {
    const events = buildRealizedEvents(journal());

    expect(events.map(e => [e.date.slice(0, 10), e.key, Math.round(e.realizedPL)])).toEqual([
      ['2024-03-10', 'acc-1:inst-1', 200],
      ['2024-05-02', 'acc-1:inst-1', -60],
    ]);
  });

  it('adds up to the realized P&L of the ledger, for both methods', () => {
    (['WAC', 'FIFO'] as const).forEach(method => {
      const options = { methodFor: () => method };
      const total = buildRealizedEvents(journal(), options).reduce((sum, e) => sum + e.realizedPL, 0);
      const ledger = buildLedger(journal(), options).get('acc-1:inst-1');
      expect(total).toBeCloseTo(ledger?.state.realizedPL ?? NaN);
    });
  });

  it('exposes what a tax figure needs: quantity sold, proceeds, removed cost and fees', () => {
    const [event] = buildRealizedEvents([
      tx({ type: 'BUY', quantity: '10', priceUnit: '100', amountPrimary: '1000', feeAmount: '10', transactionDate: '2024-01-01T00:00:00.000Z' }),
      tx({ type: 'SELL', quantity: '4', priceUnit: '150', amountPrimary: '600', feeAmount: '5', transactionDate: '2024-03-10T00:00:00.000Z' }),
    ]);

    expect(event.quantity).toBeCloseTo(4);
    expect(event.proceeds).toBeCloseTo(600);
    expect(event.costRemoved).toBeCloseTo(404); // 4 × 101
    expect(event.fees).toBeCloseTo(5);
    expect(event.realizedPL).toBeCloseTo(600 - 404 - 5);
  });

  it('puts purchases before sales when rows share the same timestamp', () => {
    const sell = tx({ type: 'SELL', quantity: '10', priceUnit: '110', transactionDate: '2024-03-01', createdAt: '2024-03-01T00:00:00.000Z' });
    const buy = tx({ type: 'BUY', quantity: '10', priceUnit: '100', transactionDate: '2024-03-01', createdAt: '2024-03-01T00:00:00.000Z' });

    expect(buildLedger([sell, buy]).get('acc-1:inst-1')?.state.realizedPL).toBeCloseTo(100);
  });
});
