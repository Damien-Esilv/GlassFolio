/**
 * Summary page: one account (a BoursoBank PEA) appears under several asset classes.
 * Expanding it under Equities must leave the same account closed under ETFs and Cash.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { preferences: { language: 'en', currency: 'EUR' } } }),
}));
const position = (id: string, symbol: string, type: string, instrument: string) => ({
  id, symbol, type, instrument, quantity: 1, avgPrice: 10, lastPrice: 12, marketValue: 12, unrealizedPL: 2,
  currency: 'EUR', bankName: 'BoursoBank', accountName: 'PEA',
});
const DATA = {
  positions: [
    position('p1', 'RNO', 'Equities', 'Renault'),
    position('p2', 'CW8', 'ETFs', 'Amundi MSCI World'),
    position('p3', 'EUR', 'Cash', 'Cash EUR'),
  ],
};
vi.mock('../../../src/context/DataContext', () => ({ useData: () => DATA }));
vi.mock('../../../src/components/AnimatedCounter', () => ({
  default: ({ value }: { value: number }) => <span>{value}</span>,
}));

import Portfolio from '../../../src/pages/Portfolio';

describe('Portfolio summary', () => {
  it('expands an account only under the asset class that was clicked', () => {
    render(<MemoryRouter><Portfolio /></MemoryRouter>);

    const accountRows = screen.getAllByText('PEA');
    expect(accountRows).toHaveLength(3);
    expect(screen.queryByText('Renault')).toBeNull();

    fireEvent.click(accountRows[0]);

    const shown = ['Renault', 'Amundi MSCI World', 'Cash EUR'].filter(name => screen.queryByText(name));
    expect(shown).toHaveLength(1);
  });
});
