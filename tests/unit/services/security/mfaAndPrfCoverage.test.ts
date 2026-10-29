import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseAuthProvider } from '../../../../src/services/security/authService';
import { vaultService } from '../../../../src/services/security/vaultService';
import { passkeyService } from '../../../../src/services/security/passkeyService';
import { supabaseClient } from '../../../../src/services/supabase/supabaseClient';
import { appStorage } from '../../../../src/services/storage/appStorage';
import { userRepository } from '../../../../src/services/repositories';
import { totpService } from '../../../../src/services/security/totpService';

describe('Epic 26 Security Coverage — MFA Bridge, PRF Passkeys & Vault Keyslots', () => {
    beforeEach(() => {
        appStorage.clear();
        vi.restoreAllMocks();
    });

    describe('SupabaseAuthProvider MFA Native Methods', () => {
        it('handles getSupabaseAccessToken, enrollMfaTotp, verifyMfaEnrollment, unenrollMfa, and listMfaFactors', async () => {
            const provider = new SupabaseAuthProvider();

            // When no session is active
            expect(provider.getSupabaseAccessToken()).toBeUndefined();
            expect(await provider.enrollMfaTotp()).toBeNull();
            await expect(provider.verifyMfaEnrollment('factor-1', '123456')).rejects.toThrow(/Active session required/);
            await expect(provider.unenrollMfa('factor-1')).rejects.toThrow(/Active session required/);
            expect(await provider.listMfaFactors()).toEqual([]);

            // Simulate active supabase session
            const mockSession = {
                accessToken: 'test-access-token-mfa',
                refreshToken: 'test-refresh-token',
                expiresIn: 3600,
                expiresAt: Date.now() + 3600_000,
                user: {
                    id: 'mfa-user-1',
                    email: 'mfa@glassfolio.dev',
                    created_at: new Date().toISOString(),
                    email_confirmed_at: new Date().toISOString(),
                },
            };
            (provider as unknown as { persistSession: (s: typeof mockSession) => void }).persistSession(mockSession);

            expect(provider.getSupabaseAccessToken()).toBe('test-access-token-mfa');

            // 1. enrollMfaTotp (stale unverified enrollments are removed first)
            const listSpy = vi.spyOn(supabaseClient, 'listMfaFactors').mockResolvedValue([
                { id: 'stale-1', factor_type: 'totp', status: 'unverified' },
            ]);
            const unenrollSpy = vi.spyOn(supabaseClient, 'unenrollMfaFactor').mockResolvedValue();
            vi.spyOn(supabaseClient, 'enrollMfaFactor').mockResolvedValue({
                id: 'factor-totp-1',
                type: 'totp',
                status: 'unverified',
                totp: {
                    secret: 'MFASECRET123',
                    qr_code: '<svg>qr</svg>',
                    uri: 'otpauth://totp/GlassFolio',
                },
            });

            const enrollResult = await provider.enrollMfaTotp('Mon Authenticator');
            expect(enrollResult).toEqual({
                id: 'factor-totp-1',
                secret: 'MFASECRET123',
                uri: 'otpauth://totp/GlassFolio',
            });
            expect(listSpy).toHaveBeenCalledWith('test-access-token-mfa', { includeUnverified: true });
            expect(unenrollSpy).toHaveBeenCalledWith('test-access-token-mfa', 'stale-1');

            // 2. verifyMfaEnrollment
            vi.spyOn(supabaseClient, 'challengeMfaFactor').mockResolvedValue({
                id: 'challenge-1',
            });
            const verifySpy = vi.spyOn(supabaseClient, 'verifyMfaFactor').mockResolvedValue({
                ...mockSession,
                accessToken: 'upgraded-access-token-aal2',
            });

            await provider.verifyMfaEnrollment('factor-totp-1', '654321');
            expect(verifySpy).toHaveBeenCalledWith('test-access-token-mfa', 'factor-totp-1', 'challenge-1', '654321');
            expect(provider.getSupabaseAccessToken()).toBe('upgraded-access-token-aal2');

            // 3. unenrollMfa
            await provider.unenrollMfa('factor-totp-1');
            expect(unenrollSpy).toHaveBeenCalledWith('upgraded-access-token-aal2', 'factor-totp-1');

            // 4. listMfaFactors
            vi.spyOn(supabaseClient, 'listMfaFactors').mockResolvedValue([
                { id: 'factor-totp-1', factor_type: 'totp', status: 'verified', friendly_name: 'Mon Authenticator' },
            ]);
            const factors = await provider.listMfaFactors();
            expect(factors).toHaveLength(1);
            expect(factors[0].id).toBe('factor-totp-1');

            // 5. Listing failures surface (callers fail closed)
            vi.spyOn(supabaseClient, 'listMfaFactors').mockRejectedValue(new Error('Network error'));
            await expect(provider.listMfaFactors()).rejects.toThrow('Network error');
        });

        it('verifyTotpCode upgrades the active session to AAL2 with the TOTP factor (step-up)', async () => {
            const provider = new SupabaseAuthProvider();
            const mockSession = {
                accessToken: 'test-token-mfa-verify',
                refreshToken: 'test-refresh',
                expiresIn: 3600,
                expiresAt: Date.now() + 3600_000,
                user: {
                    id: 'user-mfa-verify',
                    email: 'verify@glassfolio.dev',
                    created_at: new Date().toISOString(),
                    email_confirmed_at: new Date().toISOString(),
                },
            };
            (provider as unknown as { persistSession: (s: typeof mockSession) => void }).persistSession(mockSession);

            await userRepository.saveUser({
                id: 'user-mfa-verify',
                email: 'verify@glassfolio.dev',
                name: 'Verify User',
                authProvider: 'email',
                preferences: { theme: 'night', currency: 'EUR', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
                xp: 0,
                level: 1,
            });

            vi.spyOn(supabaseClient, 'listMfaFactors').mockResolvedValue([
                { id: 'factor-server-1', factor_type: 'totp', status: 'verified', friendly_name: 'App' },
            ]);
            vi.spyOn(supabaseClient, 'challengeMfaFactor').mockResolvedValue({
                id: 'chal-server',
            });
            vi.spyOn(supabaseClient, 'verifyMfaFactor').mockResolvedValue({
                ...mockSession,
                accessToken: 'aal2-token',
            });

            await provider.verifyTotpCode('123456');
            expect(provider.getSupabaseAccessToken()).toBe('aal2-token');
        });

        it('never falls back to a local TOTP when the Supabase factor fails', async () => {
            const provider = new SupabaseAuthProvider();
            const mockSession = {
                accessToken: 'test-token-mfa-fallback',
                refreshToken: 'test-refresh',
                expiresIn: 3600,
                expiresAt: Date.now() + 3600_000,
                user: {
                    id: 'user-mfa-fb',
                    email: 'fb@glassfolio.dev',
                    created_at: new Date().toISOString(),
                    email_confirmed_at: new Date().toISOString(),
                },
            };
            (provider as unknown as { persistSession: (s: typeof mockSession) => void }).persistSession(mockSession);

            await userRepository.saveUser({
                id: 'user-mfa-fb',
                email: 'fb@glassfolio.dev',
                name: 'Fallback User',
                authProvider: 'email',
                preferences: { theme: 'night', currency: 'EUR', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
                xp: 0,
                level: 1,
            });

            vi.spyOn(supabaseClient, 'listMfaFactors').mockRejectedValue(new Error('Supabase MFA offline'));
            const localVerify = vi.spyOn(totpService, 'verify').mockResolvedValue(true);

            // No sign-in waiting for a second factor: nothing to complete
            await expect(provider.verifySecondFactor('654321')).rejects.toThrow(/expired/i);
            await expect(provider.verifyTotpCode('654321')).rejects.toThrow('Supabase MFA offline');
            expect(localVerify).not.toHaveBeenCalled();
        });
    });

    describe('VaultService Passkey PRF Slots', () => {
        it('checks hasPasskeySlot and removePasskeyPrf cleanly', () => {
            // When no vault header exists
            expect(vaultService.hasPasskeySlot()).toBe(false);
            expect(vaultService.hasPasskeySlot('cred-1')).toBe(false);

            // Set up a vault header with passkeys
            const mockHeader = {
                version: 1,
                kdf: {
                    algorithm: 'PBKDF2',
                    iterations: 600000,
                    hash: 'SHA-256',
                    salt: 'salt-base64',
                },
                wrappedKeys: {
                    primary: {
                        wrappedDek: 'wrapped-dek',
                        iv: 'iv-base64',
                        tag: 'tag-base64',
                    },
                    passkeys: [
                        { credentialId: 'cred-1', wrappedDek: 'wrapped-1', prfSalt: 'salt-1', createdAt: new Date().toISOString() },
                        { credentialId: 'cred-2', wrappedDek: 'wrapped-2', prfSalt: 'salt-2', createdAt: new Date().toISOString() },
                    ],
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            appStorage.getBacking().setItem('gf_vault_header', JSON.stringify(mockHeader));

            expect(vaultService.hasPasskeySlot()).toBe(true);
            expect(vaultService.hasPasskeySlot('cred-1')).toBe(true);
            expect(vaultService.hasPasskeySlot('cred-2')).toBe(true);
            expect(vaultService.hasPasskeySlot('cred-nonexistent')).toBe(false);

            // Remove cred-1
            vaultService.removePasskeyPrf('cred-1');
            expect(vaultService.hasPasskeySlot('cred-1')).toBe(false);
            expect(vaultService.hasPasskeySlot('cred-2')).toBe(true);

            // Remove non-existent cred has no bad side effects
            vaultService.removePasskeyPrf('cred-nonexistent');
            expect(vaultService.hasPasskeySlot('cred-2')).toBe(true);
        });
    });

    describe('PasskeyService PRF Support & Secret Extraction', () => {
        it('detects PRF capabilities via isPrfSupported()', async () => {
            // 1. When PublicKeyCredential has no getClientCapabilities
            (window as unknown as { PublicKeyCredential?: Record<string, unknown> }).PublicKeyCredential = {};
            expect(await passkeyService.isPrfSupported()).toBe(false);

            // 2. When getClientCapabilities reports prf: true
            (window as unknown as { PublicKeyCredential: { getClientCapabilities?: () => Promise<Record<string, boolean>> } }).PublicKeyCredential = {
                getClientCapabilities: vi.fn().mockResolvedValue({ prf: true }),
            };
            expect(await passkeyService.isPrfSupported()).toBe(true);

            // 3. When getClientCapabilities reports extension:prf: true
            (window as unknown as { PublicKeyCredential: { getClientCapabilities: () => Promise<Record<string, boolean>> } }).PublicKeyCredential = {
                getClientCapabilities: vi.fn().mockResolvedValue({ 'extension:prf': true }),
            };
            expect(await passkeyService.isPrfSupported()).toBe(true);

            // 4. When getClientCapabilities rejects
            (window as unknown as { PublicKeyCredential: { getClientCapabilities: () => Promise<Record<string, boolean>> } }).PublicKeyCredential = {
                getClientCapabilities: vi.fn().mockRejectedValue(new Error('unsupported')),
            };
            expect(await passkeyService.isPrfSupported()).toBe(false);
        });

        it('authenticates with prfSalt and extracts ArrayBuffer prfSecret', async () => {
            const rawId = new Uint8Array([10, 20, 30, 40]);
            const prfBuffer = new Uint8Array([99, 88, 77, 66]).buffer;

            const mockGet = vi.fn().mockResolvedValue({
                rawId: rawId.buffer,
                id: 'ChQeKA',
                type: 'public-key',
                response: {
                    clientDataJSON: new Uint8Array([1]).buffer,
                    authenticatorData: new Uint8Array([2]).buffer,
                    signature: new Uint8Array([3]).buffer,
                    userHandle: null,
                },
                getClientExtensionResults: () => ({
                    prf: {
                        results: {
                            first: prfBuffer,
                        },
                    },
                }),
            });

            Object.defineProperty(navigator, 'credentials', {
                value: { get: mockGet },
                configurable: true,
            });

            const res = await passkeyService.authenticate({ allowCredentialIds: ['ChQeKA=='], withPrf: true });

            expect(res.credentialId).toBe('ChQeKA==');
            expect(res.prfSecret).toEqual(new Uint8Array([99, 88, 77, 66]));
            // The PRF output is a vault key: it never appears in what is sent to a server
            expect(res.credentialJson.clientExtensionResults).toEqual({});
            const options = mockGet.mock.calls[0][0].publicKey;
            expect(options.userVerification).toBe('required');
            expect(options.extensions.prf.eval.first).toHaveLength(32);
        });

        it('authenticates with prfSalt and extracts ArrayBufferView prfSecret', async () => {
            const rawId = new Uint8Array([10, 20, 30, 40]);
            const prfView = new Uint8Array([11, 22, 33, 44]);

            const mockGet = vi.fn().mockResolvedValue({
                rawId: rawId.buffer,
                id: 'ChQeKA',
                type: 'public-key',
                response: {
                    clientDataJSON: new Uint8Array([1]).buffer,
                    authenticatorData: new Uint8Array([2]).buffer,
                    signature: new Uint8Array([3]).buffer,
                    userHandle: null,
                },
                getClientExtensionResults: () => ({
                    prf: {
                        results: {
                            first: prfView,
                        },
                    },
                }),
            });

            Object.defineProperty(navigator, 'credentials', {
                value: { get: mockGet },
                configurable: true,
            });

            const res = await passkeyService.authenticate({ allowCredentialIds: ['ChQeKA=='], withPrf: true });

            expect(res.credentialId).toBe('ChQeKA==');
            expect(res.prfSecret).toEqual(new Uint8Array([11, 22, 33, 44]));

            // A credential outside the allow-list is rejected (e.g. a deleted passkey)
            await expect(passkeyService.authenticate({ allowCredentialIds: ['AAAA'] })).rejects.toThrow(/not registered/i);
        });
    });
});
