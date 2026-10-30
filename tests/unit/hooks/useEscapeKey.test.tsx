/**
 * Escape closes the dialog opened last only (TGLA-188).
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEscapeKey } from '../../../src/hooks/useEscapeKey';

const pressEscape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

describe('useEscapeKey', () => {
  it('closes only the topmost dialog, then the one under it', () => {
    const closeModal = vi.fn();
    const closeConfirm = vi.fn();
    const modal = renderHook(() => useEscapeKey(closeModal));
    const confirm = renderHook(() => useEscapeKey(closeConfirm));

    pressEscape();
    expect(closeConfirm).toHaveBeenCalledTimes(1);
    expect(closeModal).not.toHaveBeenCalled();

    confirm.unmount();
    pressEscape();
    expect(closeModal).toHaveBeenCalledTimes(1);
    modal.unmount();
  });

  it('does nothing while inactive', () => {
    const close = vi.fn();
    const { unmount } = renderHook(() => useEscapeKey(close, false));
    pressEscape();
    expect(close).not.toHaveBeenCalled();
    unmount();
  });
});
