import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { Position } from '../../../../src/types';

const chart = { mounts: 0, data: [] as unknown[] };

vi.mock('recharts', async () => {
  const React = await import('react');
  const Probe: React.FC<{ data: unknown[]; children?: React.ReactNode }> = ({ data }) => {
    React.useEffect(() => { chart.mounts += 1; }, []);
    chart.data.push(data);
    return <div data-testid="chart" />;
  };
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    AreaChart: Probe,
    Area: () => null,
  };
});

import PerformerCard from '../../../../src/components/dashboard/PerformerCard';

const position = (over: Partial<Position> = {}): Position => ({
  id: 'p1', symbol: 'AAPL', instrument: 'Apple', type: 'Stock', currency: 'EUR', quantity: 1,
  avgCost: 100, lastPrice: 150, marketValue: 150, unrealizedPL: 50, unrealizedPLPercent: 50,
  ...over,
} as Position);

const history = [{ timestamp: 1, price: 10 }, { timestamp: 2, price: 12 }, { timestamp: 3, price: 11 }];

const card = (pos: Position, realHistory: typeof history | null) => (
  <PerformerCard title="Best" position={pos} realHistory={realHistory} timeRange="1Y" currency="EUR" locale="en-US" />
);

describe('PerformerCard', () => {
  beforeEach(() => { chart.mounts = 0; chart.data = []; });

  it('shows a placeholder, not a chart, while the history is still being read', () => {
    const { queryByTestId } = render(card(position(), null));
    expect(queryByTestId('chart')).toBeNull();
  });

  it('mounts its chart once and does not rebuild it when the parent re-renders with an equal position', () => {
    const { rerender } = render(card(position(), history));
    for (let i = 0; i < 4; i += 1) rerender(card(position(), history));
    expect(chart.mounts).toBe(1);
  });

  it('keeps the same chart data when only the position object changes', () => {
    const { rerender } = render(card(position(), history));
    rerender(card(position(), history));
    rerender(card(position(), history));
    expect(new Set(chart.data).size).toBe(1);
  });
});
