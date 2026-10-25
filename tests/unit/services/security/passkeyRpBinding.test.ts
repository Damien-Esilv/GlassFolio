/**
 * Passkey RP ID binding (online vs local / Docker) and Safari single-gesture flow.
 *
 * Regression: the lock screen asked WebAuthn for the page host while cloud passkeys are created
 * with the Supabase RP ID, so Safari could not find the platform passkey and offered a security
 * key / QR code instead.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { passkeyService, isRpIdUsableHere, PasskeyError } from '../../../../src/services/security/passkeyService';
import { passkeyAccountService } from '../../../../src/services/security/passkeyAccountService';
import { vaultService } from '../../../../src/services/security/vaultService';
import { appStorage } from '../../../../src/services/storage/appStorage';

const PASSWORD = 'Strong-Vault-Secret-Key-2026!#';
const PRF_SECRET = new Uint8Array(32).fill(9);
const RAW_ID = new Uint8Array([9, 8, 7, 6]).buffer;
const CREDENTIAL_ID = 'CQgHBg==';

const attestation = (prf: Record<string, unknown>) => ({
    rawId: RAW_ID,
    id: 'CQgHBg',
    type: 'public-key',
    response: {
        clientDataJSON: new Uint8Array([1]).buffer,
        attestationObject: new Uint8Array([2]).buffer,
        getTransports: () => ['internal', 'hybrid'],
        getPublicKeyAlgorithm: () => -7,
    },
    getClientExtensionResults: () => prf,
});

const assertion = () => ({
    rawId: RAW_ID,
    id: 'CQgHBg',
    type: 'public-key',
    response: {
        clientDataJSON: new Uint8Array([1]).buffer,
        authenticatorData: new Uint8Array([2]).buffer,
        signature: new Uint8Array([3]).buffer,
        userHandle: null,
    },
    getClientExtensionResults: () => ({ prf: { results: { first: PRF_SECRET.buffer } } }),
});

const mockCredentials = (credentials: Record<string, unknown>) => {
    Object.defineProperty(navigator, 'credentials', { value: credentials, configurable: true });
};

const lastGetOptions = (get: ReturnType<typeof vi.fn>): PublicKeyCredentialRequestOptions =>
    (get.mock.calls[get.mock.calls.length - 1][0] as CredentialRequestOptions).publicKey as PublicKeyCredentialRequestOptions;

const registerLocalPasskey = async (get: ReturnType<typeof vi.fn>) => {
    mockCredentials({ create: vi.fn().mockResolvedValue(attestation({ prf: { results: { first: PRF_SECRET.buffer } } })), get });
    return passkeyAccountService.register({ user: { id: 'u1', email: 'a@b.c', name: 'A' }, label: 'Mac', masterPassword: PASSWORD });
};

describe('passkey RP ID binding', () => {
    beforeEach(async () => {
        appStorage.clear();
        vi.restoreAllMocks();
        await vaultService.resetVault();
        await vaultService.setup(PASSWORD);
    });

    it('accepts the host itself or a registrable parent domain only', () => {
        expect(isRpIdUsableHere('glassfolio.dev', 'app.glassfolio.dev')).toBe(true);
        expect(isRpIdUsableHere('app.glassfolio.dev', 'app.glassfolio.dev')).toBe(true);
        expect(isRpIdUsableHere('glassfolio.dev', 'localhost')).toBe(false);
        expect(isRpIdUsableHere('lassfolio.dev', 'app.glassfolio.dev')).toBe(false);
    });

    it('stores the RP ID and transports in the vault slot, and unlocks with them', async () => {
        const get = vi.fn().mockResolvedValue(assertion());
        expect((await registerLocalPasskey(get)).unlocksVault).toBe(true);
        expect(vaultService.listPasskeySlots()).toEqual([
            expect.objectContaining({ credentialId: CREDENTIAL_ID, rpId: 'localhost', transports: ['internal', 'hybrid'] }),
        ]);

        await vaultService.lock();
        await passkeyService.unlockVault();
        expect(vaultService.isUnlocked()).toBe(true);

        const options = lastGetOptions(get);
        expect(options.rpId).toBe('localhost');
        expect(options.allowCredentials?.[0].transports).toEqual(['internal', 'hybrid']);
    });

    it('uses the stored server RP ID instead of the page host (online passkeys)', async () => {
        const get = vi.fn().mockResolvedValue(assertion());
        await registerLocalPasskey(get);
        // Simulate a slot created by Supabase for the host itself (jsdom runs on localhost)
        vaultService.updatePasskeySlotMeta(CREDENTIAL_ID, { rpId: 'localhost' });
        await vaultService.lock();
        await passkeyService.unlockVault({ legacyRpId: 'ignored.example' });
        expect(lastGetOptions(get).rpId).toBe('localhost');
    });

    it('hides passkeys created for another site (online passkey on a local Docker install)', async () => {
        const get = vi.fn().mockResolvedValue(assertion());
        await registerLocalPasskey(get);
        vaultService.updatePasskeySlotMeta(CREDENTIAL_ID, { rpId: 'glassfolio.dev' });
        await vaultService.lock();

        expect(passkeyService.canUnlockVaultHere()).toBe(false);
        await expect(passkeyService.unlockVault()).rejects.toMatchObject({ code: 'NO_SLOT' });
    });

    it('resolves legacy slots (no stored RP ID) with the pre-fetched RP ID and remembers it', async () => {
        const get = vi.fn().mockResolvedValue(assertion());
        await registerLocalPasskey(get);
        // Legacy header: drop the stored metadata
        const header = JSON.parse(appStorage.getBacking().getItem('gf_vault_header') as string);
        header.wrappedKeys.passkeys = header.wrappedKeys.passkeys.map((p: Record<string, unknown>) => ({ ...p, rpId: undefined, transports: undefined }));
        appStorage.getBacking().setItem('gf_vault_header', JSON.stringify(header));
        await vaultService.lock();

        await passkeyService.unlockVault({ legacyRpId: 'localhost' });
        expect(lastGetOptions(get).rpId).toBe('localhost');
        expect(vaultService.listPasskeySlots()[0].rpId).toBe('localhost');
    });

    it('reports a dismissed prompt as CANCELLED', async () => {
        const get = vi.fn().mockResolvedValue(assertion());
        await registerLocalPasskey(get);
        await vaultService.lock();
        get.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
        const failure = await passkeyService.unlockVault().catch((e: unknown) => e);
        expect(failure).toBeInstanceOf(PasskeyError);
        expect((failure as PasskeyError).code).toBe('CANCELLED');
    });

    it('Safari: when the second prompt is refused, the vault unlock is enabled by a follow-up click', async () => {
        const get = vi.fn().mockRejectedValueOnce(Object.assign(new Error('gesture'), { name: 'NotAllowedError' }));
        mockCredentials({ create: vi.fn().mockResolvedValue(attestation({ prf: { enabled: true } })), get });

        const result = await passkeyAccountService.register({ user: { id: 'u1', email: 'a@b.c', name: 'A' }, label: 'Mac', masterPassword: PASSWORD });
        expect(result.unlocksVault).toBe(false);
        expect(result.pendingVaultUnlock).toMatchObject({ credentialId: CREDENTIAL_ID, rpId: 'localhost' });
        expect(vaultService.hasPasskeySlot()).toBe(false);

        get.mockResolvedValueOnce(assertion());
        expect(await passkeyAccountService.enableVaultUnlock({ ...result.pendingVaultUnlock!, masterPassword: PASSWORD })).toBe(true);
        expect(vaultService.listPasskeySlots()[0]).toMatchObject({ credentialId: CREDENTIAL_ID, rpId: 'localhost' });
    });
});
