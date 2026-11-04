import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  buildLedger,
  buildRealizedEvents,
  CostBasisMethod,
  QTY_EPSILON,
} from '../../src/services/portfolio/positionLedger';
import type { UnifiedTransaction } from '../../src/types/types.backend';

const NUM_RUNS = Number(process.env.FAST_CHECK_RUNS || 200);

interface RawTradeSpec {
  type: 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW';
  quantity: number;
  priceUnit: number;
  feeAmount: number;
  dayOffset: number;
}

function toUnifiedTransactions(specs: RawTradeSpec[]): UnifiedTransaction[] {
  const baseEpoch = Date.UTC(2023, 0, 1, 12, 0, 0);
  return specs.map((spec, idx) => {
    const txTime = new Date(baseEpoch + (spec.dayOffset * 86_400_000) + idx * 1000).toISOString();
    const gross = spec.quantity * spec.priceUnit;
    return {
      id: `tx-prop-${idx}`,
      accountId: 'acc-prop-1',
      instrumentId: 'inst-prop-cw8',
      assetSymbol: 'CW8',
      assetName: 'Amundi MSCI World',
      type: spec.type,
      transactionDate: txTime,
      createdAt: txTime,
      quantity: spec.quantity.toFixed(8),
      priceUnit: spec.priceUnit.toFixed(4),
      amountPrimary: gross.toFixed(4),
      feeAmount: spec.feeAmount.toFixed(4),
      feeAsset: 'EUR',
      originalCurrency: 'EUR',
      source: 'PropertyTest',
    } as unknown as UnifiedTransaction;
  });
}

const tradeSpecArb = fc.record<RawTradeSpec>({
  type: fc.constantFrom('BUY', 'SELL', 'DEPOSIT', 'WITHDRAW'),
  quantity: fc.double({ min: 0.0001, max: 5000, noNaN: true, noDefaultInfinity: true }),
  priceUnit: fc.double({ min: 0.01, max: 10000, noNaN: true, noDefaultInfinity: true }),
  feeAmount: fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
  dayOffset: fc.integer({ min: 0, max: 1000 }),
});

describe('Position Ledger Algebraic Property-Based Invariants (TGLA-210)', () => {
  it.each<CostBasisMethod>(['WAC', 'FIFO'])(
    'maintains non-negative finite holdings, lot conservation, and realized P&L sum under %s',
    (method) => {
      fc.assert(
        fc.property(fc.array(tradeSpecArb, { minLength: 1, maxLength: 40 }), (specs) => {
          const txs = toUnifiedTransactions(specs);
          const options = { methodFor: () => method };
          const ledger = buildLedger(txs, options);
          const events = buildRealizedEvents(txs, options);

          const entry = ledger.get('acc-prop-1:inst-prop-cw8');
          expect(entry).toBeDefined();
          if (!entry) return;

          const { state } = entry;

          // 1. Finiteness & Non-Negativity Invariant
          expect(Number.isFinite(state.quantity)).toBe(true);
          expect(Number.isFinite(state.costBasis)).toBe(true);
          expect(Number.isFinite(state.realizedPL)).toBe(true);
          expect(state.quantity).toBeGreaterThanOrEqual(0);
          expect(state.costBasis).toBeGreaterThanOrEqual(0);

          // 2. Zero-Quantity Implies Zero Cost Basis & Empty Lots
          if (state.quantity <= QTY_EPSILON) {
            expect(state.costBasis).toBe(0);
            expect(state.lots).toHaveLength(0);
          } else {
            // 3. Lot Sum Conservation Invariant (quantity always matches; cost sum matches FIFO costBasis)
            const lotsQty = state.lots.reduce((sum, lot) => sum + lot.quantity, 0);
            expect(Math.abs(lotsQty - state.quantity)).toBeLessThanOrEqual(1e-5);
            if (method === 'FIFO') {
              const lotsCost = state.lots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0);
              expect(Math.abs(lotsCost - state.costBasis)).toBeLessThanOrEqual(1e-3);
            }
          }

          // 4. Realized P&L Conservation: sum(events.realizedPL) === state.realizedPL
          const sumEventPL = events.reduce((sum, ev) => sum + ev.realizedPL, 0);
          expect(Math.abs(sumEventPL - state.realizedPL)).toBeLessThanOrEqual(1e-5);

          // 5. Every Sale Event Satisfies proceeds - costRemoved - fees === realizedPL
          for (const ev of events) {
            expect(ev.quantity).toBeGreaterThanOrEqual(0);
            expect(ev.costRemoved).toBeGreaterThanOrEqual(-1e-6);
            expect(Math.abs(ev.proceeds - ev.costRemoved - ev.fees - ev.realizedPL)).toBeLessThanOrEqual(1e-5);
          }
        }),
        { numRuns: NUM_RUNS }
      );
    }
  );

  it('produces identical LedgerState regardless of input array permutation when timestamps are distinct', () => {
    fc.assert(
      fc.property(
        fc.array(tradeSpecArb, { minLength: 2, maxLength: 25 }),
        fc.infiniteStream(fc.double({ min: 0, max: 1, noNaN: true })),
        (specs, randStream) => {
          // Enforce strictly distinct timestamps via unique index offset
          const distinctSpecs = specs.map((s, idx) => ({ ...s, dayOffset: idx }));
          const canonicalTxs = toUnifiedTransactions(distinctSpecs);

          // Fisher-Yates shuffle using fast-check stream
          const shuffledTxs = [...canonicalTxs];
          const iterator = randStream[Symbol.iterator]();
          for (let i = shuffledTxs.length - 1; i > 0; i--) {
            const r = iterator.next().value;
            const j = Math.floor(r * (i + 1));
            [shuffledTxs[i], shuffledTxs[j]] = [shuffledTxs[j], shuffledTxs[i]];
          }

          const canonicalState = buildLedger(canonicalTxs, { methodFor: () => 'FIFO' }).get(
            'acc-prop-1:inst-prop-cw8'
          )?.state;
          const shuffledState = buildLedger(shuffledTxs, { methodFor: () => 'FIFO' }).get(
            'acc-prop-1:inst-prop-cw8'
          )?.state;

          expect(shuffledState?.quantity).toBeCloseTo(canonicalState?.quantity ?? 0, 8);
          expect(shuffledState?.costBasis).toBeCloseTo(canonicalState?.costBasis ?? 0, 5);
          expect(shuffledState?.realizedPL).toBeCloseTo(canonicalState?.realizedPL ?? 0, 5);
        }
      ),
      { numRuns: Math.max(50, Math.floor(NUM_RUNS / 2)) }
    );
  });
});
