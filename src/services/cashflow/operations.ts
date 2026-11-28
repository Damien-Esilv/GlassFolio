/**
 * From the unified journal to cash flow operations (Epic E52 — TGLA-249). Pure functions.
 *
 * Counted: fiat movements of the included accounts (every checking and savings account by default),
 * plus dividends and interest of the other accounts when the setting allows it. Never counted: balance
 * and snapshot adjustments, synthetic rows, trades, opening balances.
 */
import { CASHFLOW_CATEGORIES, resolveCashflowCategory } from '../../constants/cashflowCategories';
import type {
    CashflowAnnotation,
    CashflowOperation,
    CashflowSettings,
    CategorizationRule,
    CustomCashflowCategory,
} from '../../types/cashflow';
import { VALID_FIAT_CURRENCIES } from '../../types/types.backend';
import type { Account, Institute, TransactionType, UnifiedTransaction } from '../../types/types.backend';
import { readBankHints } from './bankHints';
import { categorizeOperation, detectTransfers, sortRules, type RawCashflowOperation } from './categorizer';
import { displayLabel, merchantKey, normalizeText } from './text';

export const CASH_ACCOUNT_TYPES: ReadonlySet<string> = new Set(['checking', 'savings']);

const SKIPPED_TYPES: ReadonlySet<TransactionType> = new Set([
    'BALANCE_ADJUSTMENT',
    'SNAPSHOT_ADJUSTMENT',
    'ADJUSTMENT',
    'BUY',
    'SELL',
    'SWAP',
]);

const isFiat = (symbol: string | undefined): boolean =>
    !!symbol && (VALID_FIAT_CURRENCIES as readonly string[]).includes(symbol.toUpperCase());

const isInvestmentIncome = (tx: UnifiedTransaction): boolean =>
    tx.type === 'INCOME' && (tx.subType === 'DIVIDEND' || tx.subType === 'INTEREST');

/** Signed amount: the journal type decides the direction, the stored sign only breaks ties. */
function signedAmount(tx: UnifiedTransaction): number {
    const value = Number.parseFloat(tx.amountPrimary);
    if (!Number.isFinite(value)) return 0;
    const absolute = Math.abs(value);
    switch (tx.type) {
        case 'DEPOSIT':
        case 'INCOME':
            return absolute;
        case 'WITHDRAW':
        case 'EXPENSE':
            return -absolute;
        case 'TRANSFER':
            if (tx.subType === 'TRANSFER_IN') return absolute;
            if (tx.subType === 'TRANSFER_OUT') return -absolute;
            return value;
        default:
            return value;
    }
}

/** The fiat currency of a movement, or undefined when the row is not a fiat movement. */
function movementCurrency(tx: UnifiedTransaction, account: Account | undefined): string | undefined {
    if (isFiat(tx.assetSymbol) && !tx.assetIsin) return tx.assetSymbol.toUpperCase();
    if (isInvestmentIncome(tx)) {
        if (isFiat(tx.originalCurrency)) return (tx.originalCurrency as string).toUpperCase();
        return account?.defaultCurrency?.toUpperCase();
    }
    return undefined;
}

/** Journal row → raw operation, or undefined when the cash flow never counts it. */
export function toRawOperation(tx: UnifiedTransaction, account: Account | undefined): RawCashflowOperation | undefined {
    if (SKIPPED_TYPES.has(tx.type) || tx.isSynthetic) return undefined;
    if (tx.metadata && tx.metadata.openingBalance === true) return undefined;
    const currency = movementCurrency(tx, account);
    if (!currency) return undefined;
    const amount = signedAmount(tx);
    if (amount === 0) return undefined;
    const rawLabel = (tx.rawLabel || tx.label || '').trim();
    return {
        id: tx.id,
        accountId: tx.accountId,
        date: tx.transactionDate,
        amount,
        currency,
        direction: amount > 0 ? 'in' : 'out',
        rawLabel,
        normalizedLabel: normalizeText(`${rawLabel} ${tx.label ?? ''}`),
        merchantKey: merchantKey(rawLabel),
        type: tx.type,
        subType: tx.subType,
        hints: readBankHints(tx.metadata),
    };
}

