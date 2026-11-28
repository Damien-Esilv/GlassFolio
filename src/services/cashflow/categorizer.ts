/**
 * Cash flow categoriser (Epic E52 — TGLA-249). Pure functions.
 *
 * Order of priority, first answer wins:
 *  1. the user's correction on the operation (annotation),
 *  2. transfers between the user's own accounts (internal transfer, or savings when the money goes to an investment account),
 *  3. the user's rules, the most specific first,
 *  4. the journal type (dividends and interest),
 *  5. the bank's own category, then the bank operation type,
 *  6. French market keywords in the label,
 *  7. "other income" / "other expense" by direction.
 */
import {
    BANK_CATEGORY_MAP,
    BANK_TX_TYPE_MAP,
    CASHFLOW_KEYWORDS,
    type CashflowKeywordEntry,
} from '../../constants/cashflowKeywords';
import { FALLBACK_EXPENSE_CATEGORY, FALLBACK_INCOME_CATEGORY } from '../../constants/cashflowCategories';
import type {
    BankHints,
    CashflowAnnotation,
    CashflowDirection,
    CategorizationRule,
    CategorizationSource,
} from '../../types/cashflow';
import type { TransactionSubType, TransactionType } from '../../types/types.backend';
import { containsWords, normalizeText } from './text';

/** A journal row reduced to what the categoriser needs. */
export interface RawCashflowOperation {
    id: string;
    accountId: string;
    /** ISO 8601 */
    date: string;
    /** Signed, in the account currency */
    amount: number;
    currency: string;
    direction: CashflowDirection;
    rawLabel: string;
    /** Normalised words of the label (see `normalizeText`) */
    normalizedLabel: string;
    merchantKey: string;
    type: TransactionType;
    subType?: TransactionSubType;
    hints: BankHints;
}

export type TransferKind = 'internal_transfer' | 'savings_invested';

export interface CategorizerContext {
    annotations: ReadonlyMap<string, CashflowAnnotation>;
    rules: readonly CategorizationRule[];
    transfers: ReadonlyMap<string, TransferKind>;
    /** Category ids that exist (built-in and custom): a rule or correction pointing elsewhere is ignored */
    knownCategoryIds: ReadonlySet<string>;
}

export interface CategorizationResult {
    categoryId: string;
    source: CategorizationSource;
}

const keywordCache = new WeakMap<readonly CashflowKeywordEntry[], { entry: CashflowKeywordEntry; patterns: string[] }[]>();

const normalizedEntries = (entries: readonly CashflowKeywordEntry[]) => {
    let cached = keywordCache.get(entries);
    if (!cached) {
        cached = entries.map(entry => ({ entry, patterns: entry.patterns.map(normalizeText).filter(Boolean) }));
        keywordCache.set(entries, cached);
    }
    return cached;
};

/** First entry of `entries` whose pattern appears in `text` for this direction. */
export function matchKeywords(
    text: string,
    direction: CashflowDirection,
    entries: readonly CashflowKeywordEntry[],
): CashflowKeywordEntry | undefined {
    if (!text) return undefined;
    for (const { entry, patterns } of normalizedEntries(entries)) {
        if (entry.direction && entry.direction !== direction) continue;
        if (patterns.some(pattern => containsWords(text, pattern))) return entry;
    }
    return undefined;
}

/** How specific a rule is: more criteria first, then the longer text. */
const ruleSpecificity = (rule: CategorizationRule): number =>
    (rule.accountId ? 1000 : 0)
    + (rule.direction !== 'any' ? 500 : 0)
    + (rule.minAmount !== undefined || rule.maxAmount !== undefined ? 250 : 0)
    + normalizeText(rule.labelContains).length;

/** Rules sorted most specific first (stable for equal specificity: the newest wins). */
export function sortRules(rules: readonly CategorizationRule[]): CategorizationRule[] {
    return [...rules].sort((a, b) => ruleSpecificity(b) - ruleSpecificity(a) || b.updatedAt.localeCompare(a.updatedAt));
}

export function ruleMatches(rule: CategorizationRule, op: RawCashflowOperation): boolean {
    const needle = normalizeText(rule.labelContains);
    if (!needle) return false;
    if (!op.normalizedLabel.includes(needle) && !op.merchantKey.includes(needle)) return false;
    if (rule.accountId && rule.accountId !== op.accountId) return false;
    if (rule.direction !== 'any' && rule.direction !== op.direction) return false;
    const absolute = Math.abs(op.amount);
    if (rule.minAmount !== undefined && absolute < rule.minAmount) return false;
    if (rule.maxAmount !== undefined && absolute > rule.maxAmount) return false;
    return true;
}

