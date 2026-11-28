/**
 * Cash flow section (Epic E52 — TGLA-250/251): the overview shows the month's available cash with
 * money in, money out and the savings rate; a first visit without operations shows the ways in;
 * the operations list offers a rule after a category change.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '../../../src/i18n';
import i18n from '../../../src/i18n';
import type { CashflowOperation, CashflowSummary } from '../../../src/types/cashflow';

vi.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { preferences: { language: 'en', currency: 'EUR' } } }) }));
vi.mock('../../../src/context/DataContext', () => ({ useData: () => ({ transactions: [] }) }));
vi.mock('../../../src/services/connectors/woobClient', () => ({ woobClient: { status: vi.fn().mockResolvedValue({ available: false }) } }));

const operation: CashflowOperation = {
    id: 'op-1', accountId: 'acc', accountName: 'Courant', instituteId: 'inst', instituteName: 'BoursoBank',
    date: '2026-10-12T10:00:00.000Z', amount: -42, originalAmount: -42, currency: 'EUR', direction: 'out',
    label: 'Zqxw Shop', rawLabel: 'CARTE ZQXW SHOP', merchantKey: 'ZQXW SHOP', categoryId: 'other_expense',
    categoryKind: 'expense', categorySource: 'fallback', excluded: false, sourceOrigin: 'FILE', editable: true,
};

const summary: CashflowSummary = {
    periodStart: '2026-10-01', periodEnd: '2026-11-01', currency: 'EUR',
    income: 3250, expenses: 2100, savingsInvested: 600, available: 550, savingsRate: 0.354, passiveCoverage: 0.02,
    months: [
        { month: '2026-09', income: 3250, expenses: 2000, fixedExpenses: 1500, variableExpenses: 500, savingsInvested: 600, available: 650, savingsRate: 0.38 },
        { month: '2026-10', income: 3250, expenses: 2100, fixedExpenses: 1500, variableExpenses: 600, savingsInvested: 600, available: 550, savingsRate: 0.354 },
    ],
    categories: [
        { categoryId: 'salary', kind: 'income', amount: 3250, share: 1, count: 1, averageMonthly: 3250, deltaVsAverage: 0, children: [] },
        { categoryId: 'housing', kind: 'expense', amount: 950, share: 0.45, count: 1, averageMonthly: 950, deltaVsAverage: 0, children: [] },
    ],
    sankey: { nodes: [], links: [] },
    distribution: [{ min: 0, max: 5, count: 0, total: 0 }],
    weekdays: [0, 0, 0, 0, 0, 0, 0],
    topMerchants: [],
    banks: [],
    operationCount: 2,
    uncategorizedCount: 1,
};

const mocks = vi.hoisted(() => ({
    getSummary: vi.fn(),
    listOperations: vi.fn(),
    listCashAccounts: vi.fn(),
    getRecurringSeries: vi.fn(),
    getVaultUsage: vi.fn(),
    listCategories: vi.fn(),
    getSettings: vi.fn(),
    setCategory: vi.fn(),
}));

vi.mock('../../../src/services/cashflow/cashflowService', () => ({
    cashflowService: {
        getSummary: mocks.getSummary,
        listOperations: mocks.listOperations,
        listCashAccounts: mocks.listCashAccounts,
        getRecurringSeries: mocks.getRecurringSeries,
        getVaultUsage: mocks.getVaultUsage,
        ownerId: () => 'u',
    },
}));
vi.mock('../../../src/services/cashflow/cashflowCategoryService', () => ({
    cashflowCategoryService: {
        listCategories: mocks.listCategories,
        getSettings: mocks.getSettings,
        setCategory: mocks.setCategory,
        listRules: vi.fn().mockResolvedValue([]),
    },
}));

import CashflowLayout from '../../../src/pages/cashflow/CashflowLayout';
import CashflowOverview from '../../../src/pages/cashflow/CashflowOverview';
import CashflowOperations from '../../../src/pages/cashflow/CashflowOperations';

const renderAt = (path: string) => render(
    <MemoryRouter initialEntries={[path]}>
        <Routes>
            <Route path="/cashflow" element={<CashflowLayout />}>
                <Route index element={<CashflowOverview />} />
                <Route path="operations" element={<CashflowOperations />} />
            </Route>
        </Routes>
    </MemoryRouter>,
);

beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    mocks.getSummary.mockResolvedValue(summary);
    mocks.listOperations.mockResolvedValue([operation]);
    mocks.listCashAccounts.mockResolvedValue([{ id: 'acc', name: 'Courant', instituteName: 'BoursoBank', currency: 'EUR', included: true }]);
    mocks.getRecurringSeries.mockResolvedValue([]);
    mocks.getVaultUsage.mockReturnValue(0.1);
    mocks.listCategories.mockResolvedValue([
        { id: 'other_expense', kind: 'expense', i18nKey: 'other_expense', custom: false },
        { id: 'shopping', kind: 'expense', i18nKey: 'shopping', custom: false },
        { id: 'salary', kind: 'income', i18nKey: 'salary', custom: false },
    ]);
    mocks.getSettings.mockResolvedValue({ ownerId: 'u', includedAccountIds: null, includeInvestmentIncome: true, monthStartDay: 1, updatedAt: '' });
    mocks.setCategory.mockResolvedValue({ success: true, value: { updated: 1 } });
});

describe('Cash flow pages', () => {
    it('shows the available cash, money in, money out and the savings rate', async () => {
        renderAt('/cashflow');
        expect(await screen.findByText(/Cash available/i)).toBeTruthy();
        expect(screen.getAllByText('Money in').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Money out').length).toBeGreaterThan(0);
        expect(screen.getByText('35.4%')).toBeTruthy();
        expect(screen.getByText('1 operation is not categorised yet')).toBeTruthy();
        expect(screen.getByRole('link', { name: /Flows/ })).toBeTruthy();
    });

    it('shows the ways in when there is no bank operation yet', async () => {
        mocks.listOperations.mockResolvedValue([]);
        renderAt('/cashflow');
        expect(await screen.findByText('Your cash flow starts with your bank operations')).toBeTruthy();
        expect(screen.getByText('Automatic bank sync works in the desktop app and in Docker.')).toBeTruthy();
    });

    it('warns when the vault is nearly full', async () => {
        mocks.getVaultUsage.mockReturnValue(0.92);
        renderAt('/cashflow');
        expect(await screen.findByText(/Your vault is nearly full \(92/)).toBeTruthy();
    });

    it('offers a rule after a category change', async () => {
        renderAt('/cashflow/operations');
        fireEvent.click(await screen.findByRole('button', { name: 'Change the category of Zqxw Shop' }));
        const pick = screen.getAllByRole('option', { name: /Shopping/ }).find(el => el.tagName === 'BUTTON');
        fireEvent.click(pick as HTMLElement);
        await waitFor(() => expect(mocks.setCategory).toHaveBeenCalledWith(['op-1'], 'shopping'));
        expect(await screen.findByText('Apply to similar operations?')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Yes, create a rule' }));
        await waitFor(() => expect(mocks.setCategory).toHaveBeenLastCalledWith(['op-1'], 'shopping', { createRule: true }));
    });
});
