import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { comparePFUvsBareme } from '../../src/services/fiscal/taxEngine';
import { getFiscalRulesOrThrow } from '../../src/services/fiscal/taxRules';
import type { FiscalProfile, TaxableEvent } from '../../src/types/types.backend';

const NUM_RUNS = Number(process.env.FAST_CHECK_RUNS || 200);
const rules2025 = getFiscalRulesOrThrow('2025', 'FR');

function makeGainEvent(amount: number, type: TaxableEvent['eventType'] = 'capital_gain'): TaxableEvent {
  return {
    transactionIds: ['tx-prop-1'],
    accountId: 'acc-1',
    eventDate: '2025-06-15',
    fiscalYear: '2025',
    eventType: type,
    symbol: 'CW8',
    instrumentName: 'Amundi MSCI World',
    wrapperType: 'CTO',
    grossAmount: Math.abs(amount),
    acquisitionCost: 1000,
    taxableAmount: amount,
    fees: 0,
    currency: 'EUR',
    confidence: 'determined',
    explanation: 'Property test event',
  };
}

describe('French Fiscal Engine Property-Based Invariants (TGLA-210)', () => {
  it('guarantees zero tax when net capital result is negative or fully offset by loss carryforward', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -500_000, max: 0, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 200_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 1, max: 5, noNaN: true, noDefaultInfinity: true }),
        (negativeResult, otherIncome, shares) => {
          const profile: FiscalProfile = {
            taxResidenceCountries: ['FR'],
            fiscalShares: Math.round(shares * 2) / 2,
            otherTaxableIncome: otherIncome,
          };
          const events = [makeGainEvent(negativeResult, 'capital_loss')];
          const res = comparePFUvsBareme(events, profile, rules2025, 0);

          expect(res.pfuTotal).toBe(0);
          expect(res.baremeTotal).toBe(0);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('enforces tax monotonicity and upper bounds (0 <= tax <= gain) as capital gains increase', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 10, max: 250_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 10, max: 250_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 300_000, noNaN: true, noDefaultInfinity: true }),
        fc.constantFrom(1, 1.5, 2, 2.5, 3, 4),
        (baseGain, deltaGain, otherIncome, fiscalShares) => {
          const higherGain = baseGain + deltaGain;
          const profile: FiscalProfile = {
            taxResidenceCountries: ['FR'],
            fiscalShares,
            otherTaxableIncome: otherIncome,
          };

          const lowerRes = comparePFUvsBareme([makeGainEvent(baseGain)], profile, rules2025, 0);
          const higherRes = comparePFUvsBareme([makeGainEvent(higherGain)], profile, rules2025, 0);

          // 1. Non-negativity & upper bound (< 100% of gross gain)
          expect(lowerRes.pfuTotal).toBeGreaterThanOrEqual(0);
          expect(lowerRes.pfuTotal).toBeLessThanOrEqual(baseGain);
          expect(lowerRes.baremeTotal).toBeGreaterThanOrEqual(0);
          expect(lowerRes.baremeTotal).toBeLessThanOrEqual(baseGain);

          // 2. Monotonicity: earning more never lowers total tax under either PFU or Barème
          expect(higherRes.pfuTotal).toBeGreaterThanOrEqual(lowerRes.pfuTotal - 1e-6);
          expect(higherRes.baremeTotal).toBeGreaterThanOrEqual(lowerRes.baremeTotal - 1e-6);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
