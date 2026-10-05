import { describe, it, expect, beforeEach } from 'vitest';
import {
  LocalStorageTransactionRepository,
  LocalStoragePortfolioRepository,
  LocalStorageGoalRepository,
  transactionRepository,
  portfolioRepository,
  goalRepository,
  setRepositoryBackend,
} from '../../../../src/services/repositories';
import {
  safeParseTransaction,
  safeParseGoal,
  safeParsePosition,
} from '../../../../src/types/schemas';
import { db } from '../../../../src/services/db';
import { Transaction, Position, FinancialGoal } from '../../../../src/types/domain';

describe('LocalStorageTransactionRepository', () => {
  const repo = new LocalStorageTransactionRepository();

  beforeEach(() => {
    localStorage.clear();
  });

  it('retrieves all transactions from db', async () => {
    const list = await repo.getAll();
    expect(Array.isArray(list)).toBe(true);
  });

  it('adds and retrieves a transaction by id', async () => {
    const tx: Transaction = {
      id: 'tx-repo-1',
      date: '2026-01-15T10:00:00Z',
      type: 'Buy',
      instrument: 'Air Liquide',
      symbol: 'AI.PA',
      amount: 10,
      price: 180,
      total: 1800,
      currency: 'EUR',
      source: 'Manual',
      fees: 2,
      status: 'Completed',
    };

    await repo.add(tx);
    const found = await repo.getById('tx-repo-1');
    expect(found).not.toBeNull();
    expect(found?.symbol).toBe('AI.PA');
  });

  it('deletes a transaction by id', async () => {
    const tx: Transaction = {
      id: 'tx-del-1',
      date: '2026-01-15T10:00:00Z',
      type: 'Buy',
      instrument: 'Apple',
      symbol: 'AAPL',
      amount: 5,
      price: 200,
      total: 1000,
      currency: 'USD',
      source: 'Manual',
      fees: 0,
      status: 'Completed',
    };

    await repo.add(tx);
    const deleted = await repo.delete('tx-del-1');
    expect(deleted).toBe(true);
    const found = await repo.getById('tx-del-1');
    expect(found).toBeNull();
  });
});

describe('LocalStoragePortfolioRepository', () => {
  const repo = new LocalStoragePortfolioRepository();

  it('gets and updates positions', async () => {
    const pos: Position = {
      id: 'pos-1',
      instrument: 'TotalEnergies',
      symbol: 'TTE.PA',
      quantity: 50,
      avgCost: 60,
      lastPrice: 65,
      marketValue: 3250,
      unrealizedPL: 250,
      unrealizedPLPercent: 8.33,
      currency: 'EUR',
      type: 'Equity',
    };

    await repo.savePositions([pos]);
    const list = await repo.getPositions();
    expect(list.some(p => p.id === 'pos-1')).toBe(true);

    const updated = await repo.updatePosition('pos-1', { lastPrice: 70 });
    expect(updated?.lastPrice).toBe(70);
  });
});

describe('LocalStorageGoalRepository', () => {
  const repo = new LocalStorageGoalRepository();

  it('saves and deletes goals', async () => {
    const goal: FinancialGoal = {
      id: 'goal-repo-1',
      title: 'Voyage Japon',
      targetAmount: 4000,
      isPinned: true,
      iconType: 'plane',
      color: 'emerald',
      method: 'manual',
    };

    await repo.saveGoals([goal]);
    const goals = await repo.getGoals();
    expect(goals.some(g => g.id === 'goal-repo-1')).toBe(true);

    await repo.deleteGoal('goal-repo-1');
    const afterDelete = await repo.getGoals();
    expect(afterDelete.some(g => g.id === 'goal-repo-1')).toBe(false);
  });
});

describe('Zod Validation Schemas', () => {
  it('validates valid transaction correctly', () => {
    const result = safeParseTransaction({
      id: 'valid-tx',
      date: '2026-03-01T08:00:00Z',
      type: 'Buy',
      instrument: 'LVMH',
      symbol: 'MC.PA',
      amount: 2,
      price: 800,
      total: 1600,
      currency: 'EUR',
      source: 'BoursoBank',
      fees: 5,
      status: 'Completed',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid transaction with missing or invalid fields', () => {
    const result = safeParseTransaction({
      id: '',
      type: 'InvalidType',
      amount: 'not-a-number',
    });
    expect(result.success).toBe(false);
  });

  it('validates financial goal with proper constraints', () => {
    const result = safeParseGoal({
      id: 'goal-val-1',
      title: 'Emergency Fund',
      targetAmount: 10000,
      iconType: 'emergency',
      color: 'blue',
      method: 'manual',
    });
    expect(result.success).toBe(true);
  });
});

describe('Repository Singleton Wrappers & setRepositoryBackend', () => {
  it('delegates calls to active repositories', async () => {
    const txList = await transactionRepository.getAll();
    expect(Array.isArray(txList)).toBe(true);

    const positions = await portfolioRepository.getPositions();
    expect(Array.isArray(positions)).toBe(true);

    const goals = await goalRepository.getGoals();
    expect(Array.isArray(goals)).toBe(true);
  });

  it('allows swapping repository backend dynamically', async () => {
    const mockTxRepo = {
      getAll: async () => [{ id: 'mock-1', date: '2026-01-01', type: 'Buy', amount: 1, price: 10, total: 10, currency: 'EUR', source: 'Mock', fees: 0, status: 'Completed' } as any],
      getById: async () => null,
      save: async () => {},
      add: async () => ({} as any),
      delete: async () => true,
    };

    setRepositoryBackend({ transactions: mockTxRepo });
    const items = await transactionRepository.getAll();
    expect(items.length).toBe(1);
    expect(items[0].id).toBe('mock-1');

    // Restore default
    setRepositoryBackend({ transactions: new LocalStorageTransactionRepository() });
  });
});

