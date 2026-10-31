import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../../src/i18n';
import Progress from '../../../src/pages/Progress';
import { ANIMATION_DURATION_MS, ENTRANCE_DELAY_MS, MAX_STAGGER_STEPS, STAGGER_DELAY_MS } from '../../../src/constants/animations';

const mockData = vi.hoisted(() => {
  const level = (n: number) => ({ level: n, targetValue: n * 10, xpReward: 50, description: 'd' });
  return {
  goals: [{ id: 'g1', title: 'Goal one', targetAmount: 1000, currentAmount: 250, iconType: 'home', color: 'blue', isPinned: false, linkedAssets: [] }],
  positions: [],
  achievements: [
    { id: 'a1', title: 'First', category: 'discipline', conditionType: 'transaction_count', levels: [level(1), level(2)], currentLevel: 1, currentValue: 12, unlocked: true, badgeKey: 'b', iconType: 'trophy', color: 'blue' },
    { id: 'a2', title: 'Second', category: 'wealth', conditionType: 'total_value', levels: [level(1)], currentLevel: 0, currentValue: 0, unlocked: false, badgeKey: 'b', iconType: 'wallet', color: 'green' },
  ],
  assetGroups: [],
  quests: [{ id: 'q1', titleKey: 'q.one', descriptionKey: 'q.desc', rewardXp: 100, frequency: 'monthly', completed: false, progress: 2, target: 5 }],
  pinnedBadges: ['a1'],
  transactions: [],
  xpEvents: [],
  };
});

vi.mock('../../../src/context/DataContext', () => ({
  useData: () => ({
    ...mockData,
    saveGoal: vi.fn(), deleteGoal: vi.fn(), toggleGoalPin: vi.fn(), addAssetGroup: vi.fn(), updateAssetGroup: vi.fn(),
    togglePinBadge: vi.fn(), claimQuest: vi.fn(),
  }),
}));
vi.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u', xp: 2150, level: 4, preferences: { language: 'en', currency: 'EUR' } } }),
}));

const settle = async (ms = ENTRANCE_DELAY_MS + MAX_STAGGER_STEPS * STAGGER_DELAY_MS + ANIMATION_DURATION_MS + 100): Promise<void> => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};

/** The cards of a tab: elements that fade and grow in with the common clock. */
const revealed = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>('div.transition-all')).filter(el => el.style.transitionDuration === `${ANIMATION_DURATION_MS}ms` && el.style.opacity !== '');

const renderTab = (tab: string) =>
  render(<MemoryRouter initialEntries={[`/progress?tab=${tab}`]}><Progress /></MemoryRouter>);

describe('Progress tabs all animate with the common clock', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  });
  afterEach(() => vi.useRealTimers());

  it.each(['goals', 'achievements', 'quests', 'ranks', 'stats'])('%s: cards render immediately without fade-in', async tab => {
    const { container } = renderTab(tab);
    // Cards must NOT start hidden with opacity: 0
    const hiddenCards = Array.from(container.querySelectorAll<HTMLElement>('div')).filter(el => el.style.opacity === '0');
    expect(hiddenCards.length).toBe(0);
  });

  it('no longer uses the fixed-duration CSS entrance classes', async () => {
    for (const tab of ['goals', 'achievements']) {
      const { container, unmount } = renderTab(tab);
      await settle();
      expect(container.querySelector('.animate-scale-up')).toBeNull();
      unmount();
    }
  });

  it('counts the level and XP up in the header', async () => {
    const { container } = renderTab('goals');
    const hidden = () => Array.from(container.querySelectorAll('[aria-hidden="true"]')).map(el => el.textContent);
    expect(hidden()).toContain('0');
    await settle();
    expect(hidden()).toEqual(expect.arrayContaining(['4', '2,150']));
  });

  it('the quests, which were not animated, count their progress and grow their bar', async () => {
    const { container } = renderTab('quests');
    const bar = () => container.querySelector<HTMLElement>('div.h-full.transition-all[style*="width"]')!;
    expect(bar().style.width).toBe('0%');
    await settle();
    expect(bar().style.width).toBe('40%'); // 2 of 5
    expect(bar().style.transitionDuration).toBe(`${ANIMATION_DURATION_MS}ms`);
  });

  it('goal modal opens instantly without fade-in animation', async () => {
    render(<MemoryRouter initialEntries={['/progress?tab=goals&action=new']}><Progress /></MemoryRouter>);
    const backdrop = document.querySelector('.fixed.inset-0.z-\\[100000\\]');
    expect(backdrop).not.toBeNull();
    expect(backdrop?.classList.contains('animate-fade-in')).toBe(false);
  });

  it('achievement modal opens instantly without fade-in animation', async () => {
    render(<MemoryRouter initialEntries={['/progress?tab=achievements&openId=a1']}><Progress /></MemoryRouter>);
    const backdrop = document.querySelector('.fixed.inset-0.z-\\[100000\\]');
    expect(backdrop).not.toBeNull();
    expect(backdrop?.classList.contains('animate-fade-in')).toBe(false);
  });
});
