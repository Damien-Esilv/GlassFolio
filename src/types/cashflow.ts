/**
 * Cash flow (Epic E52 — TGLA-249).
 *
 * Bank operations live in the unified journal (`UnifiedTransaction`); their category is computed on
 * read (src/services/cashflow/categorizer.ts). Only what the user decides is stored here: custom
 * sub-categories, rules, per-operation annotations, deleted synced operations and settings.
 */

/** What a category does to the household budget. */
export type CashflowCategoryKind = 'income' | 'expense' | 'savings' | 'transfer';

export type BuiltinIncomeCategoryId = 'salary' | 'investment_income' | 'benefits_refunds' | 'other_income';

export type BuiltinExpenseCategoryId =
    | 'housing'
    | 'groceries'
    | 'dining'
    | 'transport'
    | 'subscriptions'
    | 'health'
    | 'shopping'
    | 'leisure'
    | 'travel'
    | 'taxes'
    | 'insurance'
    | 'bank_fees'
    | 'family_education'
    | 'gifts_donations'
    | 'cash_withdrawal'
    | 'other_expense';

/** Built-in sub-categories the tax card reads (donations, home services, childcare). */
export type BuiltinSubCategoryId = 'donations' | 'home_services' | 'childcare';

export type BuiltinCashflowCategoryId =
    | BuiltinIncomeCategoryId
    | BuiltinExpenseCategoryId
    | BuiltinSubCategoryId
    | 'savings_invested'
    | 'internal_transfer';

/**
 * Hints a bank gives about an operation (Woob, CSV category column, OFX TRNTYPE).
 * Stored in `UnifiedTransaction.metadata.bankHints`; read through `readBankHints`.
 */
export interface BankHints {
    /** Category as the bank names it ("Alimentation", "Salaires et revenus") */
    category?: string;
    /** Parent category as the bank names it, when it has two levels */
    categoryParent?: string;
    /** Bank operation type ("card", "transfer", "order", "withdrawal", "loan_payment", OFX "POS"…) */
    txType?: string;
    /** Counterparty or merchant name, when the bank gives one apart from the label */
    counterparty?: string;
}

/** A sub-category the user created under a built-in category (it takes its parent's colour). */
export interface CustomCashflowCategory {
    id: string;
    ownerId: string;
    parentId: BuiltinCashflowCategoryId;
    name: string;
    createdAt: string;
    updatedAt: string;
}

export type CashflowDirection = 'in' | 'out';
export type RuleDirection = CashflowDirection | 'any';

/** "Operations whose label contains X (and match the other criteria) go to category Y". */
export interface CategorizationRule {
    id: string;
    ownerId: string;
    categoryId: string;
    /** Case and accent insensitive, matched on the label and the merchant key */
    labelContains: string;
    accountId?: string;
    direction: RuleDirection;
    /** Inclusive bounds on the absolute amount, in the operation currency */
    minAmount?: number;
    maxAmount?: number;
    source: 'user' | 'ai';
    createdAt: string;
    updatedAt: string;
}

/** What the user changed on one operation. Keyed by the journal row id (`transactionId`). */
export interface CashflowAnnotation {
    id: string;
    ownerId: string;
    transactionId: string;
    categoryId?: string;
    displayLabel?: string;
    note?: string;
    /** Left out of every cash flow total (the row stays in the journal and the balance) */
    excluded?: boolean;
    updatedAt: string;
}

/** A synced operation the user deleted: the next sync must not bring it back. */
export interface CashflowTombstone {
    id: string;
    ownerId: string;
    accountId: string;
    externalId?: string;
    rowHash?: string;
    deletedAt: string;
}

/**
 * An operation the bank announces as coming (card payment not booked yet, scheduled transfer), read by the bank sync
 * (TGLA-254). Kept apart from the journal: it never changes a balance, and each sync replaces the account's list.
 */
export interface CashflowUpcoming {
    id: string;
    ownerId: string;
    accountId: string;
    connectionId: string;
    externalId: string;
    /** ISO 8601 date of the operation. */
    date: string;
    /** Signed decimal: negative for money out. */
    amount: string;
    currency: string;
    label: string;
    rawLabel: string;
    bankHints?: BankHints;
    /** When the bank last listed it. */
    readAt: string;
}

