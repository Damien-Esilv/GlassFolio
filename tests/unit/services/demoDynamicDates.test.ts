import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    hoursAgoISO,
    daysAgoISO,
    monthsAgoISO,
    yearsAgoISO,
    toLegacyDateTime,
    currentYearString
} from '../../../src/utils/demoDates';
import {
    buildDemoInstitutes,
    buildDemoAccounts,
    buildDemoInstruments,
    buildDemoImportBatches,
    buildDemoUnifiedTransactions
} from '../../../src/services/mockData.backend';
import {
    buildDemoTransactions,
    buildDemoAlerts,
    buildDemoAlertRules,
    buildDemoDashboardChartData
} from '../../../src/services/mockData';
import { db } from '../../../src/services/db';
import { appStorage } from '../../../src/services/storage/appStorage';

describe('E32: Dynamic Dates Generation for Demo Mode', () => {
    const fixedNow = new Date('2026-10-26T12:00:00.000Z');

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(fixedNow);
        appStorage.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
        appStorage.clear();
    });

    describe('demoDates utility functions', () => {
        it('calculates hoursAgoISO correctly and ensures intraday relative timestamp', () => {
            const date2h = hoursAgoISO(2, fixedNow);
            const d = new Date(date2h);
            expect(d.getTime()).toBeLessThan(fixedNow.getTime());
            expect(date2h).toBe('2026-10-26T10:00:00.000Z');

            // Default parameter (2 hours)
            const defaultHours = hoursAgoISO(undefined, fixedNow);
            expect(defaultHours).toBe('2026-10-26T10:00:00.000Z');
        });

        it('calculates daysAgoISO correctly and never returns a date in the future', () => {
            const date7d = daysAgoISO(7, 10, 0, fixedNow);
            const d = new Date(date7d);
            expect(d.getTime()).toBeLessThan(fixedNow.getTime());
            expect(date7d).toContain('2026-10-19T10:00:00.000Z');

            // 0 days ago with late time clamps to before now
            const clamped = daysAgoISO(0, 23, 59, fixedNow);
            expect(new Date(clamped).getTime()).toBeLessThan(fixedNow.getTime());
        });

        it('calculates monthsAgoISO correctly with day clamping', () => {
            const date6m = monthsAgoISO(6, 15, 14, 0, fixedNow);
            const d = new Date(date6m);
            expect(d.getTime()).toBeLessThan(fixedNow.getTime());
            expect(d.getUTCMonth()).toBe(3); // April in 2026

            // Clamping on Feb 30 -> Feb 28 (or 29)
            const febClamp = monthsAgoISO(8, 31, 10, 0, fixedNow);
            const febDate = new Date(febClamp);
            expect(febDate.getUTCDate()).toBeLessThanOrEqual(29);
        });

        it('calculates yearsAgoISO accurately', () => {
            const date5y = yearsAgoISO(5, 0, 15, 10, 0, fixedNow);
            const d = new Date(date5y);
            expect(d.getUTCFullYear()).toBe(2021);
            expect(d.getTime()).toBeLessThan(fixedNow.getTime());
        });

        it('converts ISO to legacy format YYYY-MM-DD HH:mm:ss', () => {
            const iso = '2026-10-20T14:35:10.000Z';
            expect(toLegacyDateTime(iso)).toBe('2026-10-20 14:35:10');
        });

        it('returns current year string', () => {
            expect(currentYearString(fixedNow)).toBe('2026');
        });
    });

    describe('Backend Demo Entities Relative Timeline', () => {
        it('ensures no transaction or import date is in the future', () => {
            const txs = buildDemoUnifiedTransactions(fixedNow);
            const batches = buildDemoImportBatches(fixedNow);
            const accounts = buildDemoAccounts(fixedNow);
            const nowMs = fixedNow.getTime();

            txs.forEach(tx => {
                const txMs = new Date(tx.transactionDate).getTime();
                expect(txMs).toBeLessThanOrEqual(nowMs);
                expect(new Date(tx.createdAt).getTime()).toBeLessThanOrEqual(nowMs);
            });

            batches.forEach(b => {
                const batchMs = new Date(b.importedAt).getTime();
                expect(batchMs).toBeLessThanOrEqual(nowMs);
            });

            accounts.forEach(a => {
                if (a.openedAt) {
                    expect(new Date(a.openedAt).getTime()).toBeLessThanOrEqual(nowMs);
                }
            });
        });

        it('spreads events realistically from ~5 years ago to very recent', () => {
            const txs = buildDemoUnifiedTransactions(fixedNow);
            const batches = buildDemoImportBatches(fixedNow);
            const nowMs = fixedNow.getTime();

            // 1. Oldest transaction is ~5 years ago (>= 4 years ago)
            const timestamps = txs.map(t => new Date(t.transactionDate).getTime());
            const oldestMs = Math.min(...timestamps);
            const fourYearsMs = 4 * 365 * 24 * 60 * 60 * 1000;
            expect(nowMs - oldestMs).toBeGreaterThan(fourYearsMs);

            // 2. Recent transactions exist within the last 7 days (J-1 to J-7)
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            const recentTxs = txs.filter(t => (nowMs - new Date(t.transactionDate).getTime()) <= sevenDaysMs);
            expect(recentTxs.length).toBeGreaterThanOrEqual(1);

            // 3. Recent import batch exists within the last 7 days
            const recentBatches = batches.filter(b => (nowMs - new Date(b.importedAt).getTime()) <= sevenDaysMs);
            expect(recentBatches.length).toBeGreaterThanOrEqual(1);
        });

        it('maintains strict chronological consistency between accounts, transactions, and batches', () => {
            const txs = buildDemoUnifiedTransactions(fixedNow);
            const batches = buildDemoImportBatches(fixedNow);
            const accounts = buildDemoAccounts(fixedNow);

            const batchMap = new Map(batches.map(b => [b.id, b]));
            const accountMap = new Map(accounts.map(a => [a.id, a]));

            txs.forEach(tx => {
                // Batch importedAt must be >= transactionDate
                const batch = batchMap.get(tx.batchId);
                if (batch) {
                    const batchMs = new Date(batch.importedAt).getTime();
                    const txMs = new Date(tx.transactionDate).getTime();
                    expect(batchMs).toBeGreaterThanOrEqual(txMs);
                }

                // Account openedAt must be <= transactionDate
                const account = accountMap.get(tx.accountId);
                if (account?.openedAt) {
                    const accountMs = new Date(account.openedAt).getTime();
                    const txMs = new Date(tx.transactionDate).getTime();
                    expect(accountMs).toBeLessThanOrEqual(txMs);
                }
            });
        });

        it('ensures sales occur strictly after purchases for each asset', () => {
            const txs = buildDemoUnifiedTransactions(fixedNow);
            const symbolsWithSales = ['AAPL', 'MSFT', 'BTC', 'ETH'];

            symbolsWithSales.forEach(symbol => {
                const assetTxs = txs
                    .filter(t => t.assetSymbol === symbol)
                    .sort((a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime());

                expect(assetTxs.length).toBeGreaterThan(0);
                // First event must be BUY or DEPOSIT (never SELL)
                expect(['BUY', 'DEPOSIT']).toContain(assetTxs[0].type);

                // Each sell must have occurred after at least one purchase
                let cumulativeBought = 0;
                assetTxs.forEach(t => {
                    const qty = parseFloat(t.quantity || '0');
                    if (t.type === 'BUY' || t.type === 'DEPOSIT') {
                        cumulativeBought += qty;
                    } else if (t.type === 'SELL') {
                        expect(cumulativeBought).toBeGreaterThan(0);
                    }
                });
            });
        });

        it('includes an intraday transaction on the current day', () => {
            const txs = buildDemoUnifiedTransactions(fixedNow);
            const todayTx = txs.find(t => t.id === 'utx-recent-today');
            expect(todayTx).toBeDefined();
            const txDate = new Date(todayTx!.transactionDate);
            expect(txDate.getUTCFullYear()).toBe(fixedNow.getUTCFullYear());
            expect(txDate.getUTCMonth()).toBe(fixedNow.getUTCMonth());
            expect(txDate.getUTCDate()).toBe(fixedNow.getUTCDate());
            expect(txDate.getTime()).toBeLessThan(fixedNow.getTime());
        });
    });

    describe('Legacy Mock Data Timeline', () => {
        it('generates legacy transactions with relative dates in YYYY-MM-DD HH:mm:ss format', () => {
            const legacyTxs = buildDemoTransactions(fixedNow);
            expect(legacyTxs.length).toBeGreaterThanOrEqual(15);

            legacyTxs.forEach(t => {
                expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
                const txMs = new Date(t.date).getTime();
                expect(txMs).toBeLessThanOrEqual(fixedNow.getTime());
            });

            const todayTx = legacyTxs.find(t => t.id === 't-recent-today');
            expect(todayTx).toBeDefined();
            const txDate = new Date(todayTx!.date);
            expect(txDate.getUTCFullYear()).toBe(fixedNow.getUTCFullYear());
            expect(txDate.getUTCMonth()).toBe(fixedNow.getUTCMonth());
            expect(txDate.getUTCDate()).toBe(fixedNow.getUTCDate());

            // Recent transactions between J-7 and J-1
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            const recent = legacyTxs.filter(t => (fixedNow.getTime() - new Date(t.date).getTime()) <= sevenDaysMs);
            expect(recent.length).toBeGreaterThanOrEqual(2);
        });

        it('generates recent alerts and alert rules in the past', () => {
            const alerts = buildDemoAlerts(fixedNow);
            const alertRules = buildDemoAlertRules(fixedNow);

            alerts.forEach(a => {
                expect(new Date(a.date).getTime()).toBeLessThan(fixedNow.getTime());
            });

            alertRules.forEach(r => {
                expect(new Date(r.createdAt).getTime()).toBeLessThan(fixedNow.getTime());
            });
        });

        it('generates dynamic dashboard chart data rolling 12 months', () => {
            const chartData = buildDemoDashboardChartData(fixedNow);
            expect(chartData).toHaveLength(12);
            chartData.forEach(pt => {
                expect(pt.name).toBeDefined();
                expect(pt.value).toBeGreaterThan(0);
            });
        });
    });

    describe('db integration in Demo Mode', () => {
        it('returns freshly computed dynamic dates from db getters when localStorage is empty', () => {
            const transactions = db.getTransactions();
            const unified = db.getUnifiedTransactions();
            const batches = db.getImportBatches();
            const alerts = db.getAlerts();

            expect(transactions.length).toBeGreaterThan(0);
            expect(unified.length).toBeGreaterThan(0);
            expect(batches.length).toBeGreaterThan(0);
            expect(alerts.length).toBeGreaterThan(0);

            // All should be <= fixedNow
            transactions.forEach(t => {
                expect(new Date(t.date).getTime()).toBeLessThanOrEqual(fixedNow.getTime());
            });
            unified.forEach(t => {
                expect(new Date(t.transactionDate).getTime()).toBeLessThanOrEqual(fixedNow.getTime());
            });
        });

        it('adapts seamlessly when simulated in a future year (e.g. 2028)', () => {
            const futureNow = new Date('2028-06-15T10:00:00.000Z');
            vi.setSystemTime(futureNow);

            const txs = buildDemoUnifiedTransactions(futureNow);
            const batches = buildDemoImportBatches(futureNow);

            // Batches should reference 2028, not 2024
            expect(batches.some(b => b.fileName.includes('2028'))).toBe(true);

            // All transactions should be <= 2028-06-15
            txs.forEach(t => {
                expect(new Date(t.transactionDate).getTime()).toBeLessThanOrEqual(futureNow.getTime());
            });

            // Recent tx within 7 days of futureNow
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            const recent = txs.filter(t => (futureNow.getTime() - new Date(t.transactionDate).getTime()) <= sevenDaysMs);
            expect(recent.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Zero Future Dates Across Calendar Edge Cases & Future Years', () => {
        const testDates = [
            new Date('2024-02-29T12:00:00.000Z'), // Leap year day
            new Date('2025-12-31T23:59:59.999Z'), // Year end last millisecond
            new Date('2026-01-01T00:00:01.000Z'), // New year first second
            new Date('2026-02-28T23:00:00.000Z'), // Non-leap year Feb end
            new Date('2027-04-30T10:00:00.000Z'), // 30-day month end
            new Date('2028-02-29T08:30:00.000Z'), // Future leap year
            new Date('2030-07-15T15:45:00.000Z'), // Far future
            new Date('2040-01-01T12:00:00.000Z'), // Very far future
        ];

        testDates.forEach(refDate => {
            it(`guarantees ZERO future dates when evaluated at ${refDate.toISOString()}`, () => {
                vi.setSystemTime(refDate);
                const refMs = refDate.getTime();

                // 1. Utility functions
                for (let d = 0; d <= 30; d++) {
                    const iso = daysAgoISO(d, 23, 59, refDate);
                    expect(new Date(iso).getTime()).toBeLessThanOrEqual(refMs);
                }
                for (let m = 0; m <= 36; m++) {
                    const iso = monthsAgoISO(m, 31, 23, 59, refDate);
                    expect(new Date(iso).getTime()).toBeLessThanOrEqual(refMs);
                }
                for (let y = 0; y <= 5; y++) {
                    const iso = yearsAgoISO(y, 11, 31, 23, 59, refDate);
                    expect(new Date(iso).getTime()).toBeLessThanOrEqual(refMs);
                }

                // 2. Unified transactions
                const unified = buildDemoUnifiedTransactions(refDate);
                expect(unified.length).toBeGreaterThan(0);
                unified.forEach(t => {
                    const txMs = new Date(t.transactionDate).getTime();
                    expect(txMs).toBeLessThanOrEqual(refMs);
                    expect(new Date(t.createdAt).getTime()).toBeLessThanOrEqual(refMs);
                    if (t.valueDate) {
                        expect(new Date(t.valueDate).getTime()).toBeLessThanOrEqual(refMs);
                    }
                });

                // 3. Legacy transactions
                const legacy = buildDemoTransactions(refDate);
                expect(legacy.length).toBeGreaterThan(0);
                legacy.forEach(t => {
                    const tMs = new Date(t.date).getTime();
                    expect(tMs).toBeLessThanOrEqual(refMs);
                });

                // 4. Import batches
                const batches = buildDemoImportBatches(refDate);
                expect(batches.length).toBeGreaterThan(0);
                batches.forEach(b => {
                    expect(new Date(b.importedAt).getTime()).toBeLessThanOrEqual(refMs);
                });

                // 5. Accounts
                const accounts = buildDemoAccounts(refDate);
                expect(accounts.length).toBeGreaterThan(0);
                accounts.forEach(a => {
                    if (a.openedAt) {
                        expect(new Date(a.openedAt).getTime()).toBeLessThanOrEqual(refMs);
                    }
                });

                // 6. Alerts & Rules
                const alerts = buildDemoAlerts(refDate);
                alerts.forEach(a => {
                    expect(new Date(a.date).getTime()).toBeLessThanOrEqual(refMs);
                });

                const rules = buildDemoAlertRules(refDate);
                rules.forEach(r => {
                    expect(new Date(r.createdAt).getTime()).toBeLessThanOrEqual(refMs);
                    if (r.lastTriggeredAt) {
                        expect(new Date(r.lastTriggeredAt).getTime()).toBeLessThanOrEqual(refMs);
                    }
                });

                // 7. Dashboard chart data
                const chart = buildDemoDashboardChartData(refDate);
                expect(chart.length).toBe(12);
                // Last point of 12-month rolling chart is the current month
                chart.forEach(pt => {
                    expect(pt.value).toBeGreaterThan(0);
                });
            });
        });
    });
});
