import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SupabaseRequestError, supabaseClient } from '../../../../src/services/supabase/supabaseClient';
import { LocalAuthProvider, SupabaseAuthProvider, authService } from '../../../../src/services/security/authService';
import { vaultService } from '../../../../src/services/security/vaultService';
import { totpService, generateTotpCode } from '../../../../src/services/security/totpService';
import { mfaService } from '../../../../src/services/security/mfaService';
import { stepUpService } from '../../../../src/services/security/stepUpService';
import { passkeyService } from '../../../../src/services/security/passkeyService';
import { passkeyAccountService } from '../../../../src/services/security/passkeyAccountService';
import { getAuthCapabilities } from '../../../../src/services/security/authCapabilities';
import { userRepository } from '../../../../src/services/repositories';
import { appStorage } from '../../../../src/services/storage/appStorage';
import type { User } from '../../../../src/types/domain';
import { mockRemoteVault } from '../../helpers/remoteVault';

const PASSWORD = 'Strong-Vault-Secret-Key-2026!#';
const CRED_RAW = new Uint8Array([5, 6, 7, 8]);
const CRED_ID = 'BQYHCA==';
const PRF_SECRET = new Uint8Array(32).fill(7);

/** Unsigned JWT carrying the claims the client reads (aal, amr). */
const jwt = (claims: Record<string, unknown>): string =>
    `h.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.s`;

const session = (userId = 'sb-1', accessToken = 'tok-1') => ({
    accessToken,
    refreshToken: 'refresh-1',
    expiresAt: Date.now() + 3_600_000,
    user: { id: userId, email: 'user@example.com', email_confirmed_at: '2026-10-01T00:00:00Z' },
});

const assertion = (withPrf = true, raw = CRED_RAW) => ({
    rawId: raw.buffer,
    id: 'BQYHCA',
    type: 'public-key',
    response: {
        clientDataJSON: new Uint8Array([1]).buffer,
        authenticatorData: new Uint8Array([2]).buffer,
        signature: new Uint8Array([3]).buffer,
        userHandle: null,
    },
    getClientExtensionResults: () => (withPrf ? { prf: { results: { first: PRF_SECRET.buffer } } } : {}),
});

const mockWebAuthnGet = (result: unknown) => {
    Object.defineProperty(navigator, 'credentials', { value: { get: vi.fn().mockResolvedValue(result), create: vi.fn() }, configurable: true });
};

const user = (overrides: Partial<User> = {}): User => ({
    id: 'sb-1',
    name: 'User',
    email: 'user@example.com',
    avatar: '',
    preferences: { theme: 'night', currency: 'EUR', notifications: true, language: 'en', dateFormat: 'DD/MM/YYYY' },
    xp: 0,
    level: 1,
    authProvider: 'email',
    ...overrides,
});

const enrollLocalTotp = async (): Promise<{ secret: string; backup: string }> => {
    const enrollment = await totpService.initEnrollment('user@example.com');
    await totpService.confirmEnrollment(enrollment.secret, await generateTotpCode(enrollment.secret), enrollment.hashedBackupCodes);
    return { secret: enrollment.secret, backup: enrollment.plainBackupCodes[0] };
};

const setDeploymentMode = (mode: 'local' | 'cloud') => {
    process.env.VITE_DEPLOYMENT_MODE = mode;
};

