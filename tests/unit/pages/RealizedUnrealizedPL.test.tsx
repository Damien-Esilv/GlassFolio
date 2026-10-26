/**
 * Realized & unrealized P&L page (TGLA-148)
 * The realized figure must come from the ledger, never from a fixed share of the sales.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { preferences: { language: 'en', currency: 'EUR', dateFormat: 'DD/MM/YYYY' } } }),
}));
// Stable references, like the memoized DataContext (a new array per render would re-run the effect forever)
const DATA = {
  positions: [],
  // The old estimate would have shown 100 × 10 × 15 % = 150 for this sale
  transactions: [{ id: 't1', type: 'Sell', price: 100, amount: 10, currency: 'EUR', symbol: 'AAPL' }],
};
vi.mock('../../../src/context/DataContext', () => ({
  useData: () => DATA,
}));
vi.mock('../../../src/services/currencyService', () => ({
  currencyService: { convertAmount: vi.fn((amount: number) => amount), getExchangeRates: vi.fn(async () => ({})) },
}));
const getRealizedPL = vi.fn();
vi.mock('../../../src/services/portfolioService', () => ({
  portfolioService: { getRealizedPL: (...args: unknown[]) => getRealizedPL(...args) },
}));
vi.mock('../../../src/components/AnimatedCounter', () => ({
  default: ({ value }: { value: number }) => <span data-testid="counter">{value}</span>,
}));

import RealizedUnrealizedPL from '../../../src/pages/RealizedUnrealizedPL';

describe('RealizedUnrealizedPL page', () => {
  it('shows the realized P&L computed by the ledger', async () => {
    getRealizedPL.mockResolvedValue({
      total: 1000,
      byMonth: [{ month: '2024-03', value: 1000 }],
      entries: [{ date: '2024-03-10T00:00:00.000Z', symbol: 'AAPL', assetType: 'Equity', value: 1000 }],
    });

    render(<MemoryRouter><RealizedUnrealizedPL /></MemoryRouter>);

    await waitFor(() => expect(screen.getAllByTestId('counter').map(el => el.textContent)).toContain('1000'));
    expect(getRealizedPL).toHaveBeenCalledWith('EUR');
    expect(screen.getAllByTestId('counter').map(el => el.textContent)).not.toContain('150');
  });

  it('shows zero realized P&L when nothing was sold', async () => {
    getRealizedPL.mockResolvedValue({ total: 0, byMonth: [], entries: [] });

    render(<MemoryRouter><RealizedUnrealizedPL /></MemoryRouter>);

    await waitFor(() => expect(getRealizedPL).toHaveBeenCalled());
    expect(screen.getAllByTestId('counter').map(el => el.textContent)).not.toContain('150');
  });
});
