import { describe, it, expect } from 'vitest';
import { calculateWeeklyTrackingStreak, calculateLongestWeeklyStreak } from '../../../src/services/achievementService';
import type { Transaction } from '../../../src/types';

// Local dates (like tests/unit/utils/date.test.ts), so the result does not depend on the machine timezone.
const NOW = new Date(2026, 9, 28, 12); // Wednesday 28 Oct 2026, ISO week starting Monday 26 Oct
const tx = (y: number, m: number, d: number, status: 'Completed' | 'Pending' = 'Completed'): Transaction =>
    ({ id: `${y}-${m}-${d}`, date: new Date(y, m, d, 10).toISOString(), status } as unknown as Transaction);

describe('calculateWeeklyTrackingStreak', () => {
    it('is 0 without any transaction, and with only invalid dates', () => {
        expect(calculateWeeklyTrackingStreak([], NOW)).toBe(0);
        expect(calculateWeeklyTrackingStreak([{ date: 'not-a-date', status: 'Completed' } as unknown as Transaction], NOW)).toBe(0);
    });

    it('counts consecutive weeks up to the current one', () => {
        const txs = [tx(2026, 9, 27), tx(2026, 9, 21), tx(2026, 9, 14), tx(2026, 9, 6)];
        expect(calculateWeeklyTrackingStreak(txs, NOW)).toBe(4);
    });

    it('is broken by a week without activity', () => {
        const txs = [tx(2026, 9, 27), tx(2026, 9, 21), tx(2026, 9, 6)]; // 12-18 Oct is empty
        expect(calculateWeeklyTrackingStreak(txs, NOW)).toBe(2);
    });

    it('still counts through last week when nothing happened yet this week', () => {
        const txs = [tx(2026, 9, 21), tx(2026, 9, 14)];
        expect(calculateWeeklyTrackingStreak(txs, NOW)).toBe(2);
    });

    it('is 0 once the last activity is older than last week', () => {
        expect(calculateWeeklyTrackingStreak([tx(2026, 9, 14), tx(2026, 9, 7)], NOW)).toBe(0);
    });

    it('does not turn a long history into a streak: 20 scattered weeks are not 20 in a row', () => {
        const scattered = Array.from({ length: 20 }, (_, i) => tx(2025, 0, 6 + i * 14)); // every other week
        expect(calculateWeeklyTrackingStreak(scattered, NOW)).toBe(0);
    });

    it('ignores pending and future-dated transactions', () => {
        const txs = [tx(2026, 9, 27, 'Pending'), tx(2026, 10, 3), tx(2026, 9, 21)];
        expect(calculateWeeklyTrackingStreak(txs, NOW)).toBe(1);
    });

    it('counts several transactions of the same week once', () => {
        expect(calculateWeeklyTrackingStreak([tx(2026, 9, 26), tx(2026, 9, 27), tx(2026, 9, 28)], NOW)).toBe(1);
    });

    it('follows ISO weeks across New Year (Mon 29 Dec 2025 to Sun 4 Jan 2026 is one week)', () => {
        const now = new Date(2026, 0, 14, 12); // week of Mon 12 Jan
        const txs = [tx(2026, 0, 13), tx(2026, 0, 6), tx(2026, 0, 1), tx(2025, 11, 30), tx(2025, 11, 23)];
        // 12 Jan, 5 Jan, (1 Jan and 30 Dec share the week of 29 Dec), 22 Dec
        expect(calculateWeeklyTrackingStreak(txs, now)).toBe(4);
    });
});

describe('calculateLongestWeeklyStreak (the streak shown on the dashboard)', () => {
    it('is 0 without usable transactions', () => {
        expect(calculateLongestWeeklyStreak([], NOW)).toBe(0);
        expect(calculateLongestWeeklyStreak([tx(2026, 10, 3), tx(2026, 9, 27, 'Pending')], NOW)).toBe(0);
    });

    it('comes from the dates of the trades, wherever they are: a 2024 history keeps the streak it earned', () => {
        // one trade every week from 1 Jul 2024: 8 weeks in a row, then a gap, then 2 more
        const weekly = Array.from({ length: 8 }, (_, i) => tx(2024, 6, 1 + i * 7));
        const later = [tx(2024, 8, 30), tx(2024, 9, 7)];
        expect(calculateLongestWeeklyStreak([...weekly, ...later], NOW)).toBe(8);
        // the current streak is another thing: nothing this week or last week
        expect(calculateWeeklyTrackingStreak([...weekly, ...later], NOW)).toBe(0);
    });

    it('takes the best run, not the most recent or the total of active weeks', () => {
        const run3 = [tx(2025, 0, 6), tx(2025, 0, 13), tx(2025, 0, 20)];
        const run2 = [tx(2025, 5, 2), tx(2025, 5, 9)];
        const isolated = [tx(2025, 8, 1)];
        expect(calculateLongestWeeklyStreak([...run2, ...isolated, ...run3], NOW)).toBe(3);
    });

    it('counts a week once however many trades it has, and follows ISO weeks across New Year', () => {
        const txs = [tx(2025, 11, 23), tx(2025, 11, 24), tx(2025, 11, 30), tx(2026, 0, 1), tx(2026, 0, 6)];
        // weeks of 22 Dec, 29 Dec (30 Dec and 1 Jan together) and 5 Jan
        expect(calculateLongestWeeklyStreak(txs, NOW)).toBe(3);
    });
});
