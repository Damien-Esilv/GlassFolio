import React, { createRef } from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AntiBotShield, AntiBotShieldHandle } from '../../../../src/components/security/AntiBotShield';
import * as antiBotModule from '../../../../src/services/security/antiBotService';

describe('AntiBotShield Component (Epic E22)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        document.querySelectorAll('script[src*="turnstile"]').forEach((s) => s.remove());
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders honeypot input hidden from accessibility and view', () => {
        vi.spyOn(antiBotModule, 'isTurnstileEnabled').mockReturnValue(false);

        const ref = createRef<AntiBotShieldHandle>();
        render(<AntiBotShield ref={ref} />);

        const honeypot = screen.getByLabelText(/System Telemetry/i);
        expect(honeypot).toBeInTheDocument();
        expect(honeypot).toHaveAttribute('tabIndex', '-1');
        expect(honeypot).toHaveValue('');
    });

    it('exposes imperative handle methods getPayload, validate, and reset', () => {
        vi.spyOn(antiBotModule, 'isTurnstileEnabled').mockReturnValue(false);

        const ref = createRef<AntiBotShieldHandle>();
        render(<AntiBotShield ref={ref} />);

        expect(ref.current).toBeDefined();
        expect(typeof ref.current?.getPayload).toBe('function');
        expect(typeof ref.current?.validate).toBe('function');
        expect(typeof ref.current?.reset).toBe('function');

        const payload = ref.current?.getPayload();
        expect(payload).toBeDefined();
        expect(payload?.honeypot).toBe('');
        expect(typeof payload?.mountedAt).toBe('number');
        expect(typeof payload?.submittedAt).toBe('number');
    });

    it('resets Proof-of-Work challenge and triggers turnstile reset when reset() is called', async () => {
        const mockTurnstileReset = vi.fn();
        const mockTurnstileRender = vi.fn().mockReturnValue('mock-widget-123');

        (window as unknown as { turnstile?: unknown }).turnstile = {
            render: mockTurnstileRender,
            reset: mockTurnstileReset,
        };

        vi.spyOn(antiBotModule, 'isTurnstileEnabled').mockReturnValue(true);
        vi.spyOn(antiBotModule, 'getTurnstileSiteKey').mockReturnValue('0x4AAAAAAFnXmKVTMTdpJDW5');

        const ref = createRef<AntiBotShieldHandle>();
        const { container } = render(<AntiBotShield ref={ref} />);

        // Wait for microtask / script load promise to resolve and render Turnstile
        await act(async () => {
            await Promise.resolve();
        });

        // Turnstile container is rendered with top margin
        const turnstileDiv = container.querySelector('.min-h-\\[65px\\]');
        expect(turnstileDiv).toBeInTheDocument();
        expect(turnstileDiv?.className).toContain('mt-6');

        expect(mockTurnstileRender).toHaveBeenCalled();

        act(() => {
            ref.current?.reset();
        });

        expect(mockTurnstileReset).toHaveBeenCalledWith('mock-widget-123');
        delete (window as unknown as { turnstile?: unknown }).turnstile;
    });

    it('skips Turnstile container when skipTurnstile prop is true', () => {
        vi.spyOn(antiBotModule, 'isTurnstileEnabled').mockReturnValue(true);
        vi.spyOn(antiBotModule, 'getTurnstileSiteKey').mockReturnValue('0x4AAAAAAFnXmKVTMTdpJDW5');

        const ref = createRef<AntiBotShieldHandle>();
        const { container } = render(<AntiBotShield ref={ref} skipTurnstile={true} />);

        const turnstileDiv = container.querySelector('.min-h-\\[65px\\]');
        expect(turnstileDiv).not.toBeInTheDocument();
    });
});
