import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DeclarationAssistant from '../../../src/pages/DeclarationAssistant';
import TaxOptimization from '../../../src/pages/TaxOptimization';
import Settings from '../../../src/pages/Settings';
import { taxService } from '../../../src/services/fiscal/taxService';
import type { TaxSummaryResult } from '../../../src/types/types.backend';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'fr' },
  }),
}));

const mockAuthUser = {
  id: 'test-user',
  email: 'test@example.com',
  name: 'Test User',
  level: 4,
  xp: 1200,
  preferences: {
    language: 'fr',
    currency: 'EUR',
    fiscalProfile: {
      taxResidenceCountries: ['FR'],
      familyStatus: 'single',
      fiscalShares: 1,
    },
  },
};

vi.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    updateProfile: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('../../../src/context/DataContext', () => ({
  useData: () => ({
    transactions: [],
    positions: [],
    alerts: [],
    goals: [],
    achievements: [],
    xpEvents: [],
    isLoading: false,
    refreshData: vi.fn(),
  }),
}));

describe('Animation & Display Harmonization', () => {
  const dummyTaxSummary: TaxSummaryResult = {
    fiscalYear: '2024',
    dataQuality: { totalEvents: 1, determinedCount: 1, estimatedCount: 0, insufficientCount: 0, complexCount: 0, missingDataSummary: [] },
    cto: { totalGains: 1000, totalLosses: 200, netResult: 800, lossCarryforward: 0, lossesApplied: 0, remainingCarryforward: 0, events: [] },
    income: { totalDividends: 300, totalInterest: 0, totalCoupons: 0, withholdingTaxPaid: 0, events: [] },
    pea: { withdrawals: [], taxableGain: 0, incomeTax: 0, socialContributions: 0 },
    crypto: { totalCessions: 500, totalGains: 100, totalLosses: 0, netResult: 100, exceedsThreshold: false, thresholdAmount: 305, events: [] },
    foreignAccounts: [],
    formMappings: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DeclarationAssistant', () => {
    it('uses animate-slide-in-left on StatCards without parent animate-fade-in', () => {
      vi.spyOn(taxService, 'getCachedTaxSummary').mockReturnValue(dummyTaxSummary);

      const { container } = render(
        <MemoryRouter>
          <DeclarationAssistant />
        </MemoryRouter>
      );

      // Root container does not have animate-fade-in
      const rootDiv = container.firstElementChild as HTMLElement;
      expect(rootDiv.className).not.toContain('animate-fade-in');

      // StatCards use animate-slide-in-left with staggered animation delays
      const statCards = container.querySelectorAll('.animate-slide-in-left');
      expect(statCards.length).toBeGreaterThan(0);
    });
  });

  describe('TaxOptimization', () => {
    it('uses animate-slide-in-left cards like TaxHub and does not wrap in animate-fade-in', () => {
      vi.spyOn(taxService, 'getCachedTaxSummary').mockReturnValue(dummyTaxSummary);
      vi.spyOn(taxService, 'comparePFUvsBareme').mockResolvedValue({
        pfuTotal: 300,
        baremeTotal: 350,
        recommendation: 'PFU',
        confidence: 'determined',
      });
      vi.spyOn(taxService, 'getOptimizationSuggestions').mockResolvedValue([]);

      const { container } = render(
        <MemoryRouter>
          <TaxOptimization />
        </MemoryRouter>
      );

      // Root container does not have animate-fade-in
      const rootDiv = container.firstElementChild as HTMLElement;
      expect(rootDiv.className).not.toContain('animate-fade-in');

      // Components use animate-slide-in-left
      const animatedCards = container.querySelectorAll('.animate-slide-in-left');
      expect(animatedCards.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Settings', () => {
    it('renders tabs instantly without animate-fade-in on tab containers', () => {
      const { container } = render(
        <MemoryRouter>
          <Settings />
        </MemoryRouter>
      );

      // Main content area does not contain animate-fade-in for tab panels
      const animatedFadeIn = container.querySelectorAll('.animate-fade-in');
      expect(animatedFadeIn.length).toBe(0);
    });
  });
});
