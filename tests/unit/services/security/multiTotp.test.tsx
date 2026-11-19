import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
    totpService,
    generateTotpCode,
    generateTotpSecret,
    MAX_TOTP_FACTORS,
} from '../../../../src/services/security/totpService';
import { appStorage } from '../../../../src/services/storage/appStorage';
import { TwoFactorChallengeModal } from '../../../../src/components/security/TwoFactorChallengeModal';
import { StepUpAuthModal } from '../../../../src/components/security/StepUpAuthModal';
import { stepUpService } from '../../../../src/services/security/stepUpService';
import { mfaService } from '../../../../src/services/security/mfaService';
import { passkeyAccountService } from '../../../../src/services/security/passkeyAccountService';
import { passkeyService } from '../../../../src/services/security/passkeyService';
import * as authCapabilities from '../../../../src/services/security/authCapabilities';

const completeSecondFactorMock = vi.fn().mockResolvedValue({ user: { id: 'u1' } });

vi.mock('../../../../src/context/AuthContext', () => ({
    useAuth: () => ({
        user: { id: 'u1', email: 'alice@example.com', name: 'Alice', authProvider: 'email' },
        completeSecondFactor: completeSecondFactorMock,
        completeSecondFactorWithPasskey: vi.fn(),
        pendingTotpFactors: [
            { id: 'factor-1', friendlyName: 'Apple Passwords' },
            { id: 'factor-2', friendlyName: 'Google Authenticator' },
        ],
        startGoogleReauth: vi.fn(),
    }),
}));

