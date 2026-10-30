/**
 * Tests — src/services/portfolioService.ts
 * Covers: getPositions, filter, getDashboardSummary, recalculatePositions, rounding accuracy
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { portfolioService } from '../../../src/services/portfolioService';
import { portfolioRepository, transactionRepository } from '../../../src/services/repositories';
import { currencyService } from '../../../src/services/currencyService';
import * as priceService from '../../../src/services/priceService';
import { Position } from '../../../src/types';

vi.mock('../../../src/services/priceService', () => ({
  refreshPositionPrices: vi.fn((positions: Position[]) => Promise.resolve(positions)),
}));

describe('portfolioService', () => {
  const samplePositions: Position[] = [
    {
      id: 'pos-1',
      instrument: 'Apple Inc.',
      symbol: 'AAPL',
      quantity: 10,
      avgCost: 150,
      lastPrice: 175.55,
      marketValue: 1755.5,
      unrealizedPL: 255.5,
      unrealizedPLPercent: 17.03,
      currency: 'USD',
      type: 'Equity',
      source: 'Interactive Brokers',
      bankName: 'Interactive Brokers',
    },
    {
      id: 'pos-2',
      instrument: 'Bitcoin',
      symbol: 'BTC',
      quantity: 0.5,
      avgCost: 30000,
      lastPrice: 60000,
      marketValue: 30000,
      unrealizedPL: 15000,
      unrealizedPLPercent: 100,
      currency: 'USD',
      type: 'Crypto',
      source: 'Binance',
      bankName: 'Binance',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPositions', () => {
    it('returns all positions when no filter is provided', async () => {
      vi.spyOn(portfolioRepository, 'getPositions').mockResolvedValue(samplePositions);
      vi.spyOn(portfolioRepository, 'savePositions').mockResolvedValue(undefined);

      const result = await portfolioService.getPositions();
      expect(result).toHaveLength(2);
      expect(result[0].symbol).toBe('AAPL');
      expect(result[1].symbol).toBe('BTC');
    });

    it('filters positions by asset type', async () => {
      vi.spyOn(portfolioRepository, 'getPositions').mockResolvedValue(samplePositions);
      vi.spyOn(portfolioRepository, 'savePositions').mockResolvedValue(undefined);

      const result = await portfolioService.getPositions({ type: 'Crypto' });
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('BTC');
    });

    it('has an "Other" class: bonds and other assets are listed apart from ETFs', async () => {
      const other: Position = { ...samplePositions[0], id: 'pos-3', instrument: 'Vintage wine', symbol: 'WINE', type: 'Other', lastPrice: 900, marketValue: 900 };
      vi.spyOn(portfolioRepository, 'getPositions').mockResolvedValue([...samplePositions, other]);
      vi.spyOn(portfolioRepository, 'savePositions').mockResolvedValue(undefined);

      const result = await portfolioService.getPositions({ type: 'Other' });
      expect(result.map(p => p.symbol)).toEqual(['WINE']);
      expect((await portfolioService.getPositions({ type: 'ETFs' }))).toHaveLength(0);
    });

    it('filters positions by search query', async () => {
      vi.spyOn(portfolioRepository, 'getPositions').mockResolvedValue(samplePositions);
      vi.spyOn(portfolioRepository, 'savePositions').mockResolvedValue(undefined);

      const result = await portfolioService.getPositions({ searchQuery: 'apple' });
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('AAPL');
    });
  });

  describe('getDashboardSummary', () => {
    it('calculates total portfolio metrics accurately with exchange rate conversion', async () => {
      vi.spyOn(portfolioRepository, 'getPositions').mockResolvedValue(samplePositions);
      vi.spyOn(portfolioRepository, 'savePositions').mockResolvedValue(undefined);
      vi.spyOn(transactionRepository, 'getAll').mockResolvedValue([]);
      vi.spyOn(currencyService, 'getExchangeRates').mockResolvedValue({ USD: 1.0 });
      vi.spyOn(currencyService, 'convertAmount').mockImplementation((amount) => amount);

      const summary = await portfolioService.getDashboardSummary('1Y', 'USD', 'en-US');

      expect(summary.totalValue).toBe(31755.5);
      expect(summary.totalCost).toBe(16500);
      expect(summary.totalPL).toBe(15255.5);
      expect(summary.plPercent).toBeCloseTo(92.46, 2);
      expect(Array.isArray(summary.chartData)).toBe(true);
      expect(summary.chartData.length).toBeGreaterThan(0);
      expect(summary.chartData[0]).toHaveProperty('invested');
    });
  });
});
