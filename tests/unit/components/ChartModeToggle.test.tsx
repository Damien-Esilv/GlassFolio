import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChartModeToggle from '../../../src/components/ui/ChartModeToggle';
import { DEFAULT_CHART_PRICE_MODE } from '../../../src/hooks/useChartPriceMode';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'dashboard:chartMode.label': 'Chart price mode',
        'dashboard:chartMode.simulated': 'Estimate',
        'dashboard:chartMode.simulatedHint': 'Display estimated values',
        'dashboard:chartMode.historical': 'Real prices',
        'dashboard:chartMode.historicalHint': 'Display historical closing prices',
      };
      return map[key] || key;
    },
  }),
}));

describe('ChartModeToggle & useChartPriceMode invariants', () => {
  it('defaults to simulated (Estimate) price mode', () => {
    expect(DEFAULT_CHART_PRICE_MODE).toBe('simulated');
  });

  it('renders Estimate on the left (first) and Real prices on the right (second)', () => {
    const handleChange = vi.fn();
    render(<ChartModeToggle mode="simulated" onChange={handleChange} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);

    // Left button = Estimate
    expect(buttons[0].textContent).toContain('Estimate');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');

    // Right button = Real prices
    expect(buttons[1].textContent).toContain('Real prices');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
  });

  it('fires onChange callback when clicking the other mode', () => {
    const handleChange = vi.fn();
    render(<ChartModeToggle mode="simulated" onChange={handleChange} />);

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]);

    expect(handleChange).toHaveBeenCalledWith('historical');
  });

  it('supports size="md" matching the time range selector dimensions', () => {
    const { container } = render(<ChartModeToggle mode="simulated" onChange={vi.fn()} size="md" />);
    const group = container.querySelector('[role="group"]');
    expect(group?.className).toContain('rounded-xl');
    expect(group?.className).toContain('border-subtle');

    const button = screen.getByRole('button', { name: /Estimate/ });
    expect(button.className).toContain('text-xs');
    expect(button.className).toContain('px-3.5');
    expect(button.className).toContain('py-1.5');
  });
});