describe('Multi-factor TOTP (Local & Cloud)', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        completeSecondFactorMock.mockClear();
        await totpService.disable();
    });

    it('migrates legacy v1 TotpConfig transparently and supports adding a 2nd factor without overwriting backup codes', async () => {
        const secret1 = generateTotpSecret();
        const code1 = await generateTotpCode(secret1);
        const init1 = await totpService.initEnrollment('Damien', secret1);
        expect(init1.plainBackupCodes).toHaveLength(10);

        // Simulate legacy v1 record directly in appStorage
        appStorage.setItem('glassfolio_security_totp', JSON.stringify({
            secret: secret1,
            enabled: true,
            hashedBackupCodes: init1.hashedBackupCodes,
            enrolledAt: '2026-01-01T00:00:00.000Z',
        }));

        const migrated = await totpService.listFactors();
        expect(migrated).toHaveLength(1);
        expect(migrated[0].friendlyName).toBe('Authenticator');

        // Enroll 2nd named factor
        const secret2 = generateTotpSecret();
        const init2 = await totpService.initEnrollment('Damien', secret2);
        // Existing vault-wide backup codes should not generate a new list on 2nd enrollment
        expect(init2.plainBackupCodes).toHaveLength(0);

        const code2 = await generateTotpCode(secret2);
        const confirmed = await totpService.confirmEnrollment(secret2, code2, [], 'Google Authenticator');
        expect(confirmed).toBe(true);

        const factors = await totpService.listFactors();
        expect(factors.map(f => f.friendlyName)).toEqual(['Authenticator', 'Google Authenticator']);
        expect(await totpService.getRemainingBackupCodesCount()).toBe(10);

        // Factor 1 still verifies independently (its own anti-replay step was untouched by factor 2)
        expect(await totpService.verify(code1, factors[0].id)).toBe(true);
        // Existing backup code from factor 1 enrollment still works!
        expect(await totpService.verify(init1.plainBackupCodes[0])).toBe(true);
        expect(await totpService.getRemainingBackupCodesCount()).toBe(9);
    });

    it('enforces unique factor names, max 5 limit, per-factor removal, rename, and backup code regeneration', async () => {
        const secrets: string[] = [];
        for (let i = 0; i < MAX_TOTP_FACTORS; i += 1) {
            const secret = generateTotpSecret();
            secrets.push(secret);
            const init = await totpService.initEnrollment('Damien', secret);
            const code = await generateTotpCode(secret);
            const ok = await totpService.confirmEnrollment(secret, code, init.hashedBackupCodes, `App ${i + 1}`);
            expect(ok).toBe(true);
        }

        // Duplicate name rejected (even before limit, check after removing one)
        const factors = await totpService.listFactors();
        expect(factors).toHaveLength(MAX_TOTP_FACTORS);

        // 6th factor rejected by cap
        const extraSecret = generateTotpSecret();
        const extraCode = await generateTotpCode(extraSecret);
        await expect(
            totpService.confirmEnrollment(extraSecret, extraCode, [], 'App 6')
        ).rejects.toThrow(/Maximum number of authenticator apps reached/i);

        // Remove 1 factor → 4 remain, 2FA still enabled
        await totpService.removeFactor(factors[0].id);
        expect(await totpService.listFactors()).toHaveLength(MAX_TOTP_FACTORS - 1);
        expect(await totpService.isEnabled()).toBe(true);

        // Duplicate name rejected (case-insensitive)
        await expect(
            totpService.confirmEnrollment(extraSecret, extraCode, [], 'app 2')
        ).rejects.toThrow(/already exists/i);

        // Rename factor (and verify duplicate rename rejection)
        await expect(totpService.renameFactor(factors[1].id, 'app 3')).rejects.toThrow(/already exists/i);
        await totpService.renameFactor(factors[1].id, 'YubiKey Pro');
        const afterRename = await totpService.listFactors();
        expect(afterRename.some(f => f.friendlyName === 'YubiKey Pro')).toBe(true);

        // Regenerate backup codes replaces old ones
        const freshCodes = await totpService.regenerateBackupCodes();
        expect(freshCodes).toHaveLength(10);
        expect(await totpService.verify(freshCodes[0])).toBe(true);
        expect(await totpService.getRemainingBackupCodesCount()).toBe(9);
        expect((await totpService.getStore())?.version).toBe(2);

        // Removing all remaining factors disables 2FA completely
        for (const f of await totpService.listFactors()) {
            await totpService.removeFactor(f.id);
        }
        expect(await totpService.isEnabled()).toBe(false);
        await expect(totpService.regenerateBackupCodes()).rejects.toThrow(/No verified authenticator/i);
    });

    it('covers mfaService local multi-factor lifecycle and passkeyAccountService.rename', async () => {
        const draft1 = await mfaService.startTotpEnrollment('Damien', 'Apple Passwords');
        expect(draft1.friendlyName).toBe('Apple Passwords');
        expect(draft1.plainBackupCodes).toHaveLength(10);
        const code1 = await generateTotpCode(draft1.secret);
        expect(await mfaService.confirmTotpEnrollment(draft1, code1)).toBe(true);

        // Duplicate name rejected by mfaService
        await expect(mfaService.startTotpEnrollment('Damien', 'apple passwords')).rejects.toThrow(/already exists/i);

        const draft2 = await mfaService.startTotpEnrollment('Damien', 'Bitwarden');
        expect(draft2.hasExistingBackupCodes).toBe(true);
        const code2 = await generateTotpCode(draft2.secret);
        expect(await mfaService.confirmTotpEnrollment(draft2, code2)).toBe(true);

        const status = await mfaService.getTotpStatus();
        expect(status.factors).toHaveLength(2);
        expect(await mfaService.verifyTotp(await generateTotpCode(draft2.secret, Date.now() + 30_000), status.factors[1].id)).toBe(true);
        await mfaService.renameLocalTotpFactor(status.factors[1].id, 'Bitwarden Pro');
        expect((await mfaService.getTotpStatus()).factors[1].friendlyName).toBe('Bitwarden Pro');

        const regenCodes = await mfaService.regenerateLocalBackupCodes();
        expect(regenCodes).toHaveLength(10);

        await mfaService.removeTotpFactor(status.factors[0].id);
        expect((await mfaService.getTotpStatus()).factors).toHaveLength(1);

        // Passkey rename (existing local record + server-only record fallback)
        await passkeyService.saveRecord({
            id: 'cred-rename-1',
            name: 'Mac Passkey',
            createdAt: '2026-01-01T00:00:00.000Z',
            algorithm: -7,
        });
        await passkeyAccountService.rename(
            { key: 'cred-rename-1', name: 'Mac Passkey', createdAt: '2026-01-01T00:00:00.000Z', credentialId: 'cred-rename-1', unlocksVault: false },
            'MacBook Pro Touch ID',
        );
        const renamed = (await passkeyService.listPasskeys()).find(p => p.id === 'cred-rename-1');
        expect(renamed?.name).toBe('MacBook Pro Touch ID');

        await passkeyAccountService.rename(
            { key: 'srv-1', name: 'Server Passkey', createdAt: '2026-01-01T00:00:00.000Z', serverId: 'srv-1', unlocksVault: false },
            'iPhone 16',
        );
        const serverRenamed = (await passkeyService.listPasskeys()).find(p => p.serverId === 'srv-1');
        expect(serverRenamed?.name).toBe('iPhone 16');
    });

    it('renders factor selector in TwoFactorChallengeModal in Cloud mode when 2+ TOTP factors exist and submits selected factorId', async () => {
        const cloudCaps = authCapabilities.getAuthCapabilities('cloud');
        vi.spyOn(authCapabilities, 'getAuthCapabilities').mockReturnValue(cloudCaps);

        const { getByLabelText } = render(
            <MemoryRouter>
                <TwoFactorChallengeModal
                    isOpen
                    methods={['totp']}
                    accountIdentifier="alice@example.com"
                    onCancel={vi.fn()}
                />
            </MemoryRouter>,
        );

        const select = getByLabelText(/selectFactorLabel|Authenticator App|Application d'authentification/i) as HTMLSelectElement;
        expect(select.options).toHaveLength(2);
        fireEvent.change(select, { target: { value: 'factor-2' } });

        const codeInput = document.getElementById('two-factor-code') as HTMLInputElement;
        fireEvent.change(codeInput, { target: { value: '123456' } });
        fireEvent.submit(codeInput.closest('form')!);

        await waitFor(() => {
            expect(completeSecondFactorMock).toHaveBeenCalledWith('123456', 'factor-2');
        });
    });

    it('renders factor selector in StepUpAuthModal in Cloud mode and passes factorId to stepUpService.verify', async () => {
        const cloudCaps = authCapabilities.getAuthCapabilities('cloud');
        vi.spyOn(authCapabilities, 'getAuthCapabilities').mockReturnValue(cloudCaps);
        vi.spyOn(stepUpService, 'getRequirements').mockResolvedValue({
            password: true,
            secondFactor: ['totp'],
            totpFactors: [
                { id: 'factor-1', friendlyName: 'Apple Passwords' },
                { id: 'factor-2', friendlyName: 'YubiKey' },
            ],
            recentSignInRequired: false,
            recentSignInSatisfied: true,
        });
        const verifySpy = vi.spyOn(stepUpService, 'verify').mockResolvedValue(undefined);

        const { findByLabelText } = render(
            <StepUpAuthModal
                isOpen
                onVerified={vi.fn().mockResolvedValue(undefined)}
                onClose={vi.fn()}
            />,
        );

        const select = (await findByLabelText(/selectFactorLabel|Authenticator App|Application d'authentification/i)) as HTMLSelectElement;
        fireEvent.change(select, { target: { value: 'factor-2' } });

        const passwordInput = document.getElementById('step-up-password') as HTMLInputElement;
        fireEvent.change(passwordInput, { target: { value: 'StrongPass123!' } });
        fireEvent.change(document.getElementById('step-up-totp')!, { target: { value: '654321' } });
        fireEvent.submit(passwordInput.closest('form')!);

        await waitFor(() => {
            expect(verifySpy).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    password: 'StrongPass123!',
                    totpCode: '654321',
                    factorId: 'factor-2',
                }),
                { googleRoundTrip: false },
            );
        });
    });
});
