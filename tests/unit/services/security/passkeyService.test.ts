import { describe, it, expect, beforeEach, vi } from 'vitest';
import { passkeyService, isPasskeySupported } from '../../../../src/services/security/passkeyService';
import { passkeyAccountService } from '../../../../src/services/security/passkeyAccountService';
import { vaultService } from '../../../../src/services/security/vaultService';
import { appStorage } from '../../../../src/services/storage/appStorage';

const PASSWORD = 'Strong-Vault-Secret-Key-2026!#';

const attestationResponse = (algorithm = -7) => ({
    clientDataJSON: new Uint8Array([1]).buffer,
    attestationObject: new Uint8Array([2]).buffer,
    getTransports: () => ['internal'],
    getPublicKeyAlgorithm: () => algorithm,
});

const assertionResponse = () => ({
    clientDataJSON: new Uint8Array([1]).buffer,
    authenticatorData: new Uint8Array([2]).buffer,
    signature: new Uint8Array([3]).buffer,
    userHandle: null,
});

const mockCredentials = (credentials: Partial<CredentialsContainer> | undefined) => {
    Object.defineProperty(navigator, 'credentials', { value: credentials, configurable: true });
};

describe('passkeyService (WebAuthn & Dynamic Hostname Binding)', () => {
    beforeEach(async () => {
        appStorage.clear();
        vi.restoreAllMocks();
        await vaultService.resetVault();
    });

    it('detects platform authenticator availability', async () => {
        (window as unknown as { PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: () => Promise<boolean> } }).PublicKeyCredential = {
            isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
        };

        const supported = await isPasskeySupported();
        expect(supported).toBe(true);
    });

    it('creates local credentials bound to the hostname, with user verification and PRF', async () => {
        const mockCreate = vi.fn().mockResolvedValue({
            rawId: new Uint8Array([1, 2, 3, 4]).buffer,
            id: 'AQIDBA',
            type: 'public-key',
            response: attestationResponse(-257),
            getClientExtensionResults: () => ({ prf: { enabled: true } }),
        });
        mockCredentials({ create: mockCreate, get: vi.fn() });
        Object.defineProperty(window, 'location', {
            value: { hostname: 'app.glassfolio.com' },
            writable: true,
            configurable: true,
        });

        const attestation = await passkeyService.create({
            user: { id: 'usr-1', email: 'alex@glassfolio.com', name: 'Alex' },
            excludeCredentialIds: ['CQgHBg=='],
        });

        const publicKey = (mockCreate.mock.calls[0][0] as CredentialCreationOptions).publicKey!;
        expect(publicKey.rp.id).toBe('app.glassfolio.com');
        expect(publicKey.rp.name).toBe('GlassFolio');
        expect(publicKey.authenticatorSelection?.userVerification).toBe('required');
        expect(publicKey.excludeCredentials).toHaveLength(1);
        expect((publicKey.extensions as { prf?: unknown }).prf).toBeDefined();
        expect(attestation.credentialId).toBe('AQIDBA==');
        expect(attestation.algorithm).toBe(-257);
        expect(attestation.prfEnabled).toBe(true);
        expect(attestation.credentialJson.clientExtensionResults).toEqual({});
    });

    it('decodes Supabase options for cloud ceremonies', async () => {
        const mockGet = vi.fn().mockResolvedValue({
            rawId: new Uint8Array([9, 8, 7, 6]).buffer,
            id: 'CQgHBg',
            type: 'public-key',
            response: assertionResponse(),
            getClientExtensionResults: () => ({}),
        });
        mockCredentials({ create: vi.fn(), get: mockGet });

        const result = await passkeyService.authenticate({
            serverOptions: { challenge: 'AQID', rpId: 'glassfolio.dev', allowCredentials: [] },
        });

        const publicKey = (mockGet.mock.calls[0][0] as CredentialRequestOptions).publicKey!;
        expect(Array.from(publicKey.challenge as Uint8Array)).toEqual([1, 2, 3]);
        expect(publicKey.rpId).toBe('glassfolio.dev');
        expect(publicKey.userVerification).toBe('required');
        expect(result.credentialJson.response).toMatchObject({ signature: 'Aw' });
    });

    it('stores and deletes passkey records', async () => {
        await passkeyService.saveRecord({ id: 'cred-1', name: 'Key', createdAt: new Date().toISOString(), algorithm: -7 });
        expect(await passkeyService.listPasskeys()).toHaveLength(1);

        await passkeyService.deletePasskey('cred-1');
        expect(await passkeyService.listPasskeys()).toHaveLength(0);
    });

    it('throws when registration or authentication is cancelled', async () => {
        mockCredentials({
            create: vi.fn().mockResolvedValue(null),
            get: vi.fn().mockResolvedValue(null),
        });

        await expect(passkeyService.create({ user: { id: 'u', email: 'e', name: 'n' } })).rejects.toThrow(/cancelled/i);
        await expect(passkeyService.authenticate({ allowCredentialIds: ['invalid!base64!id'] })).rejects.toThrow(/cancelled/i);
    });

    it('handles corrupt JSON in passkey storage', async () => {
        appStorage.setItem('glassfolio_security_passkeys', 'invalid-json{{{');
        expect(await passkeyService.listPasskeys()).toEqual([]);
    });

    it('handles unsupported WebAuthn environment gracefully', async () => {
        mockCredentials(undefined);
        await expect(passkeyService.create({ user: { id: 'u', email: 'e', name: 'n' } })).rejects.toThrow(/not supported/i);
    });

    describe('local passkey lifecycle (passkeyAccountService + vault PRF slot)', () => {
        it('refuses an authenticator that cannot unlock the vault', async () => {
            await vaultService.setup(PASSWORD);
            mockCredentials({
                create: vi.fn().mockResolvedValue({
                    rawId: new Uint8Array([1, 2]).buffer,
                    id: 'AQI',
                    type: 'public-key',
                    response: attestationResponse(),
                    getClientExtensionResults: () => ({}),
                }),
                get: vi.fn(),
            });

            await expect(passkeyAccountService.register({
                user: { id: 'u1', email: 'a@b.c', name: 'A' },
                label: 'No PRF',
                masterPassword: PASSWORD,
            })).rejects.toThrow(/PRF/i);
            expect(await passkeyService.listPasskeys()).toHaveLength(0);
        });

        it('enrolls a PRF slot that survives a password change and unlocks the vault', async () => {
            await vaultService.setup(PASSWORD);
            const prfSecret = new Uint8Array(32).fill(7);
            const rawId = new Uint8Array([5, 6, 7, 8]).buffer;
            const assertion = {
                rawId,
                id: 'BQYHCA',
                type: 'public-key',
                response: assertionResponse(),
                getClientExtensionResults: () => ({ prf: { results: { first: prfSecret.buffer } } }),
            };
            mockCredentials({
                create: vi.fn().mockResolvedValue({
                    rawId,
                    id: 'BQYHCA',
                    type: 'public-key',
                    response: attestationResponse(),
                    getClientExtensionResults: () => ({ prf: { enabled: true } }),
                }),
                get: vi.fn().mockResolvedValue(assertion),
            });

            const { unlocksVault } = await passkeyAccountService.register({
                user: { id: 'u1', email: 'a@b.c', name: 'A' },
                label: 'Touch ID',
                masterPassword: PASSWORD,
            });
            expect(unlocksVault).toBe(true);
            expect(vaultService.hasPasskeySlot('BQYHCA==')).toBe(true);

            await vaultService.changePassword(PASSWORD, 'Another-Vault-Secret-Key-2026!#');
            await vaultService.lock();

            await passkeyService.unlockVault();
            expect(vaultService.isUnlocked()).toBe(true);

            const [passkey] = await passkeyAccountService.list();
            await passkeyAccountService.remove(passkey);
            expect(vaultService.hasPasskeySlot()).toBe(false);
            expect(await passkeyService.listPasskeys()).toHaveLength(0);
        });
    });
});
