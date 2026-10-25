import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GoalCard } from '../../../components/GoalCard';
import { FinancialGoal } from '../../../src/types';

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      preferences: {
        language: 'en',
        currency: 'USD'
      }
    }
  })
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}));

describe('GoalCard', () => {
  const mockGoal: FinancialGoal = {
    id: '1',
    title: 'Buy a House',
    targetAmount: 100000,
    currentAmount: 25000,
    isPinned: false,
    iconType: 'home',
    color: 'emerald',
    method: 'manual'
  };

  it('renders goal details correctly', () => {
    render(<GoalCard goal={mockGoal} />);
    expect(screen.getByText('Buy a House')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();

    // We expect formatting based on en-US and USD, so $25,000 and target: $100,000
    expect(screen.getByText('$25,000')).toBeInTheDocument();
    expect(screen.getByText('common:labels.target: $100,000')).toBeInTheDocument();
  });

  it('renders different icon backgrounds based on color', () => {
    const colors = ['emerald', 'rose', 'orange', 'indigo', 'default_blue'];
    const expectedClasses = [
      'bg-accent-green/10',
      'bg-accent-rose/10',
      'bg-accent-orange/10',
      'bg-accent-indigo/10',
      'bg-accent-blue/10'
    ];

    colors.forEach((color, index) => {
      const customGoal = { ...mockGoal, color: color };
      const { container } = render(<GoalCard goal={customGoal} />);
      const iconContainer = container.querySelector(`.${expectedClasses[index].replace('/', '\\/')}`);
      expect(iconContainer).toBeInTheDocument();
    });
  });

  it('renders dynamic goal specific tags when method is dynamic', () => {
    const dynamicGoal: FinancialGoal = {
      ...mockGoal,
      method: 'dynamic',
      linkedAssets: [
        { id: '1', type: 'asset', name: 'Asset 1', percentage: 50 },
        { id: '2', type: 'asset', name: 'Asset 2', percentage: 50 }
      ]
    };
    render(<GoalCard goal={dynamicGoal} showDetailTags={true} />);

    expect(screen.getByText('common:labels.autoTracking')).toBeInTheDocument();
    expect(screen.getByText(/50% Asset 1/)).toBeInTheDocument();
    expect(screen.getByText(/50% Asset 2/)).toBeInTheDocument();
  });

  it('does not render tags if showDetailTags is false', () => {
    const dynamicGoal: FinancialGoal = {
      ...mockGoal,
      method: 'dynamic',
      linkedAssets: [
        { id: '1', type: 'asset', name: 'Asset 1', percentage: 50 }
      ]
    };
    render(<GoalCard goal={dynamicGoal} showDetailTags={false} />);

    expect(screen.queryByText(/50% Asset 1/)).not.toBeInTheDocument();
  });

  it('calls action handlers when buttons are clicked', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onPin = vi.fn();

    const { container } = render(
      <GoalCard
        goal={mockGoal}
        onEdit={onEdit}
        onDelete={onDelete}
        onPin={onPin}
      />
    );

    // We need to query buttons by icon or class as they don't have text
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(3); // Pin, Edit, Delete

    // The order of buttons is Pin, Edit, Delete
    fireEvent.click(buttons[0]);
    expect(onPin).toHaveBeenCalledWith('1');

    fireEvent.click(buttons[1]);
    expect(onEdit).toHaveBeenCalledWith(mockGoal);

    fireEvent.click(buttons[2]);
    expect(onDelete).toHaveBeenCalledWith('1');
  });

  it('handles goal with no current amount', () => {
    const zeroAmountGoal = { ...mockGoal, currentAmount: undefined };
    render(<GoalCard goal={zeroAmountGoal} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('$0')).toBeInTheDocument();
  });

  it('caps progress at 100%', () => {
    const overachievedGoal = { ...mockGoal, currentAmount: 150000 };
    render(<GoalCard goal={overachievedGoal} />);

    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