const fallback = (direction: CashflowDirection): string =>
    direction === 'in' ? FALLBACK_INCOME_CATEGORY : FALLBACK_EXPENSE_CATEGORY;

/** Categorises one operation. `rules` must be sorted with `sortRules`. */
export function categorizeOperation(op: RawCashflowOperation, ctx: CategorizerContext): CategorizationResult {
    const annotation = ctx.annotations.get(op.id);
    if (annotation?.categoryId && ctx.knownCategoryIds.has(annotation.categoryId)) {
        return { categoryId: annotation.categoryId, source: 'override' };
    }

    const transfer = ctx.transfers.get(op.id);
    if (transfer) return { categoryId: transfer, source: 'transfer' };

    for (const rule of ctx.rules) {
        if (ctx.knownCategoryIds.has(rule.categoryId) && ruleMatches(rule, op)) {
            return { categoryId: rule.categoryId, source: 'rule' };
        }
    }

    if (op.type === 'INCOME' && (op.subType === 'DIVIDEND' || op.subType === 'INTEREST') && op.direction === 'in') {
        return { categoryId: 'investment_income', source: 'type' };
    }

    const bankCategory = matchKeywords(normalizeText(op.hints.category), op.direction, BANK_CATEGORY_MAP)
        ?? matchKeywords(normalizeText(op.hints.categoryParent), op.direction, BANK_CATEGORY_MAP);
    if (bankCategory) return { categoryId: bankCategory.categoryId, source: 'bank' };

    const txType = op.hints.txType ? BANK_TX_TYPE_MAP[op.hints.txType.trim().toLowerCase()] : undefined;
    if (txType && txType.direction === op.direction) return { categoryId: txType.categoryId, source: 'bank' };

    const keyword = matchKeywords(op.normalizedLabel, op.direction, CASHFLOW_KEYWORDS)
        ?? matchKeywords(normalizeText(op.hints.counterparty), op.direction, CASHFLOW_KEYWORDS);
    if (keyword) return { categoryId: keyword.categoryId, source: 'keyword' };

    return { categoryId: fallback(op.direction), source: 'fallback' };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TransferScope {
    /** Accounts counted in the cash flow */
    includedAccountIds: ReadonlySet<string>;
    /** Every account of the user (a transfer to an excluded own account is savings, not spending) */
    ownAccountIds: ReadonlySet<string>;
    /** Maximum days between the two legs */
    windowDays?: number;
}

/**
 * Pairs money leaving one of the user's accounts with the same amount arriving on another one within
 * a few days. Legs between two counted accounts are internal transfers (left out); money sent to an
 * investment or an uncounted own account is savings; money coming back from them is an internal transfer.
 * `operations` holds the fiat movements of every account (counted or not).
 */
export function detectTransfers(
    operations: readonly RawCashflowOperation[],
    scope: TransferScope,
): Map<string, TransferKind> {
    const windowMs = (scope.windowDays ?? 3) * DAY_MS;
    const result = new Map<string, TransferKind>();
    const movements = operations.filter(op =>
        scope.ownAccountIds.has(op.accountId)
        && op.type !== 'INCOME'
        && op.type !== 'BUY'
        && op.type !== 'SELL');
    const incoming = movements
        .filter(op => op.amount > 0)
        .map(op => ({ op, time: Date.parse(op.date), used: false }))
        .sort((a, b) => a.time - b.time);

    const outgoing = movements.filter(op => op.amount < 0).sort((a, b) => a.date.localeCompare(b.date));
    for (const out of outgoing) {
        const outTime = Date.parse(out.date);
        const target = Math.abs(out.amount);
        let best: (typeof incoming)[number] | undefined;
        for (const candidate of incoming) {
            if (candidate.used || candidate.op.accountId === out.accountId) continue;
            if (Math.abs(candidate.time - outTime) > windowMs) continue;
            if (Math.abs(candidate.op.amount - target) > 0.005) continue;
            if (!best || Math.abs(candidate.time - outTime) < Math.abs(best.time - outTime)) best = candidate;
        }
        if (!best) continue;
        best.used = true;
        const outCounted = scope.includedAccountIds.has(out.accountId);
        const inCounted = scope.includedAccountIds.has(best.op.accountId);
        if (outCounted && inCounted) {
            result.set(out.id, 'internal_transfer');
            result.set(best.op.id, 'internal_transfer');
        } else if (outCounted) {
            // Money leaves the counted scope for an investment or an uncounted own account
            result.set(out.id, 'savings_invested');
        } else if (inCounted) {
            // Money comes back from investments or an uncounted own account: not income
            result.set(best.op.id, 'internal_transfer');
        }
    }
    return result;
}
