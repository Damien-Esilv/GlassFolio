/**
 * Cash flow service (Epic E52 — TGLA-249). The pages, the assistant and the MCP bridge read and
 * change the cash flow through this service only; it reads the journal and the cash flow
 * collections from `db`, and keeps the artificial delay of the data layer.
 */
import { db, delay } from '../db';
import { appStorage } from '../storage/appStorage';
import { utf8ByteLength, VAULT_MAX_RECORD_BYTES, VAULT_MAX_TOTAL_BYTES } from '../storage/vaultQuota';
import { getDeploymentMode } from '../../config/deployment';
import { currencyService } from '../currencyService';
import { portfolioService } from '../portfolioService';
import { instrumentService } from '../instrumentService';
import { transactionManager, computeRowHash } from '../core/transactionManager';
import {
    ENGINE_VERSION,
    type ImportBatch,
    type UnifiedTransaction,
} from '../../types/types.backend';
import type {
    CashflowOperation,
    CashflowSummary,
    CashflowRecurringItem,
    CashflowTombstone,
    CashflowUpcoming,
    RecurringOccurrence,
    RecurringSeries,
    RecurringStatus,
} from '../../types/cashflow';
import { buildCashflowOperations, includedAccountIds, CASH_ACCOUNT_TYPES } from './operations';
import { summarizeCashflow } from './aggregator';
import { merchantKey } from './text';
import { addRecurringInterval, detectRecurringSeries, recurringOperationIds } from './recurring';
import { budgetMonthBounds, currentBudgetMonth, resolvePeriod, type CashflowPeriodPreset } from './period';
import { resolveCashflowCategory, topLevelCashflowCategoryId } from '../../constants/cashflowCategories';

export interface CashflowQuery {
    preset: CashflowPeriodPreset;
    /** Budget month (YYYY-MM) for the 'month' preset */
    month?: string;
    /** Restrict to these accounts (all included accounts when omitted) */
    accountIds?: string[];
    /** Base currency of the amounts (the user's currency) */
    currency?: string;
}

export interface OperationFilter {
    /** YYYY-MM-DD inclusive */
    start?: string;
    /** YYYY-MM-DD exclusive */
    end?: string;
    categoryId?: string;
    accountIds?: string[];
    instituteId?: string;
    uncategorizedOnly?: boolean;
    direction?: 'in' | 'out';
    search?: string;
    limit?: number;
    currency?: string;
}

export interface ManualOperationInput {
    accountId: string;
    /** ISO date or date-time */
    date: string;
    /** Signed: negative = money out */
    amount: number;
    label: string;
    categoryId?: string;
    note?: string;
}

export interface OperationEdit {
    categoryId?: string | null;
    displayLabel?: string | null;
    note?: string | null;
    excluded?: boolean;
    /** Imported and manual operations only */
    date?: string;
    amount?: number;
    accountId?: string;
}

export type CashflowResult<T = undefined> = { success: true; value: T } | { success: false; error: string };

const CURRENCY_NAMES: Record<string, string> = { EUR: 'Euro', USD: 'US Dollar', GBP: 'British Pound', CHF: 'Swiss Franc' };
const MAX_LABEL = 140;
const MAX_NOTE = 500;

const randomSuffix = (): string =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const ownerId = (): string => db.getAccounts()[0]?.ownerId ?? 'default-user';

/** Every cash flow operation, categorised, in `currency`. */
async function loadOperations(currency: string): Promise<CashflowOperation[]> {
    const journal = db.getUnifiedTransactions();
    const accounts = db.getAccounts();
    const currencies = new Set<string>([currency.toUpperCase()]);
    for (const account of accounts) if (account.defaultCurrency) currencies.add(account.defaultCurrency.toUpperCase());
    for (const tx of journal) {
        if (/^[A-Z]{3}$/.test(tx.assetSymbol ?? '')) currencies.add(tx.assetSymbol);
        if (tx.originalCurrency) currencies.add(tx.originalCurrency.toUpperCase());
    }
    let rates: Record<string, number> = {};
    try {
        rates = await currencyService.getExchangeRates([...currencies], currency);
    } catch {
        rates = { [currency.toUpperCase()]: 1 };
    }
    return buildCashflowOperations({
        journal,
        accounts,
        institutes: db.getInstitutes(),
        settings: db.getCashflowSettings(),
        rules: db.getCashflowRules(),
        annotations: db.getCashflowAnnotations(),
        customCategories: db.getCashflowCategories(),
        rates,
    });
}