export interface CashflowDataset {
    journal: readonly UnifiedTransaction[];
    accounts: readonly Account[];
    institutes: readonly Institute[];
    settings: CashflowSettings;
    rules: readonly CategorizationRule[];
    annotations: readonly CashflowAnnotation[];
    customCategories: readonly CustomCashflowCategory[];
    /** Rate to the base currency for each currency met (missing = 1) */
    rates: Readonly<Record<string, number>>;
}

/** Accounts counted in the cash flow for these settings. */
export function includedAccountIds(accounts: readonly Account[], settings: CashflowSettings): Set<string> {
    const known = new Set(accounts.map(a => a.id));
    if (settings.includedAccountIds) return new Set(settings.includedAccountIds.filter(id => known.has(id)));
    return new Set(accounts.filter(a => CASH_ACCOUNT_TYPES.has(a.type)).map(a => a.id));
}

/** Every operation the cash flow counts, categorised, newest first. */
export function buildCashflowOperations(data: CashflowDataset): CashflowOperation[] {
    const accountsById = new Map(data.accounts.map(a => [a.id, a]));
    const institutesById = new Map(data.institutes.map(i => [i.id, i]));
    const included = includedAccountIds(data.accounts, data.settings);

    const journalById = new Map(data.journal.map(tx => [tx.id, tx]));
    const raw: RawCashflowOperation[] = [];
    for (const tx of data.journal) {
        const op = toRawOperation(tx, accountsById.get(tx.accountId));
        if (op) raw.push(op);
    }

    const transfers = detectTransfers(raw, {
        includedAccountIds: included,
        ownAccountIds: new Set(accountsById.keys()),
        institutionOf: new Map(data.accounts.map(account => [account.id, normalizeText(institutesById.get(account.instituteId)?.name)])),
    });
    // The monthly total of a deferred-debit card is a transfer when the card's own payments are recorded in the account
    const cardDetailAccounts = new Set(raw.filter(op => (op.hints.txType ?? '').toLowerCase() === 'deferred_card').map(op => op.accountId));
    for (const op of raw) {
        if ((op.hints.txType ?? '').toLowerCase() === 'card_summary' && cardDetailAccounts.has(op.accountId) && !transfers.has(op.id)) {
            transfers.set(op.id, 'internal_transfer');
        }
    }
    const annotations = new Map(data.annotations.map(a => [a.transactionId, a]));
    const knownCategoryIds = new Set<string>([
        ...CASHFLOW_CATEGORIES.map(c => c.id),
        ...data.customCategories.map(c => c.id),
    ]);
    const ctx = { annotations, rules: sortRules(data.rules), transfers, knownCategoryIds };

    const operations: CashflowOperation[] = [];
    for (const op of raw) {
        const counted = included.has(op.accountId)
            || (data.settings.includeInvestmentIncome && op.type === 'INCOME' && op.direction === 'in');
        if (!counted) continue;
        const account = accountsById.get(op.accountId);
        const institute = account ? institutesById.get(account.instituteId) : undefined;
        const annotation = annotations.get(op.id);
        const { categoryId, source } = categorizeOperation(op, ctx);
        const rate = data.rates[op.currency] ?? 1;
        const tx = journalById.get(op.id);
        operations.push({
            id: op.id,
            accountId: op.accountId,
            accountName: account?.name ?? op.accountId,
            instituteId: institute?.id,
            instituteName: institute?.name,
            date: op.date,
            amount: Math.round(op.amount * rate * 100) / 100,
            originalAmount: op.amount,
            currency: op.currency,
            direction: op.direction,
            // Typed by the user: shown as typed; bank labels are cleaned ("CARTE 12/03 …" → "Carrefour City")
            label: annotation?.displayLabel?.trim()
                || (tx?.sourceOrigin === 'MANUAL' ? op.rawLabel : displayLabel(op.rawLabel))
                || op.rawLabel,
            rawLabel: op.rawLabel,
            merchantKey: op.merchantKey,
            categoryId,
            categoryKind: resolveCashflowCategory(categoryId, data.customCategories).kind,
            categorySource: source,
            excluded: annotation?.excluded === true,
            note: annotation?.note,
            sourceOrigin: tx?.sourceOrigin ?? 'FILE',
            editable: tx?.sourceOrigin !== 'API',
        });
    }
    return operations.sort((a, b) => b.date.localeCompare(a.date));
}
