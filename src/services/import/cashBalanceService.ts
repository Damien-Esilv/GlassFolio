/**
 * Cash Balance Service (E28 — TGLA-102)
 *
 * Records cash balance statements (manual entry or CSV) as non-fiscal
 * BALANCE_ADJUSTMENT rows flagged `balanceStatement`. Each statement declares
 * the absolute balance at its date — a later statement replaces the earlier
 * one instead of adding to it (see positionLedger.isBalanceStatement).
 */

import { ImportBatch, UnifiedTransaction, ENGINE_VERSION, SourceOrigin } from '../../types/types.backend';
import { delay } from '../db';
import { transactionManager, computeRowHash, computeFileHash, CommitResult } from '../core/transactionManager';
import { instrumentService } from '../instrumentService';
import { portfolioService } from '../portfolioService';
import { parseCSVText } from './csvParser';
import { parseDate, parseDecimal, detectDateFormat } from './typeNormalizer';

export interface CashBalanceStatement {
    /** ISO 8601 date */
    date: string;
    /** Absolute balance, canonical decimal string */
    balance: string;
}

export interface RecordCashBalancesParams {
    accountId: string;
    currency: string;
    statements: CashBalanceStatement[];
    userId: string;
    source: 'MANUAL' | 'FILE';
    fileName: string;
    /** Raw file content, used for file-level idempotence */
    rawContent?: string;
}

const CURRENCY_NAMES: Record<string, string> = { EUR: 'Euro', USD: 'US Dollar', GBP: 'British Pound', CHF: 'Swiss Franc' };

/**
 * Extract balance statements from a CSV given the date and balance columns.
 * Rows with an unreadable date or amount are skipped and counted.
 */
export function extractCashStatements(
    csvText: string,
    dateColumn: string,
    balanceColumn: string
): { statements: CashBalanceStatement[]; skipped: number } {
    const { headers, rows } = parseCSVText(csvText);
    const dateIdx = headers.indexOf(dateColumn);
    const balanceIdx = headers.indexOf(balanceColumn);
    const dateHint = detectDateFormat(rows.map(r => r[dateIdx] || ''));

    const statements: CashBalanceStatement[] = [];
    let skipped = 0;
    for (const row of rows) {
        const date = parseDate(row[dateIdx] || '', dateHint);
        const balance = parseDecimal(row[balanceIdx]);
        if (!date || balance === null) {
            skipped++;
            continue;
        }
        statements.push({ date, balance });
    }
    return { statements, skipped };
}

/**
 * Persist balance statements atomically and refresh derived positions.
 */
export async function recordCashBalances(params: RecordCashBalancesParams): Promise<CommitResult & { batch?: ImportBatch }> {
    await delay(200);

    const { accountId, currency, statements, userId, source, fileName } = params;
    if (statements.length === 0) {
        return { success: false, transactionCount: 0, batchId: null, error: 'No valid balance statement' };
    }

    const instrument = await instrumentService.findOrCreateInstrument({
        symbol: currency,
        name: CURRENCY_NAMES[currency] || currency,
        currencyCode: currency
    });

    const now = new Date().toISOString();
    const batchId = `batch-cash-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const rawType = source === 'MANUAL' ? 'Manual Cash Balance' : 'CSV Cash Balance';

    const transactions: UnifiedTransaction[] = await Promise.all(statements.map(async (statement, index) => ({
        id: `utx-cash-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 6)}`,
        ownerId: userId,
        batchId,
        accountId,
        instrumentId: instrument.id,
        rowHash: await computeRowHash(statement.date, statement.balance, currency, 'BALANCE_ADJUSTMENT', '0'),
        sourceOrigin: source as SourceOrigin,
        isSynthetic: true,
        isFiscal: false,
        sourceMode: 'snapshot' as const,
        transactionDate: statement.date,
        type: 'BALANCE_ADJUSTMENT' as const,
        rawType,
        label: `${statement.balance} ${currency}`,
        rawLabel: rawType,
        amountPrimary: statement.balance,
        assetSymbol: currency,
        priceUnit: '1',
        quantity: statement.balance,
        createdAt: now,
        updatedAt: now,
        version: 1,
        metadata: { balanceStatement: true }
    })));

    const batch: ImportBatch = {
        id: batchId,
        ownerId: userId,
        accountId,
        importMode: 'snapshot',
        fileName,
        fileHash: params.rawContent ? await computeFileHash(params.rawContent) : `manual-${batchId}`,
        transactionCount: transactions.length,
        skippedCount: 0,
        importedAt: now,
        importedBy: userId,
        status: 'completed',
        engineVersion: ENGINE_VERSION
    };

    try {
        transactionManager.begin();
        transactionManager.addTransactions(transactions);
        transactionManager.addBatch(batch);
        const result = transactionManager.commit();
        if (!result.success) return result;
        await portfolioService.recalculatePositions();
        return { ...result, batch };
    } catch (error) {
        transactionManager.rollback();
        return {
            success: false,
            transactionCount: 0,
            batchId: null,
            error: error instanceof Error ? error.message : 'Commit failed'
        };
    }
}

export const cashBalanceService = {
    extractCashStatements,
    recordCashBalances
};
