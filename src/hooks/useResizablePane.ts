import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

export interface UseResizablePaneOptions {
  edge: 'left' | 'right';
  width: number;
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
  onWidthChange: (nextWidth: number) => void;
  onResizeEnd?: (finalWidth: number) => void;
  /** Optional Spotify macOS-style snap-to-collapse when dragging below threshold. */
  collapsed?: boolean;
  collapsedWidth?: number;
  collapseThreshold?: number;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export interface ResizableSeparatorProps {
  role: 'separator';
  'aria-orientation': 'vertical';
  'aria-valuenow': number;
  'aria-valuemin': number;
  'aria-valuemax': number;
  tabIndex: number;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
}

export interface UseResizablePaneResult {
  isResizing: boolean;
  separatorProps: ResizableSeparatorProps;
}

const KEYBOARD_STEP_PX = 16;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)));

/**
 * Continuous drag + keyboard resize hook for sidebars and side panels.
 * Supports Spotify macOS-style snap-to-collapse when `collapseThreshold` is set.
 */
export function useResizablePane(options: UseResizablePaneOptions): UseResizablePaneResult {
  const [isResizing, setIsResizing] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const dragRef = useRef<{ startX: number; startWidth: number; lastEffectiveWidth: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const opts = optionsRef.current;
    const effectiveStart = opts.collapsed ? (opts.collapsedWidth ?? opts.minWidth) : opts.width;
    dragRef.current = {
      startX: e.clientX,
      startWidth: effectiveStart,
      lastEffectiveWidth: effectiveStart,
    };
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const opts = optionsRef.current;
      const delta = e.clientX - drag.startX;
      const rawWidth = opts.edge === 'left' ? drag.startWidth + delta : drag.startWidth - delta;

      if (
        opts.edge === 'left' &&
        opts.collapseThreshold !== undefined &&
        opts.onCollapsedChange
      ) {
        if (rawWidth < opts.collapseThreshold) {
          if (!opts.collapsed) opts.onCollapsedChange(true);
          drag.lastEffectiveWidth = opts.collapsedWidth ?? opts.minWidth;
          return;
        }
        if (opts.collapsed) opts.onCollapsedChange(false);
      }

      const next = clamp(rawWidth, opts.minWidth, opts.maxWidth);
      drag.lastEffectiveWidth = next;
      opts.onWidthChange(next);
    };

    const handlePointerUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      setIsResizing(false);
      if (drag) {
        optionsRef.current.onResizeEnd?.(drag.lastEffectiveWidth);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('resize'));
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isResizing]);

  const handleDoubleClick = useCallback(() => {
    const opts = optionsRef.current;
    if (opts.collapsed && opts.onCollapsedChange) {
      opts.onCollapsedChange(false);
    }
    const resetWidth = clamp(opts.defaultWidth, opts.minWidth, opts.maxWidth);
    opts.onWidthChange(resetWidth);
    opts.onResizeEnd?.(resetWidth);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('resize'));
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    const opts = optionsRef.current;
    let next: number | null = null;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const growDirection = opts.edge === 'left' ? e.key === 'ArrowRight' : e.key === 'ArrowLeft';
      if (opts.collapsed && growDirection && opts.onCollapsedChange) {
        opts.onCollapsedChange(false);
        next = opts.minWidth;
      } else {
        const delta = growDirection ? KEYBOARD_STEP_PX : -KEYBOARD_STEP_PX;
        next = clamp(opts.width + delta, opts.minWidth, opts.maxWidth);
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      next = opts.minWidth;
    } else if (e.key === 'End') {
      e.preventDefault();
      if (opts.collapsed && opts.onCollapsedChange) opts.onCollapsedChange(false);
      next = opts.maxWidth;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (opts.collapsed && opts.onCollapsedChange) opts.onCollapsedChange(false);
      next = clamp(opts.defaultWidth, opts.minWidth, opts.maxWidth);
    }

    if (next !== null) {
      opts.onWidthChange(next);
      opts.onResizeEnd?.(next);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('resize'));
      }
    }
  }, []);

  const currentEffective = options.collapsed
    ? (options.collapsedWidth ?? options.minWidth)
    : options.width;

  return {
    isResizing,
    separatorProps: {
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-valuenow': currentEffective,
      'aria-valuemin': options.collapsedWidth ?? options.minWidth,
      'aria-valuemax': options.maxWidth,
      tabIndex: 0,
      onPointerDown: handlePointerDown,
      onDoubleClick: handleDoubleClick,
      onKeyDown: handleKeyDown,
    },
  };
}
