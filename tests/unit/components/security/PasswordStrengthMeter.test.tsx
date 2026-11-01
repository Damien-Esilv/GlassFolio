import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { PasswordStrengthMeter } from '../../../../src/components/security/PasswordStrengthMeter';
import * as passwordValidator from '../../../../src/services/security/passwordValidator';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

describe('PasswordStrengthMeter', () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('returns null if password is empty', () => {
        const { container } = render(<PasswordStrengthMeter password="" />);
        expect(container.firstChild).toBeNull();
    });

    it('renders with appropriate styles for score 0', () => {
        vi.spyOn(passwordValidator, 'evaluatePassword').mockReturnValue({ score: 0, isValid: false, estimatedEntropyBits: 0, rules: [] });
        render(<PasswordStrengthMeter password="password" />);
        expect(screen.getByText('auth:passwordMeter.veryWeak')).toBeDefined();
        expect(screen.getByText('auth:passwordMeter.veryWeak').className).toContain('text-error');
    });

    it('renders with appropriate styles for score 1', () => {
        vi.spyOn(passwordValidator, 'evaluatePassword').mockReturnValue({ score: 1, isValid: false, estimatedEntropyBits: 10, rules: [] });
        render(<PasswordStrengthMeter password="password1" />);
        expect(screen.getByText('auth:passwordMeter.weak')).toBeDefined();
        expect(screen.getByText('auth:passwordMeter.weak').className).toContain('text-error');
    });

    it('renders with appropriate styles for score 2', () => {
        vi.spyOn(passwordValidator, 'evaluatePassword').mockReturnValue({ score: 2, isValid: false, estimatedEntropyBits: 20, rules: [] });
        render(<PasswordStrengthMeter password="password1A" />);
        expect(screen.getByText('auth:passwordMeter.fair')).toBeDefined();
        expect(screen.getByText('auth:passwordMeter.fair').className).toContain('text-warning');
    });

    it('renders with appropriate styles for score 3', () => {
        vi.spyOn(passwordValidator, 'evaluatePassword').mockReturnValue({ score: 3, isValid: true, estimatedEntropyBits: 30, rules: [] });
        const { container } = render(<PasswordStrengthMeter password="password1A!" />);
        expect(screen.getByText('auth:passwordMeter.strong')).toBeDefined();
        expect(screen.getByText('auth:passwordMeter.strong').className).toContain('text-success');
        const bars = container.querySelectorAll('.h-full.rounded-full');
        expect(bars[0].className).toContain('bg-brand');
    });

    it('renders with appropriate styles for score 4', () => {
        vi.spyOn(passwordValidator, 'evaluatePassword').mockReturnValue({ score: 4, isValid: true, estimatedEntropyBits: 40, rules: [] });
        render(<PasswordStrengthMeter password="password1A!super" />);
        expect(screen.getByText('auth:passwordMeter.excellent')).toBeDefined();
        expect(screen.getByText('auth:passwordMeter.excellent').className).toContain('text-success');
    });

    it('verifies visual bars and rule checklist rendering', () => {
        vi.spyOn(passwordValidator, 'evaluatePassword').mockReturnValue({ score: 2, isValid: false, estimatedEntropyBits: 20, rules: [] });
        const { container, rerender } = render(<PasswordStrengthMeter password="a" />);

        const bars = container.querySelectorAll('.h-full.rounded-full');
        expect(bars.length).toBe(4);
        expect(bars[0].className).toContain('bg-warning');
        expect(bars[1].className).toContain('bg-warning');
        expect(bars[2].className).toContain('bg-subtle');
        expect(bars[3].className).toContain('bg-subtle');

        let checks = container.querySelectorAll('svg.lucide-check');
        let crosses = container.querySelectorAll('svg.lucide-x');
        expect(checks.length).toBe(1);
        expect(crosses.length).toBe(4);

        rerender(<PasswordStrengthMeter password="aA1!aA1!aA1!" />);
        checks = container.querySelectorAll('svg.lucide-check');
        crosses = container.querySelectorAll('svg.lucide-x');
        expect(checks.length).toBe(5);
        expect(crosses.length).toBe(0);
    });
});
