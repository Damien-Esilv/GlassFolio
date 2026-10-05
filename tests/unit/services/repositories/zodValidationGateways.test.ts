import { describe, it, expect, beforeEach } from 'vitest';
import {
  LocalStorageTransactionRepository,
  LocalStoragePortfolioRepository,
  LocalStorageGoalRepository,
} from '../../../../src/services/repositories';
import {
  safeParseTransaction,
  safeParsePosition,
  safeParseGoal,
  safeParseAssetGroup,
  repairTransaction,
  repairPosition,
  repairGoal,
  validateCSVRow,
} from '../../../../src/types/schemas';
import { sanitizeCSVRow, validateCSVHeaders } from '../../../../src/services/import/csvParser';
import { db } from '../../../../src/services/db';

describe('Zod Validation Gateways & Self-Healing Repositories', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('LocalStorageTransactionRepository Gateway', () => {
    const repo = new LocalStorageTransactionRepository();

    it('heals corrupted transaction with missing or invalid fields on getAll', async () => {
      // Intentionally insert corrupted transaction directly in db/localStorage
      const corruptedTx = [
        {
          id: 'corrupted-1',
          date: 'invalid-date-maybe',
          type: 'INVALID_TYPE',
          amount: 'not-a-number',
          price: NaN,
          total: undefined,
          currency: null,
        },
      ];
      db.saveTransactions(corruptedTx as any);

      const items = await repo.getAll();
      expect(items.length).toBe(1);
      const item = items[0];
      expect(item.id).toBe('corrupted-1');
      expect(item.type).toBe('Buy'); // Repaired fallback
      expect(item.amount).toBe(0);
      expect(item.price).toBe(0);
      expect(item.total).toBe(0);
      expect(item.currency).toBe('EUR');
    });

    it('sanitizes transactions before saving to storage', async () => {
      const dirty = [
        {
          id: 'tx-dirty',
          date: '2026-03-01',
          type: 'Sell' as const,
          instrument: 'Apple',
          symbol: 'AAPL',
          amount: 10,
          price: 150,
          total: 1500,
          currency: 'USD',
          source: 'Manual',
          fees: 0,
          status: 'Completed' as const,
        },
      ];
      await repo.save(dirty);
      const fetched = await repo.getById('tx-dirty');
      expect(fetched).not.toBeNull();
      expect(fetched?.symbol).toBe('AAPL');
    });
  });

  describe('LocalStoragePortfolioRepository Gateway', () => {
    const repo = new LocalStoragePortfolioRepository();

    it('heals corrupted position with NaN and missing strings on getPositions', async () => {
      const corruptedPos = [
        {
          id: 'corrupted-pos',
          instrument: null,
          symbol: '',
          quantity: NaN,
          avgCost: 100,
          lastPrice: null,
          marketValue: undefined,
          unrealizedPL: NaN,
          unrealizedPLPercent: NaN,
          currency: undefined,
          type: undefined,
        },
      ];
      db.savePositions(corruptedPos as any);

      const positions = await repo.getPositions();
      expect(positions.length).toBe(1);
      const pos = positions[0];
      expect(pos.id).toBe('corrupted-pos');
      expect(pos.quantity).toBe(0);
      expect(pos.avgCost).toBe(100);
      expect(pos.lastPrice).toBe(100); // defaults to avgCost
      expect(pos.currency).toBe('EUR');
      expect(pos.type).toBe('Equity');
      expect(Number.isFinite(pos.marketValue)).toBe(true);
      expect(Number.isFinite(pos.unrealizedPL)).toBe(true);
    });

    it('updates position safely through gateway', async () => {
      await repo.savePositions([
        {
          id: 'pos-1',
          instrument: 'Tesla',
          symbol: 'TSLA',
          quantity: 10,
          avgCost: 200,
          lastPrice: 200,
          marketValue: 2000,
          unrealizedPL: 0,
          unrealizedPLPercent: 0,
          currency: 'USD',
          type: 'Equity',
        },
      ]);

      const updated = await repo.updatePosition('pos-1', { lastPrice: 250, marketValue: 2500 });
      expect(updated?.lastPrice).toBe(250);
      expect(updated?.marketValue).toBe(2500);
    });
  });

  describe('LocalStorageGoalRepository Gateway', () => {
    const repo = new LocalStorageGoalRepository();

    it('heals corrupted financial goal and asset groups', async () => {
      const corruptedGoals = [
        {
          id: '',
          title: '',
          targetAmount: -500, // Invalid negative amount
          iconType: 'non-existing-icon',
          color: null,
          method: 'invalid-method',
        },
      ];
      db.saveGoals(corruptedGoals as any);

      const goals = await repo.getGoals();
      expect(goals.length).toBe(1);
      const g = goals[0];
      expect(g.title).toBe('Unnamed Goal');
      expect(g.targetAmount).toBe(1000); // Fallback positive
      expect(g.iconType).toBe('other');
      expect(g.method).toBe('manual');
    });

    it('heals and filters asset groups safely', async () => {
      const corruptedGroups = [
        { id: 'grp-1', name: 'Safe Assets', symbols: ['EUR', 'USD'] },
        { invalid: true }, // should be handled
      ];
      db.saveAssetGroups(corruptedGroups as any);

      const groups = await repo.getAssetGroups();
      expect(groups.length).toBe(1);
      expect(groups[0].name).toBe('Safe Assets');
    });
  });

  describe('CSV Row Sanitization & Headers Validation', () => {
    it('validates and trims raw CSV row object', () => {
      const rawRow = {
        Date: ' 2026-03-01 ',
        Amount: ' 1250.50 ',
        Symbol: ' AAPL ',
        EmptyField: null,
      };
      const result = sanitizeCSVRow(rawRow);
      expect(result.isValid).toBe(true);
      expect(result.sanitized['Date']).toBe('2026-03-01');
      expect(result.sanitized['Amount']).toBe('1250.50');
      expect(result.sanitized['Symbol']).toBe('AAPL');
      expect(result.sanitized['EmptyField']).toBe('');
    });

    it('validates CSV headers correctly', () => {
      expect(validateCSVHeaders(['Date', 'Amount', 'Symbol']).isValid).toBe(true);
      expect(validateCSVHeaders([]).isValid).toBe(false);
      expect(validateCSVHeaders(['   ', '']).isValid).toBe(false);
    });
  });
});
