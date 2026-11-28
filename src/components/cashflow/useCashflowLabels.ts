/**
 * Labels of the cash flow pages: category names (built-in, translated; custom, as named), Sankey
 * node names, month names and amounts in the user's currency and language.
 */
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getBuiltinCashflowCategory } from '../../constants/cashflowCategories';
import { formatCurrency } from '../../utils/currency';
import type { CashflowSankeyNode, CustomCashflowCategory } from '../../types/cashflow';
import type { CashflowPeriodPreset } from '../../services/cashflow/period';

/** Sankey nodes that are not categories: translated under `cashflow:sankey.<id>`. */
const SANKEY_SPECIAL_IDS = new Set(['income_total', 'group_taxes', 'group_savings', 'group_expenses', 'from_savings', 'available', 'others']);

export interface CashflowLabels {
    locale: string;
    currency: string;
    categoryName: (id: string) => string;
    nodeName: (node: Pick<CashflowSankeyNode, 'categoryId' | 'label'>) => string;
    /** "octobre 2026" (long) or "OCT." (short) */
    monthName: (month: string, style?: 'long' | 'short') => string;
    /** A period of the carousel: "October 2026", "Aug – Oct 2026", "Nov 2025 – Oct 2026" or "2026". */
    periodName: (preset: CashflowPeriodPreset, first: string, last: string) => string;
    money: (value: number, decimals?: number) => string;
    percent: (ratio: number, decimals?: number) => string;
}

export function useCashflowLabels(customCategories: readonly CustomCashflowCategory[] = []): CashflowLabels {
    const { t } = useTranslation();
    const { user } = useAuth();
    const locale = user?.preferences?.language === 'fr' ? 'fr-FR' : 'en-US';
    const currency = user?.preferences?.currency || 'EUR';

    const customNames = useMemo(() => new Map(customCategories.map(c => [c.id, c.name])), [customCategories]);

    const categoryName = useCallback((id: string): string => {
        const custom = customNames.get(id);
        if (custom) return custom;
        const builtin = getBuiltinCashflowCategory(id);
        return builtin ? t(`cashflow:categories.${builtin.i18nKey}`) : id;
    }, [customNames, t]);

    const nodeName = useCallback((node: Pick<CashflowSankeyNode, 'categoryId' | 'label'>): string => {
        if (node.label) return node.label;
        if (node.categoryId && SANKEY_SPECIAL_IDS.has(node.categoryId)) return t(`cashflow:sankey.${node.categoryId}`);
        return node.categoryId ? categoryName(node.categoryId) : '';
    }, [categoryName, t]);

    const monthName = useCallback((month: string, style: 'long' | 'short' = 'long'): string => {
        const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 15));
        return style === 'long'
            ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
            : new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(date).toUpperCase();
    }, [locale]);

    const periodName = useCallback((preset: CashflowPeriodPreset, first: string, last: string): string => {
        if (preset === 'month') return monthName(last);
        if (preset === 'ytd') return last.slice(0, 4);
        const short = (month: string): string => new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
            .format(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 15)));
        const [fromYear, toYear] = [first.slice(0, 4), last.slice(0, 4)];
        return fromYear === toYear ? `${short(first)} – ${short(last)} ${toYear}` : `${short(first)} ${fromYear} – ${short(last)} ${toYear}`;
    }, [locale, monthName]);

    const money = useCallback((value: number, decimals: number = 0): string => {
        // Never "-0 €": a total that rounds to zero is zero
        const rounded = Math.abs(value) < 0.5 * 10 ** -decimals ? 0 : value;
        return formatCurrency(rounded, currency, locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }, [currency, locale]);

    const percent = useCallback((ratio: number, decimals: number = 0): string =>
        new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(ratio), [locale]);

    return { locale, currency, categoryName, nodeName, monthName, periodName, money, percent };
}
