/**
 * One import for every account (Epic E52): any account can be chosen, and the wizard says what it takes — a checking
 * account its bank operations, a savings account its operations or its current balance, an investment account
 * trades and holdings.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../../src/i18n';
import i18n from '../../../src/i18n';

const wizard = vi.hoisted(() => ({
    selectAccount: vi.fn(),
    setImportMode: vi.fn(),
    goToStep: vi.fn(),
    state: { selectedAccountId: null as string | null },
}));

vi.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u', preferences: { language: 'en', currency: 'EUR' } } }) }));
vi.mock('../../../src/hooks/importHooks', () => {
    const accounts = [
        { id: 'acc-pea', name: 'PEA Bourso', type: 'investment', wrapperType: 'PEA', defaultCurrency: 'EUR' },
        { id: 'acc-cc', name: 'Compte courant', type: 'checking', wrapperType: 'OTHER', defaultCurrency: 'EUR' },
        { id: 'acc-livret', name: 'Livret A', type: 'savings', wrapperType: 'LIVRET', defaultCurrency: 'EUR' },
    ];
    return {
        useImportWizard: () => ({
            step: 1,
            importMode: 'history',
            setImportMode: wizard.setImportMode,
            goToStep: wizard.goToStep,
            goBack: vi.fn(),
            reset: vi.fn(),
            error: null,
            isLoading: false,
            institutes: [{ id: 'inst', name: 'BoursoBank', type: 'bank', country: 'FR' }],
            selectedInstituteId: 'inst',
            selectedInstitute: { id: 'inst', name: 'BoursoBank' },
            selectInstitute: vi.fn(),
            accounts,
            selectedAccountId: wizard.state.selectedAccountId,
            selectedAccount: accounts.find(account => account.id === wizard.state.selectedAccountId) ?? null,
            selectAccount: wizard.selectAccount,
            createInstitute: vi.fn(),
            createAccount: vi.fn(),
        }),
    };
});

import ImportWizard from '../../../src/pages/ImportWizard';

const renderWizard = (path: string) => render(<MemoryRouter initialEntries={[path]}><ImportWizard /></MemoryRouter>);

beforeEach(async () => {
    vi.clearAllMocks();
    wizard.state.selectedAccountId = null;
    await i18n.changeLanguage('en');
});

describe('import into a checking, savings or investment account', () => {
    it('lets every account be chosen and says what each one takes', () => {
        renderWizard('/import');
        const pea = screen.getByRole('button', { name: /PEA Bourso/ }) as HTMLButtonElement;
        expect(pea.disabled).toBe(false);
        expect(pea.textContent).toContain('Trades and holdings');
        expect(screen.getByRole('button', { name: /Compte courant/ }).textContent).toContain('Bank operations');
        expect(screen.getByRole('button', { name: /Livret A/ }).textContent).toContain('Operations or balance');
        fireEvent.click(screen.getByRole('button', { name: /Compte courant/ }));
        expect(wizard.selectAccount).toHaveBeenCalledWith('acc-cc');
    });

    it('a checking account takes its bank operations, as a history', () => {
        wizard.state.selectedAccountId = 'acc-cc';
        renderWizard('/import');
        expect(screen.getByText('Checking account: bank operations')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
        expect(wizard.setImportMode).toHaveBeenCalledWith('history');
        expect(wizard.goToStep).toHaveBeenCalledWith(2);
    });

    it('a savings account takes its operations or its current balance', () => {
        wizard.state.selectedAccountId = 'acc-livret';
        renderWizard('/import');
        expect(screen.getByText('Savings account: operations or balance')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Its current balance/ }));
        fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
        expect(wizard.setImportMode).toHaveBeenLastCalledWith('snapshot');
    });

    it('an investment account keeps the trades and holdings import', () => {
        wizard.state.selectedAccountId = 'acc-pea';
        renderWizard('/import');
        expect(screen.getByText(/Investment account: trades, dividends and holdings/)).toBeTruthy();
        expect(screen.queryByText('Checking account: bank operations')).toBeNull();
    });
});