const restrict = (ops: CashflowOperation[], accountIds?: string[]): CashflowOperation[] => {
    if (!accountIds || accountIds.length === 0) return ops;
    const wanted = new Set(accountIds);
    return ops.filter(op => wanted.has(op.accountId));
};

const sinceMonths = (months: number, today: Date = new Date()): string =>
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, today.getUTCDate())).toISOString().slice(0, 10);

/** Series the user did not set aside: an ignored series counts as day-to-day spending everywhere. */
const activeSeries = (series: RecurringSeries[]): RecurringSeries[] => {
    const ignored = new Set(db.getCashflowRecurring().filter(decision => decision.status === 'ignored').map(decision => decision.key));
    return series.filter(item => !ignored.has(item.key));
};

/** How many future payments of a series may land in one month (a weekly one: 5). */
const MAX_PROJECTED = 6;

/** The latest category set by hand on an operation of the same merchant and direction. */
function rememberedCategory(label: string, direction: 'in' | 'out'): string | undefined {
    const key = merchantKey(label);
    if (!key) return undefined;
    const rows = new Map(db.getUnifiedTransactions().map(tx => [tx.id, tx]));
    let best: { categoryId: string; at: string } | undefined;
    for (const annotation of db.getCashflowAnnotations()) {
        if (!annotation.categoryId) continue;
        const tx = rows.get(annotation.transactionId);
        if (!tx || merchantKey(tx.rawLabel ?? tx.label) !== key) continue;
        if ((Number(tx.amountPrimary) > 0 ? 'in' : 'out') !== direction) continue;
        if (!best || annotation.updatedAt > best.at) best = { categoryId: annotation.categoryId, at: annotation.updatedAt };
    }
    return best?.categoryId;
}