describe('TGLA-101 — local/cloud auth hardening', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        appStorage.clear();
        await vaultService.resetVault();
        await userRepository.clearUser();
        setDeploymentMode('local');
    });

    afterEach(() => {
        delete process.env.VITE_DEPLOYMENT_MODE;
    });

    describe('authCapabilities', () => {
        it('separates local and cloud behaviours and flags a misconfigured cloud build', () => {
            expect(getAuthCapabilities('local', false)).toMatchObject({ serverMfa: false, backupCodes: true, passkeyMode: 'vault-prf', misconfigured: false });
            expect(getAuthCapabilities('cloud', true)).toMatchObject({ serverMfa: true, backupCodes: false, passkeyMode: 'supabase-passkey', misconfigured: false });
            expect(getAuthCapabilities('cloud', false).misconfigured).toBe(true);
        });
    });

    describe('mfaService — local mode', () => {
        it('enrolls, verifies and disables the vault TOTP with backup codes', async () => {
            await vaultService.setup(PASSWORD);
            expect((await mfaService.getTotpStatus()).enabled).toBe(false);

            const draft = await mfaService.startTotpEnrollment('user@example.com');
            expect(draft.plainBackupCodes.length).toBeGreaterThan(0);
            expect(draft.qrSvg).toContain('<svg');
            expect(await mfaService.confirmTotpEnrollment(draft, '000000')).toBe(false);
            expect(await mfaService.confirmTotpEnrollment(draft, await generateTotpCode(draft.secret))).toBe(true);
            expect((await mfaService.getTotpStatus()).enabled).toBe(true);

            expect(await mfaService.verifyTotp(draft.plainBackupCodes[0])).toBe(true);
            await mfaService.cancelTotpEnrollment(null);
            await mfaService.disableTotp();
            expect((await mfaService.getTotpStatus()).enabled).toBe(false);
        });
    });

    describe('mfaService — cloud mode (Supabase factor only)', () => {
        const provider = authService as unknown as Record<string, unknown>;
        const added = ['enrollMfaTotp', 'verifyMfaEnrollment', 'unenrollMfa', 'listMfaFactors', 'verifyTotpCode'];

        beforeEach(() => {
            setDeploymentMode('cloud');
        });

        afterEach(() => {
            added.forEach(name => {
                delete provider[name];
            });
        });

        it('uses the server factor and never the local TOTP', async () => {
            provider.listMfaFactors = vi.fn().mockResolvedValue([{ id: 'f-1', factor_type: 'totp' }]);
            provider.enrollMfaTotp = vi.fn().mockResolvedValue({ id: 'f-2', secret: 'S', uri: 'otpauth://totp/x' });
            provider.verifyMfaEnrollment = vi.fn().mockRejectedValueOnce(new Error('bad')).mockResolvedValue(undefined);
            provider.unenrollMfa = vi.fn().mockResolvedValue(undefined);
            provider.verifyTotpCode = vi.fn().mockRejectedValueOnce(new Error('bad')).mockResolvedValue(undefined);
            const localVerify = vi.spyOn(totpService, 'verify');

            expect(await mfaService.getTotpStatus()).toEqual({ enabled: true, factorId: 'f-1' });

            const draft = await mfaService.startTotpEnrollment('user@example.com');
            expect(draft.factorId).toBe('f-2');
            expect(draft.plainBackupCodes).toEqual([]);
            expect(await mfaService.confirmTotpEnrollment(draft, '111111')).toBe(false);
            expect(await mfaService.confirmTotpEnrollment(draft, '222222')).toBe(true);

            await mfaService.cancelTotpEnrollment(draft);
            expect(provider.unenrollMfa).toHaveBeenCalledWith('f-2');

            expect(await mfaService.verifyTotp('333333')).toBe(false);
            expect(await mfaService.verifyTotp('444444')).toBe(true);

            await mfaService.disableTotp();
            expect(provider.unenrollMfa).toHaveBeenCalledWith('f-1');
            expect(localVerify).not.toHaveBeenCalled();
        });

        it('refuses to enroll without an active session', async () => {
            provider.enrollMfaTotp = vi.fn().mockResolvedValue(null);
            await expect(mfaService.startTotpEnrollment('user@example.com')).rejects.toThrow(/session/i);
        });
    });

    describe('stepUpService', () => {
        it('asks local accounts for the password plus any local factor', async () => {
            await vaultService.setup(PASSWORD);
            expect(await stepUpService.getRequirements(user())).toEqual({
                password: true, secondFactor: [], recentSignInRequired: false, recentSignInSatisfied: true,
            });
            await enrollLocalTotp();
            await passkeyService.saveRecord({ id: CRED_ID, name: 'Key', createdAt: new Date().toISOString(), algorithm: -7 });
            expect((await stepUpService.getRequirements(user())).secondFactor).toEqual(['totp', 'passkey']);
        });

        it('requires a recent sign-in instead of a password for Google accounts', async () => {
            const google = user({ authProvider: 'google' });
            const requirements = await stepUpService.getRequirements(google);
            expect(requirements).toMatchObject({ password: false, recentSignInRequired: true, recentSignInSatisfied: false });
            await expect(stepUpService.verify(google, {})).rejects.toMatchObject({ name: 'RecentSignInRequiredError' });
            // Account deletion goes through Google by itself: no recent sign-in is required first
            expect((await stepUpService.getRequirements(google, { googleRoundTrip: true })).recentSignInRequired).toBe(false);
            await expect(stepUpService.verify(google, {}, { googleRoundTrip: true })).resolves.toBeUndefined();
        });

        it('delegates the proof to the provider re-authentication', async () => {
            const reauth = vi.spyOn(authService as LocalAuthProvider, 'reauthenticate').mockResolvedValue();
            await stepUpService.verify(user(), { password: PASSWORD, totpCode: '123456' });
            expect(reauth).toHaveBeenCalledWith({ password: PASSWORD, totpCode: '123456' });
        });
    });

    describe('LocalAuthProvider — passkeys and step-up', () => {
        it('unlocks the vault with a PRF passkey and requires a registered passkey as second factor', async () => {
            const local = new LocalAuthProvider();
            await local.setupLocalVault('Passkey User', PASSWORD);
            await vaultService.enrollPasskeyPrf(CRED_ID, 'Touch ID', PRF_SECRET, PASSWORD);
            await passkeyService.saveRecord({ id: CRED_ID, name: 'Touch ID', createdAt: new Date().toISOString(), algorithm: -7, prfEnabled: true });
            await vaultService.lock();

            mockWebAuthnGet(assertion());
            const passwordless = await local.signInWithPasskey();
            expect(passwordless.requiresTwoFactor).toBeUndefined();
            expect(passwordless.user.name).toBe('Passkey User');

            await vaultService.lock();
            const pending = await local.unlockLocalVault(PASSWORD);
            expect(pending.secondFactorMethods).toEqual(['passkey']);
            const done = await local.verifySecondFactorWithPasskey();
            expect(done.user.name).toBe('Passkey User');
        });

        it('rejects passkey sign-in without a vault and passkey 2FA without a pending sign-in', async () => {
            const local = new LocalAuthProvider();
            await expect(local.signInWithPasskey()).rejects.toThrow(/No vault/);
            await expect(local.verifySecondFactorWithPasskey()).rejects.toThrow(/expired/i);
            await expect(local.unlockLocalVault(PASSWORD)).rejects.toThrow(/No vault/);
        });

        it('re-authenticates with the vault password and the local factor', async () => {
            const local = new LocalAuthProvider();
            await local.setupLocalVault('Step Up', PASSWORD);
            await local.reauthenticate({ password: PASSWORD });
            await expect(local.reauthenticate({ password: 'wrong' })).rejects.toThrow(/master password/i);

            const { backup } = await enrollLocalTotp();
            await expect(local.reauthenticate({ password: PASSWORD })).rejects.toThrow(/two-factor/i);
            await local.reauthenticate({ password: PASSWORD, totpCode: backup });

            await totpService.disable();
            await passkeyService.saveRecord({ id: CRED_ID, name: 'Key', createdAt: new Date().toISOString(), algorithm: -7 });
            await expect(local.reauthenticate({ password: PASSWORD })).rejects.toThrow(/passkeys/i);
            mockWebAuthnGet(assertion(false));
            await local.reauthenticate({ password: PASSWORD, usePasskey: true });
        });
    });

    describe('SupabaseAuthProvider — passkeys, step-up and sessions', () => {
        let provider: SupabaseAuthProvider;

        beforeEach(() => {
            mockRemoteVault();
            provider = new SupabaseAuthProvider();
            vi.spyOn(supabaseClient, 'startPasskeyAuthentication').mockResolvedValue({ challenge_id: 'ch-1', options: { challenge: 'AQID', allowCredentials: [] } });
        });

        it('signs in with a Supabase passkey and unlocks the vault with the same gesture', async () => {
            await vaultService.setup(PASSWORD, { authProvider: 'email' });
            await vaultService.enrollPasskeyPrf(CRED_ID, 'Touch ID', PRF_SECRET, PASSWORD);
            await userRepository.saveUser(user());
            await vaultService.lock();
            mockWebAuthnGet(assertion());
            const verify = vi.spyOn(supabaseClient, 'verifyPasskeyAuthentication').mockResolvedValue(session());

            const result = await provider.signInWithPasskey();

            expect(result.user.id).toBe('sb-1');
            expect(vaultService.isUnlocked()).toBe(true);
            const sent = verify.mock.calls[0][1] as { clientExtensionResults: unknown };
            expect(sent.clientExtensionResults).toEqual({});
        });

        it('signs out a passkey that cannot unlock the vault on this device', async () => {
            await vaultService.setup(PASSWORD, { authProvider: 'email' });
            await vaultService.lock();
            mockWebAuthnGet(assertion(false));
            vi.spyOn(supabaseClient, 'verifyPasskeyAuthentication').mockResolvedValue(session());

            await expect(provider.signInWithPasskey()).rejects.toThrow(/cannot unlock/i);
            expect(supabaseClient.signOut).toHaveBeenCalled();
        });

        it('does NOT ask for TOTP after a passkey sign-in even when the account has TOTP enrolled', async () => {
            await vaultService.setup(PASSWORD, { authProvider: 'email' });
            await vaultService.enrollPasskeyPrf(CRED_ID, 'Touch ID', PRF_SECRET, PASSWORD);
            await userRepository.saveUser(user());
            await vaultService.lock();
            vi.spyOn(supabaseClient, 'listMfaFactors').mockResolvedValue([{ id: 'f-1', factor_type: 'totp', status: 'verified' }]);
            mockWebAuthnGet(assertion());
            vi.spyOn(supabaseClient, 'verifyPasskeyAuthentication').mockResolvedValue(session('sb-1', jwt({ aal: 'aal1', amr: [{ method: 'passkey' }] })));

            const result = await provider.signInWithPasskey();
            expect(result.requiresTwoFactor).toBeUndefined();
            expect(result.user.id).toBe('sb-1');
            expect(vaultService.isUnlocked()).toBe(true);
        });

        it('offers both TOTP and Passkey when signing in with password on an account with both enrolled', async () => {
            await vaultService.setup(PASSWORD, { authProvider: 'email' });
            await vaultService.lock();
            vi.spyOn(supabaseClient, 'signInWithPassword').mockResolvedValue(session('sb-1', jwt({ aal: 'aal1' })));
            vi.spyOn(supabaseClient, 'listMfaFactors').mockResolvedValue([{ id: 'f-1', factor_type: 'totp', status: 'verified' }]);
            vi.spyOn(supabaseClient, 'listPasskeys').mockResolvedValue([{ id: 'pk-1', created_at: '2026-10-01' }]);

            const pending = await provider.signIn('user@example.com', PASSWORD);
            expect(pending.requiresTwoFactor).toBe(true);
            expect(pending.secondFactorMethods).toEqual(['totp', 'passkey']);
        });

        it('confirms a password sign-in with a passkey of the same account only', async () => {
            await vaultService.setup(PASSWORD, { authProvider: 'email' });
            await vaultService.lock();
            vi.spyOn(supabaseClient, 'signInWithPassword').mockResolvedValue(session());
            vi.spyOn(supabaseClient, 'listPasskeys').mockResolvedValue([{ id: 'pk-1', created_at: '2026-10-01' }]);
            mockWebAuthnGet(assertion(false));

            const pending = await provider.signIn('user@example.com', PASSWORD);
            expect(pending.secondFactorMethods).toEqual(['passkey']);
            await expect(provider.verifySecondFactor('123456')).rejects.toThrow(/passkeys/i);

            const verify = vi.spyOn(supabaseClient, 'verifyPasskeyAuthentication').mockResolvedValueOnce(session('someone-else', 'tok-2'));
            await expect(provider.verifySecondFactorWithPasskey()).rejects.toThrow(/another account/i);

            verify.mockRejectedValueOnce(new Error('webauthn_verification_failed'));
            await expect(provider.verifySecondFactorWithPasskey()).rejects.toThrow(/could not be verified/i);

            verify.mockResolvedValueOnce(session('sb-1', 'tok-3'));
            const done = await provider.verifySecondFactorWithPasskey();
            expect(done.user.id).toBe('sb-1');
            expect(vaultService.isUnlocked()).toBe(true);
        });

        it('re-authenticates with a fresh password sign-in raised by TOTP or confirmed by passkey', async () => {
            (provider as unknown as { supabaseSession: unknown }).supabaseSession = session('sb-1', 'old-tok');
            const signIn = vi.spyOn(supabaseClient, 'signInWithPassword');

            signIn.mockRejectedValueOnce(new Error('Invalid login credentials'));
            await expect(provider.reauthenticate({ password: 'bad' })).rejects.toThrow(/master password/i);
            await expect(provider.reauthenticate({})).rejects.toThrow(/master password/i);

            signIn.mockResolvedValue(session('sb-1', 'fresh-tok'));
            vi.spyOn(supabaseClient, 'listMfaFactors').mockResolvedValue([{ id: 'f-1', factor_type: 'totp', status: 'verified' }]);
            vi.spyOn(supabaseClient, 'challengeMfaFactor').mockResolvedValue({ id: 'ch' });
            const verifyFactor = vi.spyOn(supabaseClient, 'verifyMfaFactor').mockRejectedValueOnce(new Error('bad code'));
            await expect(provider.reauthenticate({ password: PASSWORD, totpCode: '000000' })).rejects.toThrow(/two-factor/i);

            verifyFactor.mockResolvedValueOnce(session('sb-1', 'aal2-tok'));
            await provider.reauthenticate({ password: PASSWORD, totpCode: '123456' });
            expect(provider.getSupabaseAccessToken()).toBe('aal2-tok');
            expect(supabaseClient.signOut).toHaveBeenCalledWith('old-tok');

            vi.spyOn(supabaseClient, 'listMfaFactors').mockResolvedValue([]);
            mockWebAuthnGet(assertion(false));
            vi.spyOn(supabaseClient, 'verifyPasskeyAuthentication').mockResolvedValueOnce(session('sb-1', 'passkey-tok'));
            await provider.reauthenticate({ password: PASSWORD, usePasskey: true });
            expect(provider.getSupabaseAccessToken()).toBe('passkey-tok');
        });

        it('reads the recency of the session authentication from the JWT', () => {
            const now = Math.floor(Date.now() / 1000);
            expect(provider.isRecentlyAuthenticated(600)).toBe(false);
            (provider as unknown as { supabaseSession: unknown }).supabaseSession = session('sb-1', jwt({ aal: 'aal1', amr: [{ method: 'oauth', timestamp: now - 60 }] }));
            expect(provider.isRecentlyAuthenticated(600)).toBe(true);
            (provider as unknown as { supabaseSession: unknown }).supabaseSession = session('sb-1', jwt({ aal: 'aal1', amr: [{ method: 'oauth', timestamp: now - 3600 }] }));
            expect(provider.isRecentlyAuthenticated(600)).toBe(false);
        });

        it('refreshes an access token about to expire before using it', async () => {
            (provider as unknown as { supabaseSession: unknown }).supabaseSession = { ...session(), expiresAt: Date.now() + 10_000 };
            vi.spyOn(supabaseClient, 'refreshSession').mockResolvedValue(session('sb-1', 'refreshed-tok'));
            expect(await provider.getActiveAccessToken()).toBe('refreshed-tok');

            (provider as unknown as { supabaseSession: unknown }).supabaseSession = { ...session(), expiresAt: Date.now() + 10_000 };
            vi.spyOn(supabaseClient, 'refreshSession').mockRejectedValue(new SupabaseRequestError('Invalid Refresh Token', 400, 'refresh_token_not_found'));
            expect(await provider.getActiveAccessToken()).toBeUndefined();
        });

        it('keeps the session through a network failure, and refreshes only once at a time', async () => {
            const current = { ...session(), expiresAt: Date.now() + 10_000 };
            (provider as unknown as { supabaseSession: unknown }).supabaseSession = current;
            vi.spyOn(supabaseClient, 'refreshSession').mockRejectedValue(new TypeError('Failed to fetch'));
            expect(await provider.getActiveAccessToken()).toBe(current.accessToken);

            let release: (value: unknown) => void = () => undefined;
            vi.mocked(supabaseClient.refreshSession).mockClear();
            const refresh = vi.spyOn(supabaseClient, 'refreshSession').mockImplementation(
                () => new Promise(resolve => { release = () => resolve(session('sb-1', 'refreshed-once')); }) as never
            );
            const both = Promise.all([provider.getActiveAccessToken(), provider.getActiveAccessToken()]);
            release(undefined);
            expect(await both).toEqual(['refreshed-once', 'refreshed-once']);
            expect(refresh).toHaveBeenCalledTimes(1);
        });

        it('fails closed when the factor list cannot be read', async () => {
            vi.spyOn(supabaseClient, 'signInWithPassword').mockResolvedValue(session());
            vi.spyOn(supabaseClient, 'listMfaFactors').mockRejectedValue(new Error('network'));
            await expect(provider.signIn('user@example.com', PASSWORD)).rejects.toThrow('network');
        });
    });

    describe('passkeyAccountService — cloud mode', () => {
        const provider = authService as unknown as Record<string, unknown>;

        beforeEach(() => {
            setDeploymentMode('cloud');
            provider.getActiveAccessToken = vi.fn().mockResolvedValue('tok');
        });

        afterEach(() => {
            delete provider.getActiveAccessToken;
        });

        it('registers a Supabase passkey with a PRF slot, lists it merged with the server and removes it', async () => {
            await vaultService.setup(PASSWORD);
            // An account without TOTP: no step-up needed (the guard fails closed when this call errors)
            vi.spyOn(supabaseClient, 'listMfaFactors').mockResolvedValue([]);
            vi.spyOn(supabaseClient, 'startPasskeyRegistration').mockResolvedValue({
                challenge_id: 'reg-1',
                options: { challenge: 'AQID', rp: { name: 'GlassFolio', id: 'glassfolio.dev' }, user: { id: 'AQ', name: 'u', displayName: 'U' }, pubKeyCredParams: [] },
            });
            vi.spyOn(supabaseClient, 'verifyPasskeyRegistration').mockResolvedValue({ id: 'pk-1', created_at: '2026-10-25' });
            Object.defineProperty(navigator, 'credentials', {
                value: {
                    create: vi.fn().mockResolvedValue({
                        rawId: CRED_RAW.buffer,
                        id: 'BQYHCA',
                        type: 'public-key',
                        response: {
                            clientDataJSON: new Uint8Array([1]).buffer,
                            attestationObject: new Uint8Array([2]).buffer,
                            getTransports: () => ['internal'],
                        },
                        getClientExtensionResults: () => ({ prf: { enabled: true, results: { first: PRF_SECRET.buffer } } }),
                    }),
                    get: vi.fn(),
                },
                configurable: true,
            });

            await expect(passkeyAccountService.register({ user: { id: 'sb-1', email: 'u@x.io', name: 'U' }, label: 'Mac', masterPassword: 'wrong' }))
                .rejects.toThrow(/master password/i);
            const result = await passkeyAccountService.register({ user: { id: 'sb-1', email: 'u@x.io', name: 'U' }, label: 'Mac', masterPassword: PASSWORD });
            expect(result.unlocksVault).toBe(true);

            vi.spyOn(supabaseClient, 'listPasskeys').mockResolvedValue([
                { id: 'pk-1', created_at: '2026-10-25' },
                { id: 'pk-2', friendly_name: 'iPhone', created_at: '2026-10-20' },
            ]);
            const list = await passkeyAccountService.list();
            expect(list).toEqual([
                expect.objectContaining({ serverId: 'pk-1', credentialId: CRED_ID, unlocksVault: true, name: 'Mac' }),
                expect.objectContaining({ serverId: 'pk-2', name: 'iPhone', unlocksVault: false }),
            ]);

            const deleteSpy = vi.spyOn(supabaseClient, 'deletePasskey').mockResolvedValue();
            await passkeyAccountService.remove(list[0]);
            expect(deleteSpy).toHaveBeenCalledWith('tok', 'pk-1');
            expect(vaultService.hasPasskeySlot(CRED_ID)).toBe(false);
        });

        it('requires a live session to manage passkeys', async () => {
            provider.getActiveAccessToken = vi.fn().mockResolvedValue(undefined);
            await expect(passkeyAccountService.list()).rejects.toThrow(/session/i);
        });
    });
});
