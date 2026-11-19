import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { getAccountIdentifier, isLocalVaultUser } from '../../../../src/services/security/accountIdentity';
import { passkeyService } from '../../../../src/services/security/passkeyService';
import { TwoFactorChallengeModal } from '../../../../src/components/security/TwoFactorChallengeModal';
import { TotpEnrollDialog } from '../../../../src/components/security/TotpEnrollDialog';
import { StepUpAuthModal } from '../../../../src/components/security/StepUpAuthModal';
import { stepUpService } from '../../../../src/services/security/stepUpService';
import { mfaService } from '../../../../src/services/security/mfaService';

import '../../../../src/i18n';

let mockedUser: { id: string; name: string; email: string; authProvider?: 'local' | 'email' | 'google' } | null = null;

vi.mock('../../../../src/context/AuthContext', () => ({
    useAuth: () => ({
        user: mockedUser,
        completeSecondFactor: vi.fn(),
        completeSecondFactorWithPasskey: vi.fn(),
        startGoogleReauth: vi.fn(),
        selectLocalVaultProfile: vi.fn(),
    }),
}));

describe('Local vs Cloud Account Identity Unification (TGLA-219)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockedUser = {
            id: 'usr-local-1',
            name: 'Damien Perso',
            email: 'local@glassfolio.vault',
            authProvider: 'local',
        };
    });

    it('resolves local vault name vs cloud email cleanly without breaking schema emails', () => {
        expect(isLocalVaultUser(mockedUser)).toBe(true);
        expect(getAccountIdentifier(mockedUser)).toBe('Damien Perso');

        const cloudEmailUser = {
            id: 'usr-cloud-1',
            name: 'Damien',
            email: 'damien@example.com',
            authProvider: 'email' as const,
        };
        expect(isLocalVaultUser(cloudEmailUser)).toBe(false);
        expect(getAccountIdentifier(cloudEmailUser)).toBe('damien@example.com');

        const googleUser = {
            id: 'usr-cloud-2',
            name: 'Damien',
            email: 'damien.google@example.com',
            authProvider: 'google' as const,
        };
        expect(isLocalVaultUser(googleUser)).toBe(false);
        expect(getAccountIdentifier(googleUser)).toBe('damien.google@example.com');
    });

    it('uses the local vault display name (not local@glassfolio.vault) in WebAuthn passkeyService.create', async () => {
        const mockCreate = vi.fn().mockResolvedValue({
            rawId: new Uint8Array([1, 2, 3]).buffer,
            id: 'AQID',
            type: 'public-key',
            response: {
                clientDataJSON: new Uint8Array([1]).buffer,
                attestationObject: new Uint8Array([2]).buffer,
                getPublicKeyAlgorithm: () => -7,
                getTransports: () => ['internal'],
            },
            getClientExtensionResults: () => ({ prf: { enabled: true } }),
        });
        Object.defineProperty(globalThis.navigator, 'credentials', {
            value: { create: mockCreate, get: vi.fn() },
            configurable: true,
        });

        await passkeyService.create({
            user: { id: 'usr-local-1', name: 'Damien Perso', email: 'local@glassfolio.vault' },
        });

        const publicKey = (mockCreate.mock.calls[0][0] as CredentialCreationOptions).publicKey!;
        expect(publicKey.user.name).toBe('Damien Perso');
        expect(publicKey.user.displayName).toBe('Damien Perso');
    });

    it('anchors StepUpAuthModal (Passkeys, 2FA, Recovery, Delete) to the local vault name or cloud email with aria-label', async () => {
        vi.spyOn(stepUpService, 'getRequirements').mockResolvedValue({
            password: true,
            secondFactor: [],
            totpFactors: [],
            recentSignInRequired: false,
            recentSignInSatisfied: true,
        });

        const { unmount } = render(
            <StepUpAuthModal
                isOpen
                onVerified={vi.fn()}
                onClose={vi.fn()}
            />,
        );

        await waitFor(() => {
            const usernameInput = document.querySelector('input[name="username"]') as HTMLInputElement | null;
            expect(usernameInput).not.toBeNull();
            expect(usernameInput!.value).toBe('Damien Perso');
            expect(usernameInput!.getAttribute('aria-label')).toBeTruthy();
            expect(usernameInput!.getAttribute('aria-hidden')).toBeNull();
        });
        unmount();

        mockedUser = {
            id: 'usr-cloud-1',
            name: 'Damien',
            email: 'damien@example.com',
            authProvider: 'email',
        };
        render(
            <StepUpAuthModal
                isOpen
                onVerified={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        await waitFor(() => {
            const usernameInput = document.querySelector('input[name="username"]') as HTMLInputElement | null;
            expect(usernameInput!.value).toBe('damien@example.com');
        });
    });

    it('anchors TwoFactorChallengeModal OTP form to the active account identifier', () => {
        render(
            <MemoryRouter>
                <TwoFactorChallengeModal
                    isOpen
                    methods={['totp']}
                    accountIdentifier="Holding SCI"
                    onCancel={vi.fn()}
                />
            </MemoryRouter>,
        );

        const usernameInput = document.querySelector('input[name="username"]') as HTMLInputElement | null;
        expect(usernameInput).not.toBeNull();
        expect(usernameInput!.value).toBe('Holding SCI');
        expect(usernameInput!.getAttribute('autocomplete')).toBe('username');
    });

    it('anchors TotpEnrollDialog QR URI and verification form to the active vault name', async () => {
        const startSpy = vi.spyOn(mfaService, 'startTotpEnrollment').mockResolvedValue({
            secret: 'JBSWY3DPEHPK3PXP',
            uri: 'otpauth://totp/GlassFolio:Damien%20Perso?secret=JBSWY3DPEHPK3PXP&issuer=GlassFolio',
            qrSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
            friendlyName: 'Apple Passwords',
            plainBackupCodes: ['AAAA-BBBB'],
            hashedBackupCodes: ['hash'],
        });

        const { getByText, getByRole } = render(
            <TotpEnrollDialog
                isOpen
                userEmail="Damien Perso"
                onClose={vi.fn()}
                onEnrolled={vi.fn()}
            />,
        );

        fireEvent.click(getByText('Apple Passwords'));
        fireEvent.click(getByRole('button', { name: /continue/i }));

        await waitFor(() => {
            expect(startSpy).toHaveBeenCalledWith('Damien Perso', 'Apple Passwords');
            const usernameInput = document.querySelector('input[name="username"]') as HTMLInputElement | null;
            expect(usernameInput).not.toBeNull();
            expect(usernameInput!.value).toBe('Damien Perso');
        });
    });
});