export const cashflowService = {
    /** Totals, monthly trend, categories, Sankey and distribution of a period. */
    getSummary: async (query: CashflowQuery): Promise<CashflowSummary> => {
        await delay(250);
        const currency = (query.currency ?? 'EUR').toUpperCase();
        const all = restrict(await loadOperations(currency), query.accountIds);
        const settings = db.getCashflowSettings();
        const oldest = all.length > 0 ? all[all.length - 1].date : undefined;
        const period = resolvePeriod({
            preset: query.preset,
            month: query.month,
            firstOperationDate: oldest,
            monthStartDay: settings.monthStartDay,
        });
        const series = activeSeries(detectRecurringSeries(all, { since: sinceMonths(18) }));
        return summarizeCashflow(all, {
            periodStart: period.start,
            periodEnd: period.end,
            trendStart: period.trendStart,
            currency,
            monthStartDay: settings.monthStartDay,
            recurringIds: recurringOperationIds(series),
            customCategories: db.getCashflowCategories(),
        });
    },

    /** Operations matching the filter, newest first. */
    listOperations: async (filter: OperationFilter = {}): Promise<CashflowOperation[]> => {
        await delay(150);
        const currency = (filter.currency ?? 'EUR').toUpperCase();
        let ops = restrict(await loadOperations(currency), filter.accountIds);
        const custom = db.getCashflowCategories();
        if (filter.start) ops = ops.filter(op => op.date.slice(0, 10) >= (filter.start as string));
        if (filter.end) ops = ops.filter(op => op.date.slice(0, 10) < (filter.end as string));
        if (filter.instituteId) ops = ops.filter(op => op.instituteId === filter.instituteId);
        if (filter.direction) ops = ops.filter(op => op.direction === filter.direction);
        if (filter.uncategorizedOnly) ops = ops.filter(op => op.categorySource === 'fallback' && !op.excluded);
        if (filter.categoryId) {
            // A category includes its sub-categories (built-in and custom)
            const wanted = filter.categoryId;
            ops = ops.filter(op => op.categoryId === wanted
                || resolveCashflowCategory(op.categoryId, custom).id === wanted
                || topLevelCashflowCategoryId(op.categoryId, custom) === wanted);
        }
        if (filter.search) {
            const needle = filter.search.trim().toLowerCase();
            if (needle) ops = ops.filter(op => op.label.toLowerCase().includes(needle) || op.rawLabel.toLowerCase().includes(needle) || (op.note ?? '').toLowerCase().includes(needle));
        }
        return typeof filter.limit === 'number' ? ops.slice(0, Math.max(0, filter.limit)) : ops;
    },

    /** Recurring series detected over the last `months` months (6 by default). */
    getRecurringSeries: async (currency: string = 'EUR', months: number = 6): Promise<RecurringSeries[]> => {
        await delay(150);
        const ops = await loadOperations(currency.toUpperCase());
        return activeSeries(detectRecurringSeries(ops, { since: sinceMonths(months) }));
    },

    /**
     * Recurring series detected over the last 6 months, with the user's decision and, for the budget month asked
     * (the current one by default), their payments: the operations made, then the ones expected from today on.
     */
    listRecurring: async (query: { currency?: string; month?: string; accountIds?: string[] } = {}): Promise<{ month: string; start: string; end: string; items: CashflowRecurringItem[] }> => {
        await delay(150);
        const currency = (query.currency ?? 'EUR').toUpperCase();
        const ops = restrict(await loadOperations(currency), query.accountIds);
        const settings = db.getCashflowSettings();
        const month = query.month ?? currentBudgetMonth(new Date(), settings.monthStartDay);
        const { start, end } = budgetMonthBounds(month, settings.monthStartDay);
        const today = new Date().toISOString().slice(0, 10);
        const decisions = new Map(db.getCashflowRecurring().map(decision => [decision.key, decision.status]));
        const byId = new Map(ops.map(op => [op.id, op]));
        const items = detectRecurringSeries(ops, { since: sinceMonths(6) }).map(series => {
            const sign = series.direction === 'out' ? -1 : 1;
            const payments: RecurringOccurrence[] = series.operationIds
                .map(id => byId.get(id))
                .filter((op): op is CashflowOperation => op !== undefined && op.date.slice(0, 10) >= start && op.date.slice(0, 10) < end)
                .map(op => ({ date: op.date.slice(0, 10), amount: op.amount, expected: false, operationId: op.id }));
            let next = series.nextDate;
            for (let step = 0; step < MAX_PROJECTED * 4 && next < end; step++) {
                if (next >= start && next >= today) payments.push({ date: next, amount: sign * series.lastAmount, expected: true });
                next = addRecurringInterval(next, series.cadence, series.intervalDays);
            }
            payments.sort((a, b) => a.date.localeCompare(b.date));
            const status: RecurringStatus = decisions.get(series.key) ?? 'detected';
            return { ...series, status, payments: payments.slice(0, MAX_PROJECTED) };
        });
        return { month, start, end, items };
    },

    /** Confirms a detected series, sets it aside (it then counts as day-to-day spending), or forgets the decision. */
    setRecurringStatus: async (key: string, status: RecurringStatus): Promise<CashflowResult> => {
        await delay(80);
        if (!key.trim()) return { success: false, error: 'not_found' };
        const others = db.getCashflowRecurring().filter(decision => decision.key !== key);
        if (status === 'detected') {
            db.saveCashflowRecurring(others);
            return { success: true, value: undefined };
        }
        db.saveCashflowRecurring([...others, { id: `cfrec-${key}`, ownerId: ownerId(), key, status, updatedAt: new Date().toISOString() }]);
        return { success: true, value: undefined };
    },

    /** Records an operation typed by hand (bouton « Créer »). */
    recordManualOperation: async (input: ManualOperationInput): Promise<CashflowResult<string>> => {
        await delay(200);
        const account = db.getAccountById(input.accountId);
        if (!account) return { success: false, error: 'account_not_found' };
        const label = input.label.trim().slice(0, MAX_LABEL);
        if (!label) return { success: false, error: 'empty_label' };
        if (!Number.isFinite(input.amount) || input.amount === 0) return { success: false, error: 'invalid_amount' };
        const day = new Date(input.date);
        if (Number.isNaN(day.getTime())) return { success: false, error: 'invalid_date' };
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (day > tomorrow) return { success: false, error: 'future_date' };

        const currency = (account.defaultCurrency || 'EUR').toUpperCase();
        const instrument = await instrumentService.findOrCreateInstrument({
            symbol: currency,
            name: CURRENCY_NAMES[currency] || currency,
            currencyCode: currency,
        });
        const now = new Date().toISOString();
        const id = `utx-manual-${randomSuffix()}`;
        const amount = (Math.round(input.amount * 100) / 100).toFixed(2);
        const type = input.amount > 0 ? 'DEPOSIT' : 'WITHDRAW';
        const date = day.toISOString();
        const tx: UnifiedTransaction = {
            id,
            ownerId: account.ownerId,
            accountId: account.id,
            instrumentId: instrument.id,
            batchId: `batch-manual-${id}`,
            rowHash: await computeRowHash(date, amount, '', type, '0'),
            sourceOrigin: 'MANUAL',
            isSynthetic: false,
            isFiscal: false,
            sourceMode: 'history',
            transactionDate: date,
            type,
            rawType: 'Manual operation',
            label,
            rawLabel: label,
            amountPrimary: amount,
            assetSymbol: currency,
            priceUnit: '1',
            quantity: amount.replace('-', ''),
            createdAt: now,
            updatedAt: now,
            version: 1,
        };
        const batch: ImportBatch = {
            id: tx.batchId,
            ownerId: account.ownerId,
            accountId: account.id,
            importMode: 'history',
            fileName: 'manual-operation',
            fileHash: `manual-${id}`,
            transactionCount: 1,
            skippedCount: 0,
            importedAt: now,
            importedBy: account.ownerId,
            status: 'completed',
            engineVersion: ENGINE_VERSION,
        };
        try {
            transactionManager.begin();
            transactionManager.addTransactions([tx]);
            transactionManager.addBatch(batch);
            const result = transactionManager.commit();
            if (!result.success) return { success: false, error: result.error ?? 'commit_failed' };
        } catch {
            transactionManager.rollback();
            return { success: false, error: 'commit_failed' };
        }
        // "Automatic": the category the user last chose by hand for this merchant (same direction), if any; otherwise
        // the usual engine (rules, transfers, known merchants). Done once here, so imported operations never change
        // behind the user's back.
        const categoryId = input.categoryId || rememberedCategory(label, input.amount > 0 ? 'in' : 'out');
        if (categoryId || input.note) {
            await cashflowService.updateOperation(id, { categoryId, note: input.note });
        }
        await portfolioService.recalculatePositions();
        return { success: true, value: id };
    },

    /**
     * Changes an operation: category, displayed label, note and exclusion for any operation; date,
     * amount and account too for imported and manual ones (synced ones follow the bank).
     */
    updateOperation: async (id: string, edit: OperationEdit): Promise<CashflowResult> => {
        await delay(120);
        const journal = db.getUnifiedTransactions();
        const index = journal.findIndex(tx => tx.id === id);
        if (index < 0) return { success: false, error: 'not_found' };
        const tx = journal[index];

        const touchesLedger = edit.date !== undefined || edit.amount !== undefined || edit.accountId !== undefined;
        if (touchesLedger) {
            if (tx.sourceOrigin === 'API') return { success: false, error: 'synced_operation' };
            const next: UnifiedTransaction = { ...tx, updatedAt: new Date().toISOString(), version: (tx.version ?? 1) + 1 };
            if (edit.date !== undefined) {
                const day = new Date(edit.date);
                if (Number.isNaN(day.getTime())) return { success: false, error: 'invalid_date' };
                next.transactionDate = day.toISOString();
            }
            if (edit.amount !== undefined) {
                if (!Number.isFinite(edit.amount) || edit.amount === 0) return { success: false, error: 'invalid_amount' };
                const amount = (Math.round(edit.amount * 100) / 100).toFixed(2);
                next.amountPrimary = amount;
                next.quantity = amount.replace('-', '');
                next.type = edit.amount > 0 ? 'DEPOSIT' : 'WITHDRAW';
            }
            if (edit.accountId !== undefined) {
                const target = db.getAccountById(edit.accountId);
                if (!target) return { success: false, error: 'account_not_found' };
                next.accountId = target.id;
            }
            const updated = [...journal];
            updated[index] = next;
            db.saveUnifiedTransactions(updated);
            await portfolioService.recalculatePositions();
        }

        const annotations = db.getCashflowAnnotations();
        const existing = annotations.find(a => a.transactionId === id);
        const annotation = existing ? { ...existing } : { id: `cfa-${id}`, ownerId: tx.ownerId, transactionId: id, updatedAt: '' };
        if (edit.categoryId !== undefined) annotation.categoryId = edit.categoryId ?? undefined;
        if (edit.displayLabel !== undefined) annotation.displayLabel = edit.displayLabel?.trim().slice(0, MAX_LABEL) || undefined;
        if (edit.note !== undefined) annotation.note = edit.note?.trim().slice(0, MAX_NOTE) || undefined;
        if (edit.excluded !== undefined) annotation.excluded = edit.excluded || undefined;
        annotation.updatedAt = new Date().toISOString();
        const empty = !annotation.categoryId && !annotation.displayLabel && !annotation.note && !annotation.excluded;
        const others = annotations.filter(a => a.transactionId !== id);
        if (!existing && empty && !touchesLedger) return { success: true, value: undefined };
        db.saveCashflowAnnotations(empty ? others : [...others, annotation]);
        return { success: true, value: undefined };
    },

    /** Deletes an operation. A synced one is remembered so the next sync does not bring it back. */
    deleteOperation: async (id: string): Promise<CashflowResult> => {
        await delay(150);
        const journal = db.getUnifiedTransactions();
        const tx = journal.find(row => row.id === id);
        if (!tx) return { success: false, error: 'not_found' };
        if (tx.sourceOrigin === 'API' || tx.externalId) {
            const tombstone: CashflowTombstone = {
                id: `cft-${id}`,
                ownerId: tx.ownerId,
                accountId: tx.accountId,
                externalId: tx.externalId,
                rowHash: tx.rowHash || undefined,
                deletedAt: new Date().toISOString(),
            };
            db.saveCashflowTombstones([...db.getCashflowTombstones().filter(t => t.id !== tombstone.id), tombstone]);
        }
        db.saveUnifiedTransactions(journal.filter(row => row.id !== id));
        db.saveCashflowAnnotations(db.getCashflowAnnotations().filter(a => a.transactionId !== id));
        await portfolioService.recalculatePositions();
        return { success: true, value: undefined };
    },

    /** Operations the banks announce as coming (TGLA-254), soonest first, with their account and bank. */
    listUpcoming: async (accountId?: string): Promise<Array<CashflowUpcoming & { accountName: string; instituteName?: string }>> => {
        await delay(60);
        const accounts = new Map(db.getAccounts().map(account => [account.id, account]));
        const institutes = new Map(db.getInstitutes().map(institute => [institute.id, institute.name]));
        return db.getCashflowUpcoming()
            .filter(item => accounts.has(item.accountId) && (!accountId || item.accountId === accountId))
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(item => {
                const account = accounts.get(item.accountId);
                return { ...item, accountName: account?.name ?? item.accountId, instituteName: account ? institutes.get(account.instituteId) : undefined };
            });
    },

    /** Accounts that can hold cash flow operations (checking and savings), with whether they are counted. */
    listCashAccounts: async (): Promise<Array<{ id: string; name: string; instituteName?: string; currency: string; included: boolean }>> => {
        await delay(80);
        const accounts = db.getAccounts();
        const included = includedAccountIds(accounts, db.getCashflowSettings());
        const institutes = new Map(db.getInstitutes().map(i => [i.id, i.name]));
        return accounts
            .filter(a => CASH_ACCOUNT_TYPES.has(a.type) || included.has(a.id))
            .map(a => ({ id: a.id, name: a.name, instituteName: institutes.get(a.instituteId), currency: a.defaultCurrency, included: included.has(a.id) }));
    },

    /**
     * How full the vault is, 0–1: the largest record against the 5 MB record limit, and online the
     * whole vault against its 10 MB. Encrypted records are about 40 % larger than their content.
     */
    getVaultUsage: (): number => {
        const ENCRYPTION_OVERHEAD = 1.4;
        let total = 0;
        let largest = 0;
        for (const key of appStorage.keys()) {
            if (!key.startsWith('glassfolio_')) continue;
            const value = appStorage.getItem(key);
            if (!value) continue;
            const size = utf8ByteLength(value) * ENCRYPTION_OVERHEAD;
            total += size;
            largest = Math.max(largest, size);
        }
        const recordRatio = largest / VAULT_MAX_RECORD_BYTES;
        return getDeploymentMode() === 'cloud' ? Math.max(recordRatio, total / VAULT_MAX_TOTAL_BYTES) : recordRatio;
    },

    /** Owner id used for new cash flow records. */
    ownerId,
};
