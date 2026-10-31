import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

let counted = 0;
vi.mock('../../../../src/hooks/useCountUp', () => ({
  useCountUp: () => counted,
}));

import StableNumber from '../../../../src/components/ui/StableNumber';
import AnimatedCounter from '../../../../src/components/AnimatedCounter';
import { AnimatedNumber } from '../../../../src/components/ui/AnimatedNumber';
import { TrendValue } from '../../../../src/components/ui/TrendValue';
import { TrendBadge } from '../../../../src/components/ui/TrendBadge';

const finalOf = (container: HTMLElement): string | null =>
  container.querySelector('[data-final]')?.getAttribute('data-final') ?? null;

describe('StableNumber', () => {
  it('shows the current text and carries the final one for the invisible sizer', () => {
    const { container } = render(<StableNumber display="12" final="9,499.91" />);
    expect(container.textContent).toBe('12');
    expect(finalOf(container)).toBe('9,499.91');
    expect(container.firstElementChild?.className).toContain('tabular-nums');
    expect(container.firstElementChild?.className).toContain('whitespace-nowrap');
  });
});

describe('counters keep a constant size while counting', () => {
  beforeEach(() => { counted = 0; });

  const cases: Array<[string, (v: number) => React.ReactElement]> = [
    ['AnimatedCounter', () => <AnimatedCounter value={9499.91} currency="EUR" locale="en-US" />],
    ['AnimatedNumber', () => <AnimatedNumber value={9499} locale="en-US" suffix=" XP" />],
    ['TrendValue currency', () => <TrendValue value={2.9} format="currency" currency="EUR" locale="en-US" animated />],
    ['TrendValue percent', () => <TrendValue value={2.9} format="percent" animated />],
    ['TrendBadge', () => <TrendBadge value={-12.34} animated />],
  ];

  it.each(cases)('%s: the sized text is the final value at every step', (_name, build) => {
    const finals = new Set<string | null>();
    const shown = new Set<string>();
    for (const step of [0, 0.4, 1.7, 2.9, 9.5, 9499.91]) {
      counted = step;
      const { container, unmount } = render(build(step));
      finals.add(finalOf(container));
      shown.add(container.textContent ?? '');
      unmount();
    }
    expect(finals.size).toBe(1);
    expect([...finals][0]).toBeTruthy();
    // the digits did move, so the guarantee is not trivially true
    expect(shown.size).toBeGreaterThan(1);
  });
});
