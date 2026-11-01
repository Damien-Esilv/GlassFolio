import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AchievementBadge } from '../../../src/components/AchievementBadge';
import { Achievement } from '../../../src/types/domain';

vi.mock('../../../src/hooks/useEntranceAnimation', () => ({
  useEntranceAnimation: () => true,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'gamification:level') return 'Level';
      if (key === 'gamification:unpinBadge') return 'Unpin Badge';
      if (key === 'gamification:pinBadge') return 'Pin Badge';
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

  it('handles click and keyboard events without nested button conflicts', () => {
    const onClickMock = vi.fn();
    render(<AchievementBadge achievement={mockAchievement} onClick={onClickMock} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(onClickMock).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onClickMock).toHaveBeenCalledTimes(2);
  });

  it('renders pin button when onTogglePin is provided and stops propagation', () => {
    const onTogglePinMock = vi.fn();
    const onClickMock = vi.fn();
    render(
      <AchievementBadge
        achievement={mockAchievement}
        onClick={onClickMock}
        onTogglePin={onTogglePinMock}
        isPinned={false}
      />
    );

    const pinButton = screen.getByTitle('Pin Badge');
    expect(pinButton).toBeTruthy();

    fireEvent.click(pinButton);
    expect(onTogglePinMock).toHaveBeenCalledTimes(1);
    expect(onClickMock).not.toHaveBeenCalled();
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

  it('applies correct styling for unlocked and locked states', () => {
    const { container, rerender } = render(<AchievementBadge achievement={{ ...mockAchievement, unlocked: true }} />);
    let mainDiv = container.querySelector('.group > div');
    expect(mainDiv?.className).toContain('bg-card border-border hover:border-strong');

    rerender(<AchievementBadge achievement={{ ...mockAchievement, unlocked: false }} />);
    mainDiv = container.querySelector('.group > div');
    expect(mainDiv?.className).toContain('bg-subtle/40 border-subtle opacity-70');
  });
});
