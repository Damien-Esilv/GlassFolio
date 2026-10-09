import { AIToolDefinition } from '../types';
import { portfolioService } from '../../portfolioService';

export const listPositionsTool: AIToolDefinition<
  { type?: string; searchQuery?: string },
  Array<{
    symbol: string;
    instrument: string;
    type: string;
    quantity: number;
    avgCost: number;
    lastPrice: number;
    marketValue: number;
    unrealizedPL: number;
    unrealizedPLPercent: number;
    currency: string;
  }>
> = {
  name: 'list_positions',
  description:
    'List user asset holdings and positions with quantities, average cost (PRU), current price, market value, and unrealized gains.',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Filter by asset class: All, Equity, Crypto, Cash, ETF',
      },
      searchQuery: {
        type: 'string',
        description: 'Filter by ticker symbol or instrument name',
      },
    },
  },
  execute: async (params) => {
    const filter = {
      type: params.type || 'All',
      searchQuery: params.searchQuery || '',
    };
    const positions = await portfolioService.getPositions(filter);

    return positions.map((p) => ({
      symbol: p.symbol,
      instrument: p.instrument,
      type: String(p.type),
      quantity: p.quantity,
      avgCost: p.avgCost,
      lastPrice: p.lastPrice,
      marketValue: p.marketValue,
      unrealizedPL: p.unrealizedPL,
      unrealizedPLPercent: p.unrealizedPLPercent,
      currency: p.currency,
    }));
  },
};
