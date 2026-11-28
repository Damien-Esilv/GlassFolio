/**
 * Cash flow page (Epic E52 — TGLA-250/251/255): one page with its sections in tabs; the overview shows
 * the month's available cash with money in, money out and the savings rate; the period carousel moves by the period
 * chosen; without a bank connected the pages say how operations come in; a first visit without operations shows the
 * ways in; the operations list offers a rule after a category change; the recurring calendar puts each payment on
 * its day and a series can be set aside.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '../../../src/i18n';
import i18n from '../../../src/i18n';
import type { CashflowOperation, CashflowSummary } from '../../../src/types/cashflow';

vi.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { preferences: { language: 'en', currency: 'EUR' } } }) }));
vi.mock('../../../src/context/DataContext', () => ({ useData: () => ({ transactions: [] }) }));
vi.mock('../../../src/services/connectors/woobClient', () => ({ woobClient: { status: vi.fn().mockResolvedValue({ available: false }) } }));
vi.mock('../../../src/services/connectors/connectionService', () => ({ connectionService: { listConnections: mocks.listConnections } }));

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
    listConnections: vi.fn(),
    getForecast: vi.fn(),
    getBudgetStatus: vi.fn(),
    setBudget: vi.fn(),
    listRecurring: vi.fn(),
    setRecurringStatus: vi.fn(),
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
        listRecurring: mocks.listRecurring,
        setRecurringStatus: mocks.setRecurringStatus,
        ownerId: () => 'u',
    },
}));
vi.mock('../../../src/services/cashflow/cashflowPlanningService', () => ({
    cashflowPlanningService: { getForecast: mocks.getForecast, getBudgetStatus: mocks.getBudgetStatus, setBudget: mocks.setBudget },
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
import CashflowRecurring from '../../../src/pages/cashflow/CashflowRecurring';
import CashflowBudgets from '../../../src/pages/cashflow/CashflowBudgets';
import { currentBudgetMonth, shiftBudgetMonth } from '../../../src/services/cashflow/period';

const renderAt = (path: string) => render(
    <MemoryRouter initialEntries={[path]}>
        <Routes>
            <Route path="/cashflow" element={<CashflowLayout />}>
                <Route index element={<CashflowOverview />} />
                <Route path="recurring" element={<CashflowRecurring />} />
                <Route path="budgets" element={<CashflowBudgets />} />
                <Route path="operations" element={<CashflowOperations />} />
            </Route>
        </Routes>
    </MemoryRouter>,
);

const CURRENT = currentBudgetMonth(new Date());
const TODAY = new Date().toISOString().slice(0, 10);

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
    mocks.listConnections.mockResolvedValue([{ id: 'c', accountMap: { 'cc-1': 'acc' } }]);
    mocks.setRecurringStatus.mockResolvedValue({ success: true, value: undefined });
    mocks.getForecast.mockResolvedValue({
        month: CURRENT, today: TODAY, monthEnd: TODAY, balanceToday: 1200, projectedEnd: 640, lowestProjected: 640,
        upcomingTotal: -42, recurringTotal: -300, variableTotal: -218, variablePerDay: 25,
        points: [{ date: TODAY, balance: 1200, projected: false }],
    });
    mocks.getBudgetStatus.mockResolvedValue({ month: CURRENT, statuses: [{ categoryId: 'housing', limit: 900, spent: 950, ratio: 950 / 900, remaining: -50, state: 'over' }] });
    mocks.setBudget.mockResolvedValue({ success: true, value: undefined });
    mocks.listRecurring.mockResolvedValue({
        month: CURRENT, start: `${CURRENT}-01`, end: `${shiftBudgetMonth(CURRENT, 1)}-01`,
        items: [{
            key: 'out:NETFLIX', merchantKey: 'NETFLIX', label: 'Netflix', categoryId: 'subscriptions', direction: 'out', cadence: 'monthly',
            intervalDays: 30, averageAmount: 13.49, lastAmount: 15.99, priceChange: 0.185, firstDate: '2026-05-05', lastDate: TODAY,
            nextDate: TODAY, occurrences: 6, operationIds: ['op-n'], status: 'detected',
            payments: [{ date: TODAY, amount: -15.99, expected: false, operationId: 'op-n' }],
        }],
    });
});

describe('Cash flow pages', () => {
    it('keeps every section on one page, in tabs', async () => {
        renderAt('/cashflow');
        expect(await screen.findByRole('heading', { level: 1, name: 'Cash flow' })).toBeTruthy();
        const tabs = screen.getByRole('navigation', { name: 'Cash flow sections' });
        for (const title of ['Overview', 'Flows', 'Categories', 'Distribution', 'Recurring', 'Operations']) {
            expect(within(tabs).getByRole('link', { name: title })).toBeTruthy();
        }
        expect(within(tabs).getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBe('page');
    });

    it('shows the available cash, money in, money out and the savings rate', async () => {
        renderAt('/cashflow');
        expect(await screen.findByText(/Cash available/i)).toBeTruthy();
        expect(screen.getAllByText('Money in').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Money out').length).toBeGreaterThan(0);
        expect(await screen.findByLabelText('35.4%')).toBeTruthy();
        expect(screen.getByText('1 operation is not categorised yet')).toBeTruthy();
    });

    it('moves the period carousel by the period chosen', async () => {
        renderAt('/cashflow');
        await screen.findByText(/Cash available/i);
        fireEvent.click(screen.getByRole('button', { name: '3 months' }));
        await waitFor(() => expect(mocks.getSummary).toHaveBeenLastCalledWith(expect.objectContaining({ preset: '3m', month: CURRENT })));
        expect(screen.getByRole('group', { name: 'Month' }).textContent).toContain('–');
        fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
        await waitFor(() => expect(mocks.getSummary).toHaveBeenLastCalledWith(expect.objectContaining({ preset: '3m', month: shiftBudgetMonth(CURRENT, -3) })));
        fireEvent.click(screen.getByRole('button', { name: 'Year' }));
        await waitFor(() => expect(mocks.getSummary).toHaveBeenLastCalledWith(expect.objectContaining({ preset: 'ytd' })));
        expect(screen.getByRole('group', { name: 'Month' }).textContent).toMatch(/\d{4}/);
    });

    it('says how operations come in while no bank is connected', async () => {
        mocks.listConnections.mockResolvedValue([]);
        renderAt('/cashflow');
        expect(await screen.findByText('No bank connected yet')).toBeTruthy();
        expect(screen.getByRole('link', { name: /Import a statement/ }).getAttribute('href')).toBe('/import');
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

    it('shows the end-of-month forecast on the overview', async () => {
        renderAt('/cashflow');
        const card = await screen.findByRole('region', { name: /Forecast for/ });
        expect(card.textContent).toContain('Expected at month end');
        expect(card.textContent).toContain('Announced by the bank');
    });

    it('shows each budget with its gauge and saves a cap typed in place', async () => {
        renderAt('/cashflow/budgets');
        const housing = await screen.findByRole('meter', { name: 'Housing' });
        expect(housing.getAttribute('aria-valuenow')).toBe('106');
        expect(screen.getByText(/€50 over/)).toBeTruthy();
        const cap = screen.getByRole('textbox', { name: 'Monthly cap for Groceries' });
        fireEvent.change(cap, { target: { value: '400' } });
        fireEvent.blur(cap);
        await waitFor(() => expect(mocks.setBudget).toHaveBeenCalledWith('groceries', 400));
    });

    it('puts each recurring payment on its day and sets a series aside', async () => {
        renderAt('/cashflow/recurring');
        expect(await screen.findByRole('grid', { name: 'Recurring payments of the month' })).toBeTruthy();
        expect(screen.getByRole('gridcell', { name: /Netflix/ })).toBeTruthy();
        expect(screen.queryByRole('group', { name: 'Period' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Not recurring Netflix' }));
        await waitFor(() => expect(mocks.setRecurringStatus).toHaveBeenCalledWith('out:NETFLIX', 'ignored'));
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
