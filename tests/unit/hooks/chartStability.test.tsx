import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettledValue } from '../../../src/hooks/useSettledValue';
import { useStableValue } from '../../../src/hooks/useStableValue';

describe('useStableValue', () => {
  it('keeps the same reference while the content is equal', () => {
    const { result, rerender } = renderHook(({ v }) => useStableValue(v), { initialProps: { v: { a: [1, 2] } } });
    const first = result.current;
    rerender({ v: { a: [1, 2] } });
    expect(result.current).toBe(first);
  });

  it('returns the new value when the content changes', () => {
    const { result, rerender } = renderHook(({ v }) => useStableValue(v), { initialProps: { v: { a: 1 } } });
    const next = { a: 2 };
    rerender({ v: next });
    expect(result.current).toBe(next);
  });
});

describe('useSettledValue', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
  afterEach(() => { vi.useRealTimers(); });

  it('follows the value freely while the chart is not shown', () => {
    const { result, rerender } = renderHook(({ v, a }) => useSettledValue(v, a, 1000), { initialProps: { v: 'one', a: false } });
    rerender({ v: 'two', a: false });
    expect(result.current).toBe('two');
  });

  it('keeps what is shown during the hold, then applies the latest value', () => {
    const { result, rerender } = renderHook(({ v, a }) => useSettledValue(v, a, 1000), { initialProps: { v: 'one', a: false } });
    rerender({ v: 'one', a: true });
    rerender({ v: 'two', a: true });
    rerender({ v: 'three', a: true });
    expect(result.current).toBe('one');
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe('one');
    act(() => { vi.advanceTimersByTime(600); });
    expect(result.current).toBe('three');
  });

  it('applies updates at once after the hold has passed', () => {
    const { result, rerender } = renderHook(({ v, a }) => useSettledValue(v, a, 1000), { initialProps: { v: 'one', a: true } });
    act(() => { vi.advanceTimersByTime(1500); });
    rerender({ v: 'two', a: true });
    expect(result.current).toBe('two');
  });
});
