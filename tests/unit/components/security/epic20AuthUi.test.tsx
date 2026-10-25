import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AntiBotShield, AntiBotShieldHandle } from '../../../../components/security/AntiBotShield';
import { TwoFactorChallengeModal } from '../../../../components/security/TwoFactorChallengeModal';
import { EmailVerificationGate } from '../../../../components/security/EmailVerificationGate';
import { PasswordResetFlow } from '../../../../pages/PasswordResetFlow';
import { authService } from '../../../../src/services/security/authService';

// Initialize i18n for testing
import '../../../../src/i18n';

describe('Epic 20 — Auth & Security UI Components', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('AntiBotShield', () => {
        it('renders honeypot input with aria-hidden="true" and tabIndex={-1}', () => {
            render(<AntiBotShield />);
            const honeypotInput = screen.getByLabelText(/Do not fill this field|System Telemetry/i);
            expect(honeypotInput).toBeDefined();
            expect(honeypotInput.getAttribute('tabindex')).toBe('-1');
        });

        it('pre-computes PoW challenge in background and exposes payload via ref', async () => {
            const ref = React.createRef<AntiBotShieldHandle>();
            render(<AntiBotShield ref={ref} />);

            await waitFor(() => {
                const payload = ref.current?.getPayload();
                expect(payload?.powChallenge).toBeDefined();
                expect(payload?.powChallenge.length).toBeGreaterThan(0);
            });
        });
    });

    describe('TwoFactorChallengeModal', () => {
        it('renders modal when isOpen is true and submits code to authService', async () => {
            const onSuccess = vi.fn();
            const onCancel = vi.fn();

            vi.spyOn(authService, 'verifySecondFactor').mockResolvedValue({
                user: {
                    id: 'usr-123',
                    name: 'TOTP User',
                    email: 'test@example.com',
                    avatar: '/avatar.jpg',
                    preferences: { theme: 'night', currency: 'EUR', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
                    xp: 0,
                    level: 1,
                },
                session: {
                    id: 'sess-123',
                    userId: 'usr-123',
                    createdAt: new Date().toISOString(),
                    lastSeenAt: new Date().toISOString(),
                    userAgent: 'Test',
                    deviceLabel: 'Device',
                },
            });

            render(
                <TwoFactorChallengeModal
                    isOpen={true}
                    onSuccess={onSuccess}
                    onCancel={onCancel}
                />
            );

            expect(screen.getByText(/Two-Factor Authentication|Authentification à deux facteurs/i)).toBeDefined();

            const input = screen.getByPlaceholderText(/000000/i);
            fireEvent.change(input, { target: { value: '123456' } });

            const submitBtn = screen.getByRole('button', { name: /Verify/i });
            fireEvent.click(submitBtn);

            await waitFor(() => {
                expect(authService.verifySecondFactor).toHaveBeenCalledWith('123456');
                expect(onSuccess).toHaveBeenCalled();
            });
        });
    });

    describe('EmailVerificationGate', () => {
        it('renders gate with user email and verifies OTP code', async () => {
            const onVerified = vi.fn();
            const onSignOut = vi.fn();

            vi.spyOn(authService, 'verifyEmailOtp').mockResolvedValue({
                user: {
                    id: 'usr-verify',
                    name: 'Verify User',
                    email: 'verify@example.com',
                    avatar: '/avatar.jpg',
                    preferences: { theme: 'night', currency: 'EUR', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
                    xp: 0,
                    level: 1,
                },
                session: {
                    id: 'sess-verify',
                    userId: 'usr-verify',
                    createdAt: new Date().toISOString(),
                    lastSeenAt: new Date().toISOString(),
                    userAgent: 'Test',
                    deviceLabel: 'Device',
                },
            });

            render(
                <EmailVerificationGate
                    userEmail="verify@example.com"
                    onVerified={onVerified}
                    onSignOut={onSignOut}
                />
            );

            expect(screen.getByText('verify@example.com')).toBeDefined();

            const input = screen.getByPlaceholderText('123456');
            fireEvent.change(input, { target: { value: '654321' } });

            const confirmBtn = screen.getByRole('button', { name: /Confirm Code|Confirmer le code/i });
            fireEvent.click(confirmBtn);

            await waitFor(() => {
                expect(authService.verifyEmailOtp).toHaveBeenCalledWith('verify@example.com', '654321');
            });
        });
    });

    describe('PasswordResetFlow', () => {
        it('renders request mode by default and allows switching to emergency recovery key mode', async () => {
            render(
                <MemoryRouter>
                    <PasswordResetFlow initialMode="request" />
                </MemoryRouter>
            );

            expect(screen.getByPlaceholderText('alex@example.com')).toBeDefined();

            // Click switch to recovery key mode
            const switchBtn = screen.getByRole('button', { name: /I already have my emergency recovery key|J'ai déjà ma clé de secours/i });
            fireEvent.click(switchBtn);

            expect(screen.getByPlaceholderText(/XXXX-XXXX/i)).toBeDefined();
        });
    });
});
