import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AchievementBadge } from '../../../components/AchievementBadge';
import { Achievement } from '../../../src/types/domain';

// Mock translation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
        if(key === 'gamification:level') return 'Level';
        if(key === 'gamification:unpinBadge') return 'Unpin Badge';
        if(key === 'gamification:pinBadge') return 'Pin Badge';
        return key;
    },
  }),
}));

const mockAchievement: Achievement = {
  id: 'ach_1',
  title: 'First Investment',
  iconType: 'rocket',
  conditionType: 'transaction_count',
  currentValue: 50,
  currentLevel: 1,
  unlocked: true,
  color: 'indigo',
  levels: [
    { level: 1, targetValue: 0, xpReward: 10, description: 'Bronze' },
    { level: 2, targetValue: 100, xpReward: 20, description: 'Silver' },
  ],
};

describe('<AchievementBadge />', () => {
  it('renders achievement title and level correctly', () => {
    render(<AchievementBadge achievement={mockAchievement} />);

    expect(screen.getByText('First Investment')).toBeTruthy();
    expect(screen.getByText('Level 1')).toBeTruthy();
  });

  it('renders progress correctly based on currentValue and targets', () => {
    const { container } = render(<AchievementBadge achievement={mockAchievement} />);

    // progress is (50 - 0) / (100 - 0) = 50%
    const progressBar = container.querySelector('.bg-accent-indigo');
    expect(progressBar).toBeTruthy();
    expect(progressBar?.getAttribute('style')).toContain('width: 50%');
  });

  it('renders 100% progress if there is no next level', () => {
    const maxAchievement = { ...mockAchievement, currentLevel: 2, currentValue: 150 };
    const { container } = render(<AchievementBadge achievement={maxAchievement} />);

    const progressBar = container.querySelector('.bg-accent-indigo');
    expect(progressBar).toBeTruthy();
    expect(progressBar?.getAttribute('style')).toContain('width: 100%');
  });

  it('handles click events', () => {
    const onClickMock = vi.fn();
    render(<AchievementBadge achievement={mockAchievement} onClick={onClickMock} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(onClickMock).toHaveBeenCalledTimes(1);
  });

  it('renders pin button when onTogglePin is provided', () => {
    const onTogglePinMock = vi.fn();
    render(
        <AchievementBadge
            achievement={mockAchievement}
            onTogglePin={onTogglePinMock}
            isPinned={false}
        />
    );

    const pinButton = screen.getByTitle('Pin Badge');
    expect(pinButton).toBeTruthy();

    fireEvent.click(pinButton);
    expect(onTogglePinMock).toHaveBeenCalledTimes(1);
  });

  it('shows Unpin Badge tooltip when isPinned is true', () => {
    const onTogglePinMock = vi.fn();
    render(
        <AchievementBadge
            achievement={mockAchievement}
            onTogglePin={onTogglePinMock}
            isPinned={true}
        />
    );

    expect(screen.getByTitle('Unpin Badge')).toBeTruthy();
  });

  it('applies correct styling for unlocked state', () => {
    const unlockedAchievement = { ...mockAchievement, unlocked: true };
    const { container } = render(<AchievementBadge achievement={unlockedAchievement} />);
    // The main container div is the first child of the wrapper
    const mainDiv = container.querySelector('.group > div');
    expect(mainDiv?.className).toContain('bg-card border-border hover:border-strong');
  });

  it('applies correct styling for locked state', () => {
    const lockedAchievement = { ...mockAchievement, unlocked: false };
    const { container } = render(<AchievementBadge achievement={lockedAchievement} />);
    const mainDiv = container.querySelector('.group > div');
    expect(mainDiv?.className).toContain('bg-subtle/40 border-subtle opacity-70');
  });
});
