import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../../../src/i18n';
import { PullToRefresh } from '../../../../src/components/ui/PullToRefresh';

const setTouchFirst = (matches: boolean): void => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: matches && query.includes('pointer: coarse'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
};

const pull = (): void => {
    fireEvent.touchStart(window, { touches: [{ clientY: 0 }] });
    fireEvent.touchMove(window, { touches: [{ clientY: 100 }] });
};

describe('PullToRefresh', () => {
    const original = window.matchMedia;
    beforeEach(() => {
        Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    });
    afterEach(() => {
        window.matchMedia = original;
    });

    it('shows the sphere while pulling on a touch-first device', () => {
        setTouchFirst(true);
        render(<PullToRefresh><p>content</p></PullToRefresh>);
        pull();
        expect(screen.getByTestId('app-thinking-orb').getAttribute('data-state')).toBe('searching');
    });

    it('does nothing on a desktop (mouse / trackpad, even with a touchscreen)', () => {
        setTouchFirst(false);
        render(<PullToRefresh><p>content</p></PullToRefresh>);
        pull();
        expect(screen.queryByTestId('app-thinking-orb')).toBeNull();
        expect(screen.getByText('content')).toBeDefined();
    });
});
