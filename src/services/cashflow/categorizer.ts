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
    /**
     * Normalised institution name of each own account (any bank, broker or payment app the user records): a
     * transfer whose label names one of them goes to the user's own money there.
     */
    institutionOf?: ReadonlyMap<string, string>;
}

/** Words of a statement line moving money between accounts (French and English banks, payment apps). */
const TRANSFER_WORDS = ['VIR', 'VIREMENT', 'VIRT', 'TRANSFER', 'TRANSFERT', 'TOP UP', 'TOPUP', 'RECHARGE', 'RECHARGEMENT', 'APPROVISIONNEMENT']
    .map(normalizeText);
/** Words of money arriving from the user's own card or bank on a payment app. */
const TOP_UP_WORDS = ['TOP UP', 'TOPUP', 'RECHARGE', 'RECHARGEMENT', 'APPROVISIONNEMENT'].map(normalizeText);

const hasWord = (op: RawCashflowOperation, words: readonly string[]): boolean =>
    words.some(word => containsWords(op.normalizedLabel, word)) || ['transfer', 'topup', 'top_up'].includes((op.hints.txType ?? '').toLowerCase());
const looksLikeTransfer = (op: RawCashflowOperation): boolean => hasWord(op, TRANSFER_WORDS);
const looksLikeTopUp = (op: RawCashflowOperation): boolean => TOP_UP_WORDS.some(word => containsWords(op.normalizedLabel, word))
    || ['topup', 'top_up'].includes((op.hints.txType ?? '').toLowerCase());

/**
 * Pairs money leaving one of the user's accounts with the same amount arriving on another one. Legs between two
 * counted accounts are internal transfers (left out); money sent to an investment or an uncounted own account is
 * savings; money coming back from them is an internal transfer. `operations` holds the fiat movements of every
 * account (counted or not).
 *
 * Banks and payment apps book a transfer on different days: legs are paired within 3 days, or within 7 days when
 * either one reads as a transfer ("VIR", "TOP UP", "RECHARGE"…) or names the other account's institution. A transfer
 * naming another of the user's institutions counts as one even when the other leg is not recorded, and money topping
 * up a payment app comes from the user's own card: never income. No list of banks: any institution the user records.
 */
export function detectTransfers(
    operations: readonly RawCashflowOperation[],
    scope: TransferScope,
): Map<string, TransferKind> {
    const windowMs = (scope.windowDays ?? 3) * DAY_MS;
    const wideWindowMs = Math.max(windowMs, 7 * DAY_MS);
    const institutionOf = scope.institutionOf ?? new Map<string, string>();
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

    /** Own accounts (other than this one) whose institution the line names. */
    const namedAccounts = (op: RawCashflowOperation): string[] => [...institutionOf.entries()]
        .filter(([accountId, name]) => accountId !== op.accountId && name.length >= 3 && containsWords(op.normalizedLabel, name))
        .map(([accountId]) => accountId);

    const classify = (out: RawCashflowOperation | undefined, into: RawCashflowOperation | undefined, outAccount: string, inAccount: string): void => {
        const outCounted = scope.includedAccountIds.has(outAccount);
        const inCounted = scope.includedAccountIds.has(inAccount);
        if (outCounted && inCounted) {
            if (out) result.set(out.id, 'internal_transfer');
            if (into) result.set(into.id, 'internal_transfer');
        } else if (outCounted) {
            // Money leaves the counted scope for an investment or an uncounted own account
            if (out) result.set(out.id, 'savings_invested');
        } else if (inCounted) {
            // Money comes back from investments or an uncounted own account: not income
            if (into) result.set(into.id, 'internal_transfer');
        }
    };

    const outgoing = movements.filter(op => op.amount < 0).sort((a, b) => a.date.localeCompare(b.date));
    const unpaired: RawCashflowOperation[] = [];
    for (const out of outgoing) {
        const outTime = Date.parse(out.date);
        const target = Math.abs(out.amount);
        const named = new Set(namedAccounts(out));
        let best: (typeof incoming)[number] | undefined;
        for (const candidate of incoming) {
            if (candidate.used || candidate.op.accountId === out.accountId) continue;
            if (Math.abs(candidate.op.amount - target) > 0.005) continue;
            const distance = Math.abs(candidate.time - outTime);
            const wide = looksLikeTransfer(out) || looksLikeTransfer(candidate.op) || named.has(candidate.op.accountId)
                || namedAccounts(candidate.op).includes(out.accountId);
            if (distance > (wide ? wideWindowMs : windowMs)) continue;
            if (!best || distance < Math.abs(best.time - outTime)) best = candidate;
        }
        if (!best) {
            unpaired.push(out);
            continue;
        }
        best.used = true;
        classify(out, best.op, out.accountId, best.op.accountId);
    }

    // The other leg is not recorded: a transfer naming another own institution still goes to the user's own money
    for (const out of unpaired) {
        if (!looksLikeTransfer(out)) continue;
        const named = namedAccounts(out);
        if (named.length === 0) continue;
        const counted = named.find(accountId => scope.includedAccountIds.has(accountId));
        classify(out, undefined, out.accountId, counted ?? named[0]);
    }
    for (const entry of incoming) {
        if (entry.used || result.has(entry.op.id) || !scope.includedAccountIds.has(entry.op.accountId)) continue;
        const named = looksLikeTransfer(entry.op) ? namedAccounts(entry.op) : [];
        if (named.length > 0) classify(undefined, entry.op, named[0], entry.op.accountId);
        else if (looksLikeTopUp(entry.op)) result.set(entry.op.id, 'internal_transfer');
    }
    return result;
}
