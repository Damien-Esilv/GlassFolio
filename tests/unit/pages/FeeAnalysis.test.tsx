import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../../src/i18n';
import FeeAnalysis from '../../../src/pages/FeeAnalysis';
import { etfFeeService } from '../../../src/services/etfFeeService';

const mockState = vi.hoisted(() => ({
  language: 'en' as 'en' | 'fr',
  // CW8.PA (TER 0.38%) has a cheaper MSCI World alternative, so one optimisation is listed.
  // Kept as one stable array: the page memoises on `positions`, as the real context does.
  positions: [
    {
      id: 'cw8',
      instrument: 'Amundi MSCI World',
      symbol: 'CW8.PA',
      quantity: 10,
      avgCost: 400,
      lastPrice: 450,
      marketValue: 10000,
      unrealizedPL: 500,
      unrealizedPLPercent: 12.5,
      currency: 'EUR',
      type: 'ETF',
    },
  ],
}));

vi.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { preferences: { language: mockState.language, currency: 'EUR' } },
  }),
}));

vi.mock('../../../src/context/DataContext', () => ({
  useData: () => ({ positions: mockState.positions }),
}));

const FRENCH_FRAGMENTS = ['actif', 'Actif', '/ an', 'Vue globale', 'Zoom actif', 'Échelle', 'Premier ', '/ years'];

const renderPage = (): void => {
  render(
    <MemoryRouter>
      <FeeAnalysis />
    </MemoryRouter>
  );
};

describe('<FeeAnalysis /> i18n', () => {
  beforeEach(async () => {
    mockState.language = 'en';
    await i18n.changeLanguage('en');
  });

  it('renders the whole page in English without French text', () => {
    renderPage();

    screen.getByText('1 asset to optimise');
    screen.getByText('Global view (0 - max)');

    const text = document.body.textContent ?? '';
    for (const fragment of FRENCH_FRAGMENTS) {
      expect(text).not.toContain(fragment);
    }
  });

  it('uses the singular "/ year" suffix and the plural form only for counts above one', () => {
    renderPage();

    expect(document.body.textContent).toContain('/ year');
    expect(i18n.t('reports:feeAnalysis.assetsToOptimize', { count: 1 })).toBe('1 asset to optimise');
    expect(i18n.t('reports:feeAnalysis.assetsToOptimize', { count: 3 })).toBe('3 assets to optimise');
  });

  it('renders the whole page in French without English year suffixes', async () => {
    mockState.language = 'fr';
    await i18n.changeLanguage('fr');
    renderPage();

    screen.getByText('1 actif à optimiser');
    const text = document.body.textContent ?? '';
    expect(text).toContain('/ an');
    expect(text).not.toContain('asset to optimise');
    expect(text).not.toContain('/ year');
    expect(text).not.toContain('Global view');
  });
});

describe('etfFeeService security & URL encoding', () => {
  it('safely URL-encodes ETF symbols with special characters when constructing Yahoo Finance links', () => {
    const info = etfFeeService.getEtfInfo('CUSTOM TICKER?param=1#fragment');
    expect(info.yahooUrl).toBe('https://finance.yahoo.com/quote/CUSTOM%20TICKER%3Fparam%3D1%23fragment');

    const result = etfFeeService.analyzeEtfFees([
      {
        id: 'unsafe-1',
        instrument: 'Unsafe Symbol ETF',
        symbol: 'MAL/TRD?foo=bar#baz',
        quantity: 1,
        avgCost: 10,
        lastPrice: 10,
        marketValue: 1000,
        unrealizedPL: 0,
        unrealizedPLPercent: 0,
        currency: 'EUR',
        type: 'ETF',
      },
    ]);
    expect(result.recommendations).toHaveLength(1);
  });
});
