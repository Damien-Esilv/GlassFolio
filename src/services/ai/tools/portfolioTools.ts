import { AIToolDefinition } from '../types';
import { portfolioService } from '../../portfolioService';

export const getPortfolioSummaryTool: AIToolDefinition<
  { currency?: string },
  {
    totalValue: number;
    totalInvested: number;
    totalPL: number;
    totalPLPercent: number;
    currency: string;
    positionsCount: number;
  }
> = {
  name: 'get_portfolio_summary',
  description:
    'Get an overall financial summary of the user portfolio (net wealth, cost basis, unrealized profit/loss, and position count).',
  parameters: {
    type: 'object',
    properties: {
      currency: {
        type: 'string',
        description: 'Base currency for calculation, e.g. EUR, USD. Defaults to EUR.',
      },
    },
  },
  execute: async (params, context) => {
    const baseCurrency = params.currency || context.currency || 'EUR';
    const summary = await portfolioService.getDashboardSummary('1Y', baseCurrency);
    const positions = await portfolioService.getPositions();

    return {
      totalValue: summary.totalValue,
      totalInvested: summary.totalCost,
      totalPL: summary.totalPL,
      totalPLPercent: summary.plPercent,
      currency: baseCurrency,
      positionsCount: positions.length,
    };
  },
};

export const getAssetAllocationTool: AIToolDefinition<
  { currency?: string },
  Array<{ assetClass: string; value: number; percentage: number }>
> = {
  name: 'get_asset_allocation',
  description:
    'Get the asset allocation breakdown by asset class (Equity, Crypto, Cash, ETF, Real Estate) with values and percentages.',
  parameters: {
    type: 'object',
    properties: {
      currency: {
        type: 'string',
        description: 'Base currency, e.g. EUR, USD.',
      },
    },
  },
  execute: async (params, context) => {
    const baseCurrency = params.currency || context.currency || 'EUR';
    const positions = await portfolioService.getPositions();

    const allocationMap = new Map<string, number>();
    let total = 0;

    for (const pos of positions) {
      const cls = pos.type || 'Other';
      const val = pos.marketValue || 0;
      allocationMap.set(cls, (allocationMap.get(cls) || 0) + val);
      total += val;
    }

    const allocationList: Array<{ assetClass: string; value: number; percentage: number }> = [];
    for (const [assetClass, value] of allocationMap.entries()) {
      const percentage = total > 0 ? Math.round((value / total) * 10000) / 100 : 0;
      allocationList.push({
        assetClass,
        value: Math.round(value * 100) / 100,
        percentage,
      });
    }

    return allocationList.sort((a, b) => b.value - a.value);
  },
};
