/**
 * Built-in cash flow categories (Epic E52 — TGLA-249).
 *
 * Each one has a fixed colour (src/constants/cashflowPalette.ts) and an icon; its name is translated
 * under `cashflow:categories.<id>`. A custom sub-category created by the user hangs under one of them
 * and takes its colour. Three built-in sub-categories feed the tax card (donations, home services,
 * childcare).
 */
import {
    Baby,
    Banknote,
    Briefcase,
    Car,
    CircleDashed,
    Coins,
    Gift,
    GraduationCap,
    HandCoins,
    HeartHandshake,
    HeartPulse,
    House,
    Landmark,
    type LucideIcon,
    Percent,
    PiggyBank,
    Plane,
    Repeat,
    ShieldCheck,
    ShoppingBag,
    ShoppingCart,
    Sparkles,
    Ticket,
    TrendingUp,
    UtensilsCrossed,
    Wallet,
    ArrowLeftRight,
} from 'lucide-react';
import type { BuiltinCashflowCategoryId, CashflowCategoryKind, CustomCashflowCategory } from '../types/cashflow';
import {
    CASHFLOW_CATEGORY_PALETTE,
    CASHFLOW_INCOME_PALETTE,
    CASHFLOW_ROLE_TOKENS,
    type CashflowColorTokens,
} from './cashflowPalette';

export interface CashflowCategoryConfig {
    id: BuiltinCashflowCategoryId;
    kind: CashflowCategoryKind;
    /** Translated under `cashflow:categories.<i18nKey>` */
    i18nKey: string;
    icon: LucideIcon;
    tokens: CashflowColorTokens;
    /** Set on built-in sub-categories */
    parentId?: BuiltinCashflowCategoryId;
}

const cat = (index: number): CashflowColorTokens => CASHFLOW_CATEGORY_PALETTE[index - 1];
const inc = (index: number): CashflowColorTokens => CASHFLOW_INCOME_PALETTE[index - 1];

export const CASHFLOW_CATEGORIES: readonly CashflowCategoryConfig[] = [
    // Money in
    { id: 'salary', kind: 'income', i18nKey: 'salary', icon: Briefcase, tokens: inc(1) },
    { id: 'investment_income', kind: 'income', i18nKey: 'investment_income', icon: TrendingUp, tokens: inc(2) },
    { id: 'benefits_refunds', kind: 'income', i18nKey: 'benefits_refunds', icon: HandCoins, tokens: inc(3) },
    { id: 'other_income', kind: 'income', i18nKey: 'other_income', icon: Coins, tokens: inc(4) },
    // Money out
    { id: 'housing', kind: 'expense', i18nKey: 'housing', icon: House, tokens: cat(7) },
    { id: 'groceries', kind: 'expense', i18nKey: 'groceries', icon: ShoppingCart, tokens: cat(4) },
    { id: 'dining', kind: 'expense', i18nKey: 'dining', icon: UtensilsCrossed, tokens: cat(15) },
    { id: 'transport', kind: 'expense', i18nKey: 'transport', icon: Car, tokens: cat(9) },
    { id: 'subscriptions', kind: 'expense', i18nKey: 'subscriptions', icon: Repeat, tokens: cat(5) },
    { id: 'health', kind: 'expense', i18nKey: 'health', icon: HeartPulse, tokens: cat(2) },
    { id: 'shopping', kind: 'expense', i18nKey: 'shopping', icon: ShoppingBag, tokens: cat(10) },
    { id: 'leisure', kind: 'expense', i18nKey: 'leisure', icon: Ticket, tokens: cat(6) },
    { id: 'travel', kind: 'expense', i18nKey: 'travel', icon: Plane, tokens: cat(16) },
    { id: 'taxes', kind: 'expense', i18nKey: 'taxes', icon: Landmark, tokens: cat(1) },
    { id: 'insurance', kind: 'expense', i18nKey: 'insurance', icon: ShieldCheck, tokens: cat(14) },
    { id: 'bank_fees', kind: 'expense', i18nKey: 'bank_fees', icon: Percent, tokens: cat(13) },
    { id: 'family_education', kind: 'expense', i18nKey: 'family_education', icon: GraduationCap, tokens: cat(11) },
    { id: 'gifts_donations', kind: 'expense', i18nKey: 'gifts_donations', icon: Gift, tokens: cat(3) },
    { id: 'cash_withdrawal', kind: 'expense', i18nKey: 'cash_withdrawal', icon: Banknote, tokens: cat(12) },
    { id: 'other_expense', kind: 'expense', i18nKey: 'other_expense', icon: CircleDashed, tokens: cat(8) },
    // Built-in sub-categories read by the tax card
    { id: 'donations', kind: 'expense', i18nKey: 'donations', icon: HeartHandshake, tokens: cat(3), parentId: 'gifts_donations' },
    { id: 'home_services', kind: 'expense', i18nKey: 'home_services', icon: Sparkles, tokens: cat(7), parentId: 'housing' },
    { id: 'childcare', kind: 'expense', i18nKey: 'childcare', icon: Baby, tokens: cat(11), parentId: 'family_education' },
    // Neither income nor spending
    { id: 'savings_invested', kind: 'savings', i18nKey: 'savings_invested', icon: PiggyBank, tokens: CASHFLOW_ROLE_TOKENS.savings },
    { id: 'internal_transfer', kind: 'transfer', i18nKey: 'internal_transfer', icon: ArrowLeftRight, tokens: CASHFLOW_ROLE_TOKENS.transfer },
];

const BY_ID = new Map<string, CashflowCategoryConfig>(CASHFLOW_CATEGORIES.map(c => [c.id, c]));

/** Fallback categories when nothing else matched, by direction. */
export const FALLBACK_INCOME_CATEGORY: BuiltinCashflowCategoryId = 'other_income';
export const FALLBACK_EXPENSE_CATEGORY: BuiltinCashflowCategoryId = 'other_expense';

export const isBuiltinCashflowCategory = (id: string): id is BuiltinCashflowCategoryId => BY_ID.has(id);

export const getBuiltinCashflowCategory = (id: string): CashflowCategoryConfig | undefined => BY_ID.get(id);

/** Top-level built-in categories (no sub-categories), in display order. */
export const TOP_LEVEL_CASHFLOW_CATEGORIES: readonly CashflowCategoryConfig[] = CASHFLOW_CATEGORIES.filter(c => !c.parentId);

/**
 * Resolves any category id (built-in, built-in sub-category or custom) to the built-in config that
 * gives it its kind, icon and colour. Unknown ids fall back to "other expense".
 */
export function resolveCashflowCategory(
    id: string,
    custom: readonly CustomCashflowCategory[] = [],
): CashflowCategoryConfig {
    const builtin = BY_ID.get(id);
    if (builtin) return builtin;
    const customCategory = custom.find(c => c.id === id);
    const parent = customCategory ? BY_ID.get(customCategory.parentId) : undefined;
    return parent ?? (BY_ID.get(FALLBACK_EXPENSE_CATEGORY) as CashflowCategoryConfig);
}

/** Top-level category an id rolls up to (a sub-category counts in its parent in the charts). */
export function topLevelCashflowCategoryId(id: string, custom: readonly CustomCashflowCategory[] = []): string {
    const config = resolveCashflowCategory(id, custom);
    return config.parentId ?? config.id;
}

export function getCashflowCategoryTokens(id: string, custom: readonly CustomCashflowCategory[] = []): CashflowColorTokens {
    return resolveCashflowCategory(id, custom).tokens;
}
