import { AIToolDefinition } from '../types';
import { transactionService } from '../../transactionService';
import { Transaction } from '../../../types/domain';
import { db } from '../../db';

export const listTransactionsTool: AIToolDefinition<
  { symbol?: string; type?: string; limit?: number },
  Array<{
    id: string;
    date: string;
    type: string;
    instrument: string;
    symbol: string;
    amount: number;
    price: number;
    total: number;
    currency: string;
  }>
> = {
  name: 'list_transactions',
  description:
    'List recent financial transactions with optional filtering by asset ticker or operation type (Buy, Sell, Deposit, Withdrawal).',
  parameters: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'Filter by asset ticker symbol, e.g. AAPL, BTC',
      },
      type: {
        type: 'string',
        enum: ['Buy', 'Sell', 'Deposit', 'Withdrawal'],
        description: 'Filter by transaction type',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of transactions to return (default 10)',
      },
    },
  },
  execute: async (params) => {
    const all = await transactionService.getTransactions();
    let filtered = all;

    if (params.symbol) {
      const sym = params.symbol.toUpperCase();
      filtered = filtered.filter((t) => t.symbol.toUpperCase() === sym);
    }

    if (params.type) {
      filtered = filtered.filter((t) => t.type.toLowerCase() === params.type?.toLowerCase());
    }

    const limit = params.limit && params.limit > 0 ? params.limit : 10;
    return filtered.slice(0, limit).map((t) => ({
      id: t.id,
      date: t.date,
      type: t.type,
      instrument: t.instrument,
      symbol: t.symbol,
      amount: t.amount,
      price: t.price,
      total: t.total,
      currency: t.currency,
    }));
  },
};

export const recordTransactionTool: AIToolDefinition<
  {
    instrument: string;
    symbol: string;
    type: 'Buy' | 'Sell' | 'Deposit' | 'Withdrawal';
    amount: number;
    price: number;
    currency?: string;
    date?: string;
    fees?: number;
    account?: string;
  },
  { success: boolean; transactionId?: string; message?: string; error?: string }
> = {
  name: 'record_transaction',
  description:
    'Record a new financial transaction (Buy, Sell, Deposit, Withdrawal). Requires explicit human confirmation before execution.',
  requiresConfirmation: true,
  parameters: {
    type: 'object',
    properties: {
      instrument: {
        type: 'string',
        description: 'Asset name, e.g. Apple Inc, Bitcoin',
      },
      symbol: {
        type: 'string',
        description: 'Asset ticker symbol, e.g. AAPL, BTC',
      },
      type: {
        type: 'string',
        enum: ['Buy', 'Sell', 'Deposit', 'Withdrawal'],
        description: 'Operation type',
      },
      amount: {
        type: 'number',
        description: 'Quantity bought or sold',
      },
      price: {
        type: 'number',
        description: 'Unit price of the asset',
      },
      currency: {
        type: 'string',
        description: 'Currency code, defaults to EUR',
      },
      date: {
        type: 'string',
        description: 'Date in YYYY-MM-DD format (defaults to current date)',
      },
      fees: {
        type: 'number',
        description: 'Transaction fees if any (defaults to 0)',
      },
      account: {
        type: 'string',
        description: 'Name of the account it belongs to (defaults to an account in that currency, else the first one)',
      },
    },
    required: ['instrument', 'symbol', 'type', 'amount', 'price'],
  },
  execute: async (params, context) => {
    // The model may send anything: refuse it rather than record a negative or NaN trade
    const amount = Number(params.amount);
    const price = Number(params.price);
    const fees = params.fees === undefined ? 0 : Number(params.fees);
    if (!['Buy', 'Sell', 'Deposit', 'Withdrawal'].includes(params.type)) {
      return { success: false, error: `Unknown operation type "${String(params.type)}".` };
    }
    if (!Number.isFinite(amount) || amount <= 0) return { success: false, error: 'The quantity must be a positive number.' };
    if (!Number.isFinite(price) || price < 0) return { success: false, error: 'The unit price must be zero or a positive number.' };
    if (!Number.isFinite(fees) || fees < 0) return { success: false, error: 'The fees must be zero or a positive number.' };
    if (!params.symbol?.trim()) return { success: false, error: 'The asset symbol is required.' };
    const date = params.date || new Date().toISOString().split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}/.test(date) || Number.isNaN(new Date(date).getTime())) {
      return { success: false, error: 'The date must be in YYYY-MM-DD format.' };
    }
    if (new Date(date).getTime() > Date.now() + 24 * 3600 * 1000) {
      return { success: false, error: 'The date cannot be in the future.' };
    }
    if (params.account && !db.getAccounts().some(a => a.name.trim().toLowerCase() === params.account!.trim().toLowerCase())) {
      return { success: false, error: `No account is named "${params.account}".` };
    }

    const total = Math.round(amount * price * 100) / 100;
    const currency = (params.currency || context.currency || 'EUR').toUpperCase();
    const id = `tx-ai-${Date.now()}`;

    const newTx: Transaction = {
      id,
      date,
      type: params.type,
      instrument: params.instrument,
      symbol: params.symbol.trim().toUpperCase(),
      amount,
      price,
      total,
      currency,
      source: 'AI Assistant',
      fees,
      status: 'Completed',
      ...(params.account ? { accountName: params.account } : {}),
    };

    await transactionService.addTransactions([newTx]);

    return {
      success: true,
      transactionId: id,
      message: `Transaction of ${amount} ${params.symbol} successfully recorded.`,
    };
  },
};