export interface CashflowSettings {
    ownerId: string;
    /** Accounts counted in the cash flow; `null` = every checking and savings account */
    includedAccountIds: string[] | null;
    /** Count dividends and interest of investment accounts as "investment income" */
    includeInvestmentIncome: boolean;
    /** Day a budget month starts (1 = calendar month), 1–28 */
    monthStartDay: number;
    updatedAt: string;
}

/** Why an operation got its category (shown in the operation detail). */
export type CategorizationSource = 'override' | 'transfer' | 'rule' | 'type' | 'bank' | 'keyword' | 'fallback';

/** One journal row seen through the cash flow: signed amount in the base currency and its category. */
export interface CashflowOperation {
    id: string;
    accountId: string;
    accountName: string;
    instituteId?: string;
    instituteName?: string;
    /** ISO 8601 */
    date: string;
    /** Signed, in the base currency (negative = money out) */
    amount: number;
    /** Signed, in the account currency */
    originalAmount: number;
    currency: string;
    direction: CashflowDirection;
    /** What the list shows: the user's label, else the cleaned bank label */
    label: string;
    rawLabel: string;
    merchantKey: string;
    categoryId: string;
    categoryKind: CashflowCategoryKind;
    categorySource: CategorizationSource;
    excluded: boolean;
    note?: string;
    sourceOrigin: string;
    /** Synced rows keep their date and amount; imported and manual rows are fully editable */
    editable: boolean;
}

export interface CashflowMonth {
    /** YYYY-MM */
    month: string;
    income: number;
    expenses: number;
    fixedExpenses: number;
    variableExpenses: number;
    savingsInvested: number;
    /** income − expenses − savings invested */
    available: number;
    /** (income − expenses) / income, as a ratio (0.21 = 21 %); 0 without income */
    savingsRate: number;
}

export interface CashflowCategoryTotal {
    categoryId: string;
    kind: CashflowCategoryKind;
    amount: number;
    /** Share of the total of its kind, 0–1 */
    share: number;
    count: number;
    /** Monthly average over the 12 months before the period */
    averageMonthly: number;
    /** (amount per month − average) / average; null without history */
    deltaVsAverage: number | null;
    /** Built-in or custom sub-categories rolled up into this one */
    children: { categoryId: string; amount: number; count: number }[];
}

export type RecurringCadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

/** A payment (or income) that comes back at a regular rhythm with a similar amount. */
export interface RecurringSeries {
    /** direction + merchant key */
    key: string;
    merchantKey: string;
    label: string;
    categoryId: string;
    direction: CashflowDirection;
    cadence: RecurringCadence;
    /** Median interval between two occurrences, in days */
    intervalDays: number;
    /** Absolute, base currency */
    averageAmount: number;
    lastAmount: number;
    /** (last − previous) / previous; null when the amount did not change */
    priceChange: number | null;
    firstDate: string;
    lastDate: string;
    /** Expected date of the next occurrence (ISO date) */
    nextDate: string;
    occurrences: number;
    operationIds: string[];
}

export type SankeyNodeKind = 'source' | 'income' | 'group' | 'detail';

export interface CashflowSankeyNode {
    id: string;
    kind: SankeyNodeKind;
    /** Built-in category or i18n group id; the UI translates it */
    categoryId?: string;
    /** Free label (account name, custom category) when there is no i18n key */
    label?: string;
    value: number;
}

export interface CashflowSankeyLink {
    source: number;
    target: number;
    value: number;
}

export interface CashflowSankey {
    nodes: CashflowSankeyNode[];
    links: CashflowSankeyLink[];
}

export interface AmountBucket {
    /** Lower bound, inclusive */
    min: number;
    /** Upper bound, exclusive; null = no upper bound */
    max: number | null;
    count: number;
    total: number;
}

export interface MerchantTotal {
    merchantKey: string;
    label: string;
    categoryId: string;
    amount: number;
    count: number;
}

export interface BankTotal {
    instituteId: string;
    instituteName: string;
    income: number;
    expenses: number;
}

export interface CashflowSummary {
    /** ISO dates of the period, end exclusive */
    periodStart: string;
    periodEnd: string;
    currency: string;
    income: number;
    expenses: number;
    savingsInvested: number;
    available: number;
    savingsRate: number;
    /** Investment income / expenses, 0–1+ */
    passiveCoverage: number;
    months: CashflowMonth[];
    categories: CashflowCategoryTotal[];
    sankey: CashflowSankey;
    distribution: AmountBucket[];
    weekdays: number[];
    topMerchants: MerchantTotal[];
    banks: BankTotal[];
    operationCount: number;
    uncategorizedCount: number;
}
