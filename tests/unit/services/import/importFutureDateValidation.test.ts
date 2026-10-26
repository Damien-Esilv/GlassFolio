/**
 * Import Future Dates Validation Tests
 *
 * Verifies that:
 * 1. Transaction imports (CSV) reject future dates with status 'error' and code 'DATE_FUTURE'.
 * 2. Formatted error messages provide localized feedback (FR & EN).
 * 3. CommitBatch refuses to commit error rows or future dated transactions.
 * 4. Snapshot imports reject future purchase dates and snapshot reference dates.
 * 5. Cash balance statements ignore or reject future dates.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseFile, commitBatch } from '../../../../src/services/import/importManager';
import { parseSnapshotFile, buildSnapshotCommit } from '../../../../src/services/import/snapshotService';
import { extractCashStatements, recordCashBalances } from '../../../../src/services/import/cashBalanceService';
import { validateDate } from '../../../../src/services/core/validationService';
import { formatFieldError } from '../../../../src/components/import/formatFieldError';
import { db } from '../../../../src/services/db';
import { vaultService } from '../../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import type { TFunction } from 'i18next';
import fs from 'fs';
import path from 'path';

// Mock DB delay
vi.mock('../../../../src/services/db', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../../src/services/db')>();
    return { ...actual, delay: () => Promise.resolve() };
});

const enCommon = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../../../locales/en/common.json'), 'utf-8')
);
const frCommon = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../../../locales/fr/common.json'), 'utf-8')
);

// Lightweight t-function mock for testing i18n resolution
const createMockT = (locale: 'en' | 'fr'): TFunction => {
    const dict = locale === 'fr' ? frCommon : enCommon;
    return ((key: string) => {
        const parts = key.replace('common:', '').split('.');
        let val: any = dict;
        for (const p of parts) {
            val = val?.[p];
        }
        return val || key;
    }) as unknown as TFunction;
};

const setupRealUserVault = async () => {
    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('import.tester@example.test', 'Real-Investor-Test-Key-2026!#', 'Import Tester');
};

describe('Import Engine — Future Dates Rejection & Validation', () => {
    beforeEach(async () => {
        await setupRealUserVault();
    });

    describe('validateDate standalone validator', () => {
        it('accepts past dates and today', () => {
            const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
            const today = new Date().toISOString();

            expect(validateDate(yesterday)).toEqual([]);
            expect(validateDate(today)).toEqual([]);
        });

        it('allows +1 day tolerance for UTC/local timezone shifts', () => {
            const in12Hours = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
            expect(validateDate(in12Hours)).toEqual([]);
        });

        it('rejects dates in the future beyond timezone tolerance with DATE_FUTURE code', () => {
            const inTwoDays = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
            const inOneYear = '2030-01-01T00:00:00.000Z';

            const errsTwoDays = validateDate(inTwoDays);
            expect(errsTwoDays.some(e => e.code === 'DATE_FUTURE' && e.severity === 'error')).toBe(true);

            const errsOneYear = validateDate(inOneYear);
            expect(errsOneYear.some(e => e.code === 'DATE_FUTURE' && e.severity === 'error')).toBe(true);
        });
    });

    describe('Transaction CSV Import (parseFile)', () => {
        it('flags rows with future dates as status error and attaches DATE_FUTURE code', async () => {
            const futureDateStr = '2030-08-15';
            const pastDateStr = '2024-05-10';

            const csvContent = [
                'Date,Type,ISIN,Symbol,Quantity,Price,Amount,Description',
                `${pastDateStr},Buy,US0378331005,AAPL,10,150,1500,Achat Apple`,
                `${futureDateStr},Buy,US5949181045,MSFT,5,300,1500,Achat Microsoft`
            ].join('\n');

            const result = await parseFile(csvContent, {
                mode: 'history',
                accountId: 'acc-test-1',
                customMappings: {
                    transactionDate: 'Date',
                    type: 'Type',
                    assetIsin: 'ISIN',
                    assetSymbol: 'Symbol',
                    quantity: 'Quantity',
                    priceUnit: 'Price',
                    amountPrimary: 'Amount',
                    rawLabel: 'Description'
                }
            });

            expect(result.candidates).toHaveLength(2);

            // Past row is valid
            const validCandidate = result.candidates[0];
            expect(validCandidate.status).toBe('valid');
            expect(validCandidate.errors).toHaveLength(0);

            // Future row is marked as error
            const futureCandidate = result.candidates[1];
            expect(futureCandidate.status).toBe('error');
            expect(futureCandidate.errors.some(e => e.code === 'DATE_FUTURE')).toBe(true);
            expect(result.stats.errors).toBe(1);
            expect(result.stats.valid).toBe(1);
        });

        it('formats the DATE_FUTURE error message properly in French and English', () => {
            const tFr = createMockT('fr');
            const tEn = createMockT('en');

            const futureError = {
                field: 'transactionDate',
                message: 'Date cannot be in the future',
                severity: 'error' as const,
                code: 'DATE_FUTURE'
            };

            const frMsg = formatFieldError(tFr, futureError);
            const enMsg = formatFieldError(tEn, futureError);

            expect(frMsg).toBe('La date est dans le futur');
            expect(enMsg).toBe('Date is in the future');
        });
    });

    describe('commitBatch defense-in-depth', () => {
        it('refuses to commit error rows and returns explicit error', async () => {
            const futureDateStr = '2032-01-01T00:00:00.000Z';
            const stagedRow: any = {
                id: 'row-0',
                rowIndex: 0,
                originalRow: { Date: futureDateStr, Symbol: 'AAPL', Amount: '100' },
                status: 'error',
                rowHash: 'hash-err-1',
                resolution: 'import', // Client attempted to force resolution
                errors: [{ field: 'transactionDate', code: 'DATE_FUTURE', severity: 'error', message: 'Date cannot be in the future' }],
                parsed: {
                    transactionDate: futureDateStr,
                    type: 'BUY',
                    assetSymbol: 'AAPL',
                    amountPrimary: '100'
                }
            };

            const commitResult = await commitBatch(
                [stagedRow],
                'acc-test-1',
                'history',
                'test.csv',
                'filehash-123',
                'user-1'
            );

            expect(commitResult.success).toBe(false);
            expect(commitResult.transactionCount).toBe(0);
            expect(db.getUnifiedTransactions()).toHaveLength(0);
        });

        it('refuses to commit valid-status rows if transactionDate is in the future', async () => {
            const futureDateStr = '2035-06-15T10:00:00.000Z';
            const bypassedRow: any = {
                id: 'row-bypassed',
                rowIndex: 0,
                originalRow: { Date: futureDateStr },
                status: 'valid', // Spoofed status
                rowHash: 'hash-spoofed',
                resolution: 'import',
                errors: [],
                parsed: {
                    transactionDate: futureDateStr,
                    type: 'BUY',
                    assetSymbol: 'TSLA',
                    amountPrimary: '500'
                }
            };

            const commitResult = await commitBatch(
                [bypassedRow],
                'acc-test-1',
                'history',
                'spoofed.csv',
                'filehash-spoofed',
                'user-1'
            );

            expect(commitResult.success).toBe(false);
            expect(commitResult.error).toContain('future');
            expect(db.getUnifiedTransactions()).toHaveLength(0);
        });
    });

    describe('Snapshot CSV Import (parseSnapshotFile & buildSnapshotCommit)', () => {
        it('flags snapshot rows with future purchase dates as error', async () => {
            const csv = [
                'ISIN;Symbol;Name;Quantite;PRU;DateAchat',
                'FR0000120271;TTE;TotalEnergies;25;58.45;2024-01-10',
                'FR0000121014;MC;LVMH;3;725.80;2031-12-31'
            ].join('\n');

            const result = await parseSnapshotFile(csv, {
                assetIsin: 'ISIN',
                assetSymbol: 'Symbol',
                assetName: 'Name',
                quantity: 'Quantite',
                avgPrice: 'PRU',
                purchaseDate: 'DateAchat'
            });

            expect(result.positions).toHaveLength(2);
            expect(result.positions[0].status).toBe('valid');

            // Future row must be in error
            const futurePos = result.positions[1];
            expect(futurePos.status).toBe('error');
            expect(futurePos.errors.some(e => e.code === 'DATE_FUTURE')).toBe(true);
            expect(result.stats.valid).toBe(1);
            expect(result.stats.errors).toBe(1);
        });

        it('buildSnapshotCommit throws an error if reference date or purchaseDate is in the future', async () => {
            const validPos = {
                assetSymbol: 'CW8',
                quantity: '10',
                avgPrice: '400',
                purchaseDate: '2030-01-01T00:00:00.000Z', // Future
                displayName: 'Amundi MSCI World',
                assetKey: 'CW8'
            };

            await expect(buildSnapshotCommit({
                mode: 'replace',
                positions: [validPos],
                accountId: 'acc-test-1',
                batchId: 'batch-snap-test',
                date: new Date().toISOString(),
                userId: 'user-1'
            })).rejects.toThrow(/future/i);

            // Future snapshot date
            const futureSnapshotDate = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();
            await expect(buildSnapshotCommit({
                mode: 'replace',
                positions: [{ ...validPos, purchaseDate: '2024-01-01T00:00:00.000Z' }],
                accountId: 'acc-test-1',
                batchId: 'batch-snap-test-2',
                date: futureSnapshotDate,
                userId: 'user-1'
            })).rejects.toThrow(/future/i);
        });
    });

    describe('Cash Balance Import (extractCashStatements & recordCashBalances)', () => {
        it('skips cash balance rows with future dates during CSV extraction', () => {
            const csv = [
                'Date,Balance',
                '2024-01-01,1000.50',
                '2032-06-01,5000.00' // Future date
            ].join('\n');

            const { statements, skipped } = extractCashStatements(csv, 'Date', 'Balance');

            expect(statements).toHaveLength(1);
            expect(statements[0].balance).toBe('1000.5');
            expect(skipped).toBe(1);
        });

        it('recordCashBalances returns error if a statement has a future date', async () => {
            const futureStatement = {
                date: '2033-01-01T00:00:00.000Z',
                balance: '2500.00'
            };

            const result = await recordCashBalances({
                accountId: 'acc-test-1',
                currency: 'EUR',
                statements: [futureStatement],
                userId: 'user-1',
                source: 'FILE',
                fileName: 'cash.csv'
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('future');
        });
    });
});
