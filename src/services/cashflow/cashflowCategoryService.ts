/**
 * Categories, rules and settings of the cash flow (Epic E52 — TGLA-249).
 */
import { db, delay } from '../db';
import {
    CASHFLOW_CATEGORIES,
    isBuiltinCashflowCategory,
    resolveCashflowCategory,
} from '../../constants/cashflowCategories';
import type {
    BuiltinCashflowCategoryId,
    CashflowCategoryKind,
    CashflowSettings,
    CategorizationRule,
    CustomCashflowCategory,
    RuleDirection,
} from '../../types/cashflow';
import { cashflowService, type CashflowResult } from './cashflowService';
import { merchantKey } from './text';

export interface CategoryOption {
    id: string;
    kind: CashflowCategoryKind;
    /** Built-in: translated under `cashflow:categories.<i18nKey>`; custom: its own name */
    i18nKey?: string;
    name?: string;
    parentId?: string;
    custom: boolean;
}

export interface RuleInput {
    categoryId: string;
    labelContains: string;
    accountId?: string;
    direction?: RuleDirection;
    minAmount?: number;
    maxAmount?: number;
    source?: 'user' | 'ai';
}

const MAX_NAME = 40;
const MAX_RULE_TEXT = 60;

const newId = (prefix: string): string =>
    `${prefix}-${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;

const categoryExists = (id: string): boolean =>
    isBuiltinCashflowCategory(id) || db.getCashflowCategories().some(c => c.id === id);

export const cashflowCategoryService = {
    /** Built-in categories (and sub-categories) followed by the user's own, for pickers and the AI. */
    listCategories: async (): Promise<CategoryOption[]> => {
        await delay(60);
        const custom = db.getCashflowCategories();
        return [
            ...CASHFLOW_CATEGORIES.map(c => ({ id: c.id, kind: c.kind, i18nKey: c.i18nKey, parentId: c.parentId, custom: false })),
            ...custom.map(c => ({ id: c.id, kind: resolveCashflowCategory(c.id, custom).kind, name: c.name, parentId: c.parentId, custom: true })),
        ];
    },

    /** Creates a sub-category under a built-in category (it takes the parent's colour and kind). */
    createCategory: async (parentId: string, name: string): Promise<CashflowResult<CustomCashflowCategory>> => {
        await delay(100);
        if (!isBuiltinCashflowCategory(parentId) || parentId === 'internal_transfer') return { success: false, error: 'invalid_parent' };
        const clean = name.trim().slice(0, MAX_NAME);
        if (!clean) return { success: false, error: 'empty_name' };
        const existing = db.getCashflowCategories();
        if (existing.some(c => c.parentId === parentId && c.name.toLowerCase() === clean.toLowerCase())) {
            return { success: false, error: 'duplicate_name' };
        }
        const now = new Date().toISOString();
        const category: CustomCashflowCategory = {
            id: newId('cfc'),
            ownerId: cashflowService.ownerId(),
            parentId: parentId as BuiltinCashflowCategoryId,
            name: clean,
            createdAt: now,
            updatedAt: now,
        };
        db.saveCashflowCategories([...existing, category]);
        return { success: true, value: category };
    },

    renameCategory: async (id: string, name: string): Promise<CashflowResult> => {
        await delay(80);
        const clean = name.trim().slice(0, MAX_NAME);
        if (!clean) return { success: false, error: 'empty_name' };
        const existing = db.getCashflowCategories();
        if (!existing.some(c => c.id === id)) return { success: false, error: 'not_found' };
        db.saveCashflowCategories(existing.map(c => (c.id === id ? { ...c, name: clean, updatedAt: new Date().toISOString() } : c)));
        return { success: true, value: undefined };
    },

    /** Deletes a custom category; its operations and rules move to the parent category. */
    deleteCategory: async (id: string): Promise<CashflowResult> => {
        await delay(100);
        const existing = db.getCashflowCategories();
        const category = existing.find(c => c.id === id);
        if (!category) return { success: false, error: 'not_found' };
        const now = new Date().toISOString();
        db.saveCashflowAnnotations(db.getCashflowAnnotations().map(a => (a.categoryId === id ? { ...a, categoryId: category.parentId, updatedAt: now } : a)));
        db.saveCashflowRules(db.getCashflowRules().map(r => (r.categoryId === id ? { ...r, categoryId: category.parentId, updatedAt: now } : r)));
        db.saveCashflowCategories(existing.filter(c => c.id !== id));
        return { success: true, value: undefined };
    },

    listRules: async (): Promise<CategorizationRule[]> => {
        await delay(60);
        return db.getCashflowRules();
    },

    createRule: async (input: RuleInput): Promise<CashflowResult<CategorizationRule>> => {
        await delay(100);
        if (!categoryExists(input.categoryId)) return { success: false, error: 'unknown_category' };
        const text = input.labelContains.trim().slice(0, MAX_RULE_TEXT);
        if (text.length < 2) return { success: false, error: 'rule_text_too_short' };
        if (input.accountId && !db.getAccountById(input.accountId)) return { success: false, error: 'account_not_found' };
        const min = input.minAmount !== undefined && Number.isFinite(input.minAmount) ? Math.abs(input.minAmount) : undefined;
        const max = input.maxAmount !== undefined && Number.isFinite(input.maxAmount) ? Math.abs(input.maxAmount) : undefined;
        if (min !== undefined && max !== undefined && min > max) return { success: false, error: 'invalid_amount_range' };
        const now = new Date().toISOString();
        const rule: CategorizationRule = {
            id: newId('cfr'),
            ownerId: cashflowService.ownerId(),
            categoryId: input.categoryId,
            labelContains: text,
            accountId: input.accountId,
            direction: input.direction ?? 'any',
            minAmount: min,
            maxAmount: max,
            source: input.source ?? 'user',
            createdAt: now,
            updatedAt: now,
        };
        db.saveCashflowRules([...db.getCashflowRules(), rule]);
        return { success: true, value: rule };
    },

    deleteRule: async (id: string): Promise<CashflowResult> => {
        await delay(80);
        const rules = db.getCashflowRules();
        if (!rules.some(r => r.id === id)) return { success: false, error: 'not_found' };
        db.saveCashflowRules(rules.filter(r => r.id !== id));
        return { success: true, value: undefined };
    },

    /**
     * Puts operations in a category. With `createRule`, the merchant of the first operation becomes a
     * rule, so similar operations (past and future) follow.
     */
    setCategory: async (
        transactionIds: string[],
        categoryId: string,
        options: { createRule?: boolean } = {},
    ): Promise<CashflowResult<{ updated: number; ruleId?: string }>> => {
        await delay(120);
        if (!categoryExists(categoryId)) return { success: false, error: 'unknown_category' };
        const ids = Array.from(new Set(transactionIds)).slice(0, 500);
        const journal = new Map(db.getUnifiedTransactions().map(tx => [tx.id, tx]));
        const known = ids.filter(id => journal.has(id));
        if (known.length === 0) return { success: false, error: 'not_found' };
        const now = new Date().toISOString();
        const annotations = db.getCashflowAnnotations();
        const byTx = new Map(annotations.map(a => [a.transactionId, a]));
        for (const id of known) {
            const tx = journal.get(id);
            const current = byTx.get(id);
            byTx.set(id, current
                ? { ...current, categoryId, updatedAt: now }
                : { id: `cfa-${id}`, ownerId: tx?.ownerId ?? 'default-user', transactionId: id, categoryId, updatedAt: now });
        }
        db.saveCashflowAnnotations([...byTx.values()]);

        let ruleId: string | undefined;
        if (options.createRule) {
            const first = journal.get(known[0]);
            const key = merchantKey(first?.rawLabel || first?.label || '');
            const amount = Number.parseFloat(first?.amountPrimary ?? '0');
            if (key) {
                const rule = await cashflowCategoryService.createRule({
                    categoryId,
                    labelContains: key,
                    direction: amount > 0 ? 'in' : amount < 0 ? 'out' : 'any',
                });
                if (rule.success) ruleId = rule.value.id;
            }
        }
        return { success: true, value: { updated: known.length, ruleId } };
    },

    getSettings: async (): Promise<CashflowSettings> => {
        await delay(40);
        return db.getCashflowSettings();
    },

    saveSettings: async (patch: Partial<Omit<CashflowSettings, 'ownerId' | 'updatedAt'>>): Promise<CashflowSettings> => {
        await delay(80);
        const current = db.getCashflowSettings();
        const known = new Set(db.getAccounts().map(a => a.id));
        const next: CashflowSettings = {
            ...current,
            ...patch,
            includedAccountIds: patch.includedAccountIds === undefined
                ? current.includedAccountIds
                : patch.includedAccountIds === null ? null : patch.includedAccountIds.filter(id => known.has(id)),
            monthStartDay: Math.min(28, Math.max(1, Math.trunc(patch.monthStartDay ?? current.monthStartDay))),
            ownerId: cashflowService.ownerId(),
            updatedAt: new Date().toISOString(),
        };
        db.saveCashflowSettings(next);
        return next;
    },
};
