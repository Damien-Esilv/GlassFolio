import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Position } from '../../../src/types';

const price = vi.hoisted(() => ({
  fetch: vi.fn(),
  cached: vi.fn(),
}));

vi.mock('../../../src/services/priceService', () => ({
  fetchRealPriceHistory: price.fetch,
  getCachedRealPriceHistory: price.cached,
}));

import { usePerformerHistory } from '../../../src/hooks/usePerformerHistory';

const pos = (over: Partial<Position> = {}): Position => ({ id: 'p1', symbol: 'AAPL', ...over } as Position);
const series = () => [{ timestamp: 1, price: 10 }, { timestamp: 2, price: 12 }];

describe('usePerformerHistory', () => {
  beforeEach(() => {
    price.fetch.mockReset();
    price.cached.mockReset();
    price.cached.mockReturnValue(null);
  });

  it('is null while fetching, then the series', async () => {
    price.fetch.mockResolvedValue(series());
    const { result } = renderHook(() => usePerformerHistory(pos(), '1Y'));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual(series()));
  });

  it('is an empty list when there is no position', () => {
    const { result } = renderHook(() => usePerformerHistory(null, '1Y'));
    expect(result.current).toEqual([]);
    expect(price.fetch).not.toHaveBeenCalled();
  });

  it('does not fetch again when an equal position object arrives', async () => {
    price.fetch.mockResolvedValue(series());
    const { result, rerender } = renderHook(({ p }) => usePerformerHistory(p, '1Y'), { initialProps: { p: pos() } });
    await waitFor(() => expect(result.current).not.toBeNull());
    rerender({ p: pos() });
    rerender({ p: pos() });
    expect(price.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the same array when the fetch returns what the cache already gave', async () => {
    price.cached.mockReturnValue(series());
    price.fetch.mockResolvedValue(series());
    const { result } = renderHook(() => usePerformerHistory(pos(), '1Y'));
    const first = result.current;
    expect(first).toEqual(series());
    await waitFor(() => expect(price.fetch).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current).toBe(first);
  });

  it('goes back to null and fetches again when the range changes', async () => {
    price.fetch.mockResolvedValue(series());
    const { result, rerender } = renderHook(({ r }) => usePerformerHistory(pos(), r), { initialProps: { r: '1Y' } });
    await waitFor(() => expect(result.current).not.toBeNull());
    price.fetch.mockResolvedValue([{ timestamp: 5, price: 1 }, { timestamp: 6, price: 2 }]);
    rerender({ r: '1M' });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.[0].timestamp).toBe(5));
    expect(price.fetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to an empty list when the fetch fails', async () => {
    price.fetch.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePerformerHistory(pos(), '1Y'));
    await waitFor(() => expect(result.current).toEqual([]));
  });
});
