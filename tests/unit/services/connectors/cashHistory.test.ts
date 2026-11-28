/**
 * Bank operations read by a sync (Epic E52 — TGLA-254): what each sync reads, and how the bank's operations are
 * matched with the journal. The last 45 days follow the bank (booked, fixed, cancelled), keeping the row; older rows
 * are never touched; an operation the user deleted never comes back; a read that looks incomplete removes nothing.
 */
import { describe, it, expect } from 'vitest';
import {
    LIVE_WINDOW_DAYS,
    operationsWindow,
    planCashOperations,
    shiftDay,
    similarLabels,
} from '../../../../src/services/connectors/cashHistory';
import type { NormalizedActivity } from '../../../../src/types/connections';
import type { UnifiedTransaction } from '../../../../src/types/types.backend';

const NOW = Date.parse('2026-11-25T10:00:00.000Z');
const TODAY = '2026-11-25';
const LIVE_START = shiftDay(TODAY, -LIVE_WINDOW_DAYS);

const activity = (id: string, day: string, amount: string, label: string): NormalizedActivity => ({
    externalAccountId: 'cc', externalId: id, date: `${day}T00:00:00.000Z`, type: amount.startsWith('-') ? 'WITHDRAW' : 'DEPOSIT',
    rawType: 'card', label, rawLabel: label, amount, quantity: amount.replace('-', ''), currency: 'EUR',
});

const row = (id: string, externalId: string, day: string, amount: string, label: string): UnifiedTransaction => ({
    id, ownerId: 'u', accountId: 'acc', instrumentId: 'eur', batchId: 'b', rowHash: `h-${id}`, externalId,
    sourceOrigin: 'API', isSynthetic: false, isFiscal: false, sourceMode: 'history', transactionDate: `${day}T00:00:00.000Z`,
    type: amount.startsWith('-') ? 'WITHDRAW' : 'DEPOSIT', rawType: 'card', label, rawLabel: label, amountPrimary: amount,
    assetSymbol: 'EUR', quantity: amount.replace('-', ''), createdAt: '', updatedAt: '', version: 1,
});

const plan = (read: NormalizedActivity[], existing: UnifiedTransaction[], extra: Partial<{ deletedIds: Set<string>; complete: boolean }> = {}) =>
    planCashOperations({ read, existing, liveStart: LIVE_START, deletedIds: extra.deletedIds ?? new Set(), complete: extra.complete ?? true });

describe('what a sync reads', () => {
    it('reads 12 months the first time, then the last 45 days', () => {
        expect(operationsWindow({ now: NOW })).toEqual({ since: '2025-11-25', liveStart: LIVE_START, deep: true });
        expect(operationsWindow({ now: NOW, operationsFrom: '2025-11-25' })).toEqual({ since: LIVE_START, liveStart: LIVE_START, deep: false });
    });

    it('reads the whole history again when asked (right after a reconnection)', () => {
        expect(operationsWindow({ now: NOW, operationsFrom: '2025-11-25', deep: true }).since).toBe('2025-11-25');
    });

    it('starts at the connection start date, never before', () => {
        expect(operationsWindow({ now: NOW, historyStartDate: '2024-01-01' }).since).toBe('2024-01-01');
        const recent = operationsWindow({ now: NOW, historyStartDate: '2026-11-20T00:00:00.000Z' });
        expect(recent).toMatchObject({ since: '2026-11-20', liveStart: '2026-11-20' });
    });
});

describe('matching the bank with the journal', () => {
    it('adds what is new and leaves an unchanged operation alone', () => {
        const result = plan(
            [activity('a', '2026-11-20', '-12.00', 'CARTE BOULANGERIE'), activity('b', '2026-11-21', '-30.00', 'CARTE CINEMA')],
            [row('r-a', 'a', '2026-11-20', '-12.00', 'CARTE BOULANGERIE')],
        );
        expect(result.add.map(item => item.externalId)).toEqual(['b']);
        expect(result.update).toEqual([]);
        expect(result.remove).toEqual([]);
    });

    it('keeps the row of a pending payment once booked under a new id and label', () => {
        const stored = row('r-coffee', 'pending-1', '2026-11-22', '-4.50', 'CARTE X1234 CAFE DU COIN');
        const result = plan([activity('booked-1', '2026-11-23', '-4.50', 'CARTE 22/11 CAFE DU COIN PARIS')], [stored]);
        expect(result.add).toEqual([]);
        expect(result.update).toEqual([{ row: stored, activity: expect.objectContaining({ externalId: 'booked-1' }) }]);
    });

    it('updates an amount the bank fixed (within 1 %) on the same id', () => {
        const stored = row('r-fuel', 'f-1', '2026-11-18', '-60.00', 'CARTE TOTAL ENERGIES');
        const result = plan([activity('f-1', '2026-11-18', '-60.40', 'CARTE TOTAL ENERGIES')], [stored]);
        expect(result.update).toHaveLength(1);
    });

    it('removes a live operation the bank cancelled, never an older one', () => {
        const cancelled = row('r-x', 'x', '2026-11-15', '-25.00', 'CARTE AMAZON');
        const old = row('r-old', 'old', '2026-09-01', '-80.00', 'CARTE IKEA');
        const result = plan([activity('y', '2026-11-24', '-3.00', 'CARTE KIOSQUE')], [cancelled, old]);
        expect(result.remove).toEqual([cancelled]);
    });

    it('never touches a row older than the live window, even if the bank changed it', () => {
        const old = row('r-old', 'old', '2026-09-01', '-80.00', 'CARTE IKEA');
        const result = plan([activity('old', '2026-09-01', '-79.00', 'CARTE IKEA BOULOGNE')], [old]);
        expect(result.update).toEqual([]);
        expect(result.remove).toEqual([]);
    });

    it('does not bring back an operation the user deleted', () => {
        const result = plan([activity('gone', '2026-11-20', '-9.99', 'PRLV SPOTIFY')], [], { deletedIds: new Set(['gone']) });
        expect(result.add).toEqual([]);
    });

    it('removes nothing when the read was cut short or brings nothing in the live window', () => {
        const stored = row('r-x', 'x', '2026-11-15', '-25.00', 'CARTE AMAZON');
        expect(plan([activity('y', '2026-11-24', '-3.00', 'CARTE KIOSQUE')], [stored], { complete: false }).remove).toEqual([]);
        expect(plan([activity('z', '2026-08-01', '-3.00', 'CARTE KIOSQUE')], [stored]).remove).toEqual([]);
    });

    it('does not pair two different merchants with the same amount', () => {
        const stored = row('r-a', 'a', '2026-11-20', '-15.00', 'CARTE PHARMACIE CENTRALE');
        const result = plan([activity('b', '2026-11-21', '-15.00', 'CARTE LIBRAIRIE GIBERT')], [stored]);
        expect(result.add).toHaveLength(1);
        expect(result.remove).toEqual([stored]);
    });

    it('recognises labels of the same operation', () => {
        expect(similarLabels('CARTE X1234 CAFE DU COIN', 'CARTE 22/11 CAFE DU COIN PARIS')).toBe(true);
        expect(similarLabels('PRLV SEPA NETFLIX', 'NETFLIX.COM')).toBe(true);
        expect(similarLabels('CARTE PHARMACIE CENTRALE', 'CARTE LIBRAIRIE GIBERT')).toBe(false);
    });
});
