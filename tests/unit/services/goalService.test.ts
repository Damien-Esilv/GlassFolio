/**
 * Tests — goalService.ts
 * Covers: getGoals (manual mode), saveGoal (create + update), deleteGoal,
 *         toggleGoalPin, getAssetGroups, saveAssetGroup, updateAssetGroup, deleteAssetGroup
 *
 * Strategy:
 *  - Mock db.ts (localStorage abstraction) to avoid side effects
 *  - Mock currencyService.getExchangeRates / convertAmount to test goal logic in isolation
 *  - Verify the service layer contract: calls delay(), persists data via db, returns updated state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FinancialGoal, AssetGroup } from '../../../types';

// ── Mocks ─────────────────────────────────────────────────────────────────────
// We mock at the module level BEFORE importing goalService so the service uses mocked versions.

vi.mock('../../../src/services/db', () => ({
  db: {
    getGoals: vi.fn(),
    saveGoals: vi.fn(),
    getPositions: vi.fn(),
    getAssetGroups: vi.fn(),
    saveAssetGroups: vi.fn(),
  },
  delay: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/services/currencyService', () => ({
  currencyService: {
    getExchangeRates: vi.fn().mockResolvedValue({ EUR: 1, USD: 1 }),
    convertAmount: vi.fn().mockImplementation((amount: number) => amount),
  },
}));

vi.mock('../../../src/constants/assetClasses', () => ({
  isAssetClassMatch: vi.fn().mockReturnValue(false),
}));

// Import AFTER mocks are set up
import { goalService } from '../../../src/services/goalService';
import { db } from '../../../src/services/db';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const makeGoal = (overrides: Partial<FinancialGoal> = {}): FinancialGoal => ({
  id: 'goal-1',
  title: 'Emergency Fund',
  targetAmount: 10000,
  currentAmount: 0,
  iconType: 'emergency',
  color: 'blue',
  method: 'manual',
  manualAmount: 5000,
  isPinned: false,
  linkedAssets: [],
  ...overrides,
});

const makeGroup = (overrides: Partial<AssetGroup> = {}): AssetGroup => ({
  id: 'group-1',
  name: 'Tech Portfolio',
  symbols: ['AAPL', 'MSFT'],
  color: 'blue',
  ...overrides,
});

// ── Test Suites ───────────────────────────────────────────────────────────────

describe('goalService.getGoals', () => {
  beforeEach(() => {
    vi.mocked(db.getGoals).mockReturnValue([makeGoal()]);
    vi.mocked(db.getPositions).mockReturnValue([]);
    vi.mocked(db.getAssetGroups).mockReturnValue([]);
  });

  it('returns goals with currentAmount computed from manualAmount in manual mode', async () => {
    const goals = await goalService.getGoals('EUR');
    expect(goals).toHaveLength(1);
    expect(goals[0].currentAmount).toBe(5000);
  });

  it('returns empty array when no goals exist', async () => {
    vi.mocked(db.getGoals).mockReturnValue([]);
    const goals = await goalService.getGoals('EUR');
    expect(goals).toHaveLength(0);
  });

  it('calls delay() to simulate latency', async () => {
    const { delay } = await import('../../../src/services/db');
    await goalService.getGoals('EUR');
    expect(delay).toHaveBeenCalled();
  });

  it('never returns goals with undefined currentAmount', async () => {
    vi.mocked(db.getGoals).mockReturnValue([
      makeGoal({ method: 'manual', manualAmount: undefined }),
    ]);
    const goals = await goalService.getGoals('EUR');
    expect(goals[0].currentAmount).toBeDefined();
    expect(typeof goals[0].currentAmount).toBe('number');
  });
});

describe('goalService.saveGoal (create)', () => {
  beforeEach(() => {
    vi.mocked(db.getGoals).mockReturnValue([]);
    vi.mocked(db.getPositions).mockReturnValue([]);
    vi.mocked(db.getAssetGroups).mockReturnValue([]);
  });

  it('creates a new goal with a generated id', async () => {
    const { id: _removed, ...newGoalData } = makeGoal();
    await goalService.saveGoal(newGoalData as Omit<FinancialGoal, 'id'>);
    expect(db.saveGoals).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Emergency Fund', id: expect.any(String) }),
      ])
    );
  });

  it('assigns isPinned: false and currentAmount: 0 to new goals', async () => {
    const { id: _removed, ...newGoalData } = makeGoal();
    await goalService.saveGoal(newGoalData as Omit<FinancialGoal, 'id'>);
    const saved = vi.mocked(db.saveGoals).mock.calls[0][0];
    expect(saved[0].isPinned).toBe(false);
    expect(saved[0].currentAmount).toBe(0);
  });
});

describe('goalService.saveGoal (update)', () => {
  beforeEach(() => {
    const existing = makeGoal({ id: 'goal-1', title: 'Old Name' });
    vi.mocked(db.getGoals).mockReturnValue([existing]);
    vi.mocked(db.getPositions).mockReturnValue([]);
    vi.mocked(db.getAssetGroups).mockReturnValue([]);
  });

  it('updates existing goal by id', async () => {
    await goalService.saveGoal(makeGoal({ id: 'goal-1', title: 'New Name' }));
    const saved = vi.mocked(db.saveGoals).mock.calls[0][0];
    const updated = saved.find((g: FinancialGoal) => g.id === 'goal-1');
    expect(updated?.title).toBe('New Name');
  });

  it('does not create a duplicate when updating', async () => {
    await goalService.saveGoal(makeGoal({ id: 'goal-1', title: 'Updated' }));
    const saved = vi.mocked(db.saveGoals).mock.calls[0][0];
    expect(saved.filter((g: FinancialGoal) => g.id === 'goal-1')).toHaveLength(1);
  });
});

describe('goalService.deleteGoal', () => {
  beforeEach(() => {
    vi.mocked(db.getGoals).mockReturnValue([
      makeGoal({ id: 'goal-1' }),
      makeGoal({ id: 'goal-2', title: 'Goal 2' }),
    ]);
  });

  it('removes the goal with the given id', async () => {
    await goalService.deleteGoal('goal-1');
    const saved = vi.mocked(db.saveGoals).mock.calls[0][0];
    expect(saved.some((g: FinancialGoal) => g.id === 'goal-1')).toBe(false);
  });

  it('keeps other goals intact', async () => {
    await goalService.deleteGoal('goal-1');
    const saved = vi.mocked(db.saveGoals).mock.calls[0][0];
    expect(saved.some((g: FinancialGoal) => g.id === 'goal-2')).toBe(true);
  });

  it('is a no-op when id does not exist', async () => {
    const original = [makeGoal()];
    vi.mocked(db.getGoals).mockReturnValue(original);
    await goalService.deleteGoal('nonexistent');
    const saved = vi.mocked(db.saveGoals).mock.calls[0][0];
    expect(saved).toHaveLength(1);
  });
});

describe('goalService.toggleGoalPin', () => {
  beforeEach(() => {
    vi.mocked(db.getGoals).mockReturnValue([makeGoal({ id: 'goal-1', isPinned: false })]);
  });

  it('toggles isPinned from false to true', async () => {
    await goalService.toggleGoalPin('goal-1');
    const saved = vi.mocked(db.saveGoals).mock.calls[0][0];
    const goal = saved.find((g: FinancialGoal) => g.id === 'goal-1');
    expect(goal?.isPinned).toBe(true);
  });

  it('toggles isPinned from true to false', async () => {
    vi.mocked(db.getGoals).mockReturnValue([makeGoal({ id: 'goal-1', isPinned: true })]);
    await goalService.toggleGoalPin('goal-1');
    const saved = vi.mocked(db.saveGoals).mock.calls[0][0];
    const goal = saved.find((g: FinancialGoal) => g.id === 'goal-1');
    expect(goal?.isPinned).toBe(false);
  });
});

describe('goalService.getAssetGroups', () => {
  it('returns all asset groups', async () => {
    vi.mocked(db.getAssetGroups).mockReturnValue([makeGroup()]);
    const groups = await goalService.getAssetGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('group-1');
  });

  it('returns empty array when no groups exist', async () => {
    vi.mocked(db.getAssetGroups).mockReturnValue([]);
    const groups = await goalService.getAssetGroups();
    expect(groups).toHaveLength(0);
  });
});

describe('goalService.saveAssetGroup', () => {
  it('appends a new group and persists it', async () => {
    vi.mocked(db.getAssetGroups).mockReturnValue([]);
    const group = makeGroup();
    await goalService.saveAssetGroup(group);
    expect(db.saveAssetGroups).toHaveBeenCalledWith([group]);
  });

  it('preserves existing groups', async () => {
    const existing = makeGroup({ id: 'group-0', name: 'Existing' });
    vi.mocked(db.getAssetGroups).mockReturnValue([existing]);
    const newGroup = makeGroup({ id: 'group-1' });
    await goalService.saveAssetGroup(newGroup);
    const saved = vi.mocked(db.saveAssetGroups).mock.calls[0][0];
    expect(saved).toHaveLength(2);
  });
});

describe('goalService.updateAssetGroup', () => {
  it('updates the matching group by id', async () => {
    vi.mocked(db.getAssetGroups).mockReturnValue([makeGroup({ id: 'group-1', name: 'Old' })]);
    await goalService.updateAssetGroup('group-1', { name: 'New Name' });
    const saved = vi.mocked(db.saveAssetGroups).mock.calls[0][0];
    expect(saved[0].name).toBe('New Name');
  });

  it('does not change other groups', async () => {
    vi.mocked(db.getAssetGroups).mockReturnValue([
      makeGroup({ id: 'group-1', name: 'Group A' }),
      makeGroup({ id: 'group-2', name: 'Group B' }),
    ]);
    await goalService.updateAssetGroup('group-1', { name: 'Group A Updated' });
    const saved = vi.mocked(db.saveAssetGroups).mock.calls[0][0];
    expect(saved.find((g: AssetGroup) => g.id === 'group-2')?.name).toBe('Group B');
  });
});

describe('goalService.deleteAssetGroup', () => {
  it('removes the group by id', async () => {
    vi.mocked(db.getAssetGroups).mockReturnValue([
      makeGroup({ id: 'group-1' }),
      makeGroup({ id: 'group-2', name: 'Other' }),
    ]);
    await goalService.deleteAssetGroup('group-1');
    const saved = vi.mocked(db.saveAssetGroups).mock.calls[0][0];
    expect(saved.some((g: AssetGroup) => g.id === 'group-1')).toBe(false);
  });

  it('returns the remaining groups', async () => {
    vi.mocked(db.getAssetGroups).mockReturnValue([makeGroup({ id: 'group-1' })]);
    const result = await goalService.deleteAssetGroup('group-1');
    expect(result).toHaveLength(0);
  });
});
