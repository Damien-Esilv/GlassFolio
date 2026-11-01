import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { GoalCard } from '../../../src/components/GoalCard';
import { FinancialGoal } from '../../../src/types/domain';

vi.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      preferences: {
        language: 'en',
        currency: 'USD',
      },
    },
  }),
}));

vi.mock('../../../src/hooks/useEntranceAnimation', () => ({
  useEntranceAnimation: () => true,
}));

vi.mock('../../../src/components/AnimatedCounter', () => ({
  AnimatedCounter: ({ value, currency }: { value: number; currency: string }) => (
    <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)}</span>
  ),
  default: ({ value, currency }: { value: number; currency: string }) => (
    <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)}</span>
  ),
}));

vi.mock('../../../src/components/ui/AnimatedNumber', () => ({
  AnimatedNumber: ({ value }: { value: number }) => <span>{Math.round(value)}</span>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
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
    method: 'manual',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn().mockReturnValue(true);
  });

  it('renders goal details correctly', () => {
    render(<GoalCard goal={mockGoal} />);
    expect(screen.getByText('Buy a House')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('$25,000')).toBeInTheDocument();
    expect(screen.getByText('$100,000')).toBeInTheDocument();
  });

  it('renders different icon backgrounds based on color', () => {
    const colors = ['emerald', 'rose', 'orange', 'indigo', 'default_blue'];
    const expectedClasses = [
      'bg-accent-green/10',
      'bg-accent-rose/10',
      'bg-accent-orange/10',
      'bg-accent-indigo/10',
      'bg-accent-blue/10',
    ];

    colors.forEach((color, index) => {
      const customGoal = { ...mockGoal, color };
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
        { id: '2', type: 'asset', name: 'Asset 2', percentage: 50 },
      ],
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
      linkedAssets: [{ id: '1', type: 'asset', name: 'Asset 1', percentage: 50 }],
    };
    render(<GoalCard goal={dynamicGoal} showDetailTags={false} />);

    expect(screen.queryByText(/50% Asset 1/)).not.toBeInTheDocument();
  });

  it('calls action handlers when buttons are clicked', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onPin = vi.fn();

    const { container } = render(
      <GoalCard goal={mockGoal} onEdit={onEdit} onDelete={onDelete} onPin={onPin} />
    );

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(3);

    fireEvent.click(buttons[0]);
    expect(onPin).toHaveBeenCalledWith('1');

    fireEvent.click(buttons[1]);
    expect(onEdit).toHaveBeenCalledWith(mockGoal);

    fireEvent.click(buttons[2]);
    expect(window.confirm).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledWith('1');
  });

  it('handles goal with no current amount and caps progress at 100%', () => {
    const zeroAmountGoal = { ...mockGoal, currentAmount: undefined };
    const { rerender } = render(<GoalCard goal={zeroAmountGoal} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('$0')).toBeInTheDocument();

    const overachievedGoal = { ...mockGoal, currentAmount: 150000 };
    rerender(<GoalCard goal={overachievedGoal} />);
    expect(screen.getByText('100')).toBeInTheDocument();
  });
});
