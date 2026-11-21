import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type React from 'react';
import { useResizablePane } from '../../../src/hooks/useResizablePane';

describe('useResizablePane', () => {
  it('supports left-edge drag resize, clamp, Spotify snap-to-collapse and re-expand', () => {
    let width = 240;
    let collapsed = false;
    const onWidthChange = vi.fn((next: number) => {
      width = next;
    });
    const onCollapsedChange = vi.fn((next: boolean) => {
      collapsed = next;
    });
    const onResizeEnd = vi.fn();

    const { result, rerender } = renderHook(
      () =>
        useResizablePane({
          edge: 'left',
          width,
          minWidth: 180,
          maxWidth: 360,
          defaultWidth: 240,
          onWidthChange,
          onResizeEnd,
          collapsed,
          collapsedWidth: 80,
          collapseThreshold: 128,
          onCollapsedChange,
        })
    );

    act(() => {
      result.current.separatorProps.onPointerDown({
        button: 0,
        clientX: 240,
        preventDefault: vi.fn(),
      } as unknown as React.PointerEvent<HTMLElement>);
    });
    expect(result.current.isResizing).toBe(true);

    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 500 }) as unknown as PointerEvent);
    });
    expect(onWidthChange).toHaveBeenCalledWith(360); // clamped to maxWidth
    rerender();

    // Drag left below 128px collapse threshold -> snaps collapsed
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 90 }) as unknown as PointerEvent);
    });
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    rerender();

    // Drag right past threshold -> expands again
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200 }) as unknown as PointerEvent);
    });
    expect(onCollapsedChange).toHaveBeenCalledWith(false);

    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup') as unknown as PointerEvent);
    });
    expect(result.current.isResizing).toBe(false);
    expect(onResizeEnd).toHaveBeenCalled();
  });

  it('supports right-edge keyboard resize, double-click reset, and clamps', () => {
    let width = 420;
    const onWidthChange = vi.fn((next: number) => {
      width = next;
    });
    const onResizeEnd = vi.fn();

    const { result, rerender } = renderHook(() =>
      useResizablePane({
        edge: 'right',
        width,
        minWidth: 320,
        maxWidth: 760,
        defaultWidth: 420,
        onWidthChange,
        onResizeEnd,
      })
    );

    // ArrowLeft widens a right-docked panel
    act(() => {
      result.current.separatorProps.onKeyDown({
        key: 'ArrowLeft',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLElement>);
    });
    expect(width).toBe(436);
    rerender();

    // Double-click resets back to defaultWidth
    act(() => {
      result.current.separatorProps.onDoubleClick();
    });
    expect(width).toBe(420);
    expect(onResizeEnd).toHaveBeenCalledWith(420);
  });
});
