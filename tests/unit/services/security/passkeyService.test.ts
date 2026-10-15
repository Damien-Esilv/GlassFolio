import { describe, it, expect, beforeEach, vi } from 'vitest';
import { passkeyService, isPasskeySupported } from '../../../../src/services/security/passkeyService';
import { appStorage } from '../../../../src/services/storage/appStorage';

describe('passkeyService (WebAuthn & Dynamic Hostname Binding)', () => {
    beforeEach(() => {
        appStorage.clear();
        vi.restoreAllMocks();
    });

    it('detects platform authenticator availability', async () => {
        (window as unknown as { PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: () => Promise<boolean> } }).PublicKeyCredential = {
            isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
        };

        const supported = await isPasskeySupported();
        expect(supported).toBe(true);
    });

    it('dynamically binds rp.id to window.location.hostname for Local vs Cloud compatibility', async () => {
        const mockRawId = new Uint8Array([1, 2, 3, 4]);
        const mockCreate = vi.fn().mockResolvedValue({
            rawId: mockRawId.buffer,
            id: 'mock-id-base64',
            response: { getTransports: () => ['internal'] },
        });

        Object.defineProperty(navigator, 'credentials', {
            value: { create: mockCreate, get: vi.fn() },
            configurable: true,
        });

        // Set custom cloud hostname
        Object.defineProperty(window, 'location', {
            value: { hostname: 'app.glassfolio.com' },
            writable: true,
            configurable: true,
        });

        await passkeyService.registerPasskey(
            { id: 'usr-1', email: 'alex@glassfolio.com', name: 'Alex' },
            'TouchID Cloud'
        );

        expect(mockCreate).toHaveBeenCalledOnce();
        const callArgs = mockCreate.mock.calls[0][0] as CredentialCreationOptions;
        expect(callArgs.publicKey?.rp.id).toBe('app.glassfolio.com');
        expect(callArgs.publicKey?.rp.name).toBe('GlassFolio');
    });

    it('registers a passkey using navigator.credentials.create and persists in appStorage', async () => {
        const mockRawId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        const mockCreate = vi.fn().mockResolvedValue({
            rawId: mockRawId.buffer,
            id: 'mock-id-base64',
            response: {
                getTransports: () => ['internal'],
            },
        });

        Object.defineProperty(navigator, 'credentials', {
            value: { create: mockCreate, get: vi.fn() },
            configurable: true,
        });

        const passkey = await passkeyService.registerPasskey(
            { id: 'usr-123', email: 'test@glassfolio.com', name: 'Test User' },
            'My YubiKey'
        );

        expect(mockCreate).toHaveBeenCalledOnce();
        expect(passkey.name).toBe('My YubiKey');
        expect(passkey.id).toBeDefined();

        const stored = await passkeyService.listPasskeys();
        expect(stored).toHaveLength(1);
        expect(stored[0].name).toBe('My YubiKey');
    });

    it('authenticates with registered passkey via navigator.credentials.get', async () => {
        const mockRawId = new Uint8Array([9, 8, 7, 6]);
        const mockGet = vi.fn().mockResolvedValue({
            rawId: mockRawId.buffer,
            id: 'mock-auth-id',
        });

        Object.defineProperty(navigator, 'credentials', {
            value: { create: vi.fn(), get: mockGet },
            configurable: true,
        });

        const authResult = await passkeyService.authenticate(['aWRvbmU=', 'aWR0d28=']);
        expect(mockGet).toHaveBeenCalledOnce();
        expect(authResult.credentialId).toBeDefined();
    });

    it('deletes registered passkey from appStorage', async () => {
        const mockRawId = new Uint8Array([1, 2, 3]);
        Object.defineProperty(navigator, 'credentials', {
            value: {
                create: vi.fn().mockResolvedValue({ rawId: mockRawId.buffer }),
                get: vi.fn(),
            },
            configurable: true,
        });

        const passkey = await passkeyService.registerPasskey(
            { id: 'usr-1', email: 'a@b.c', name: 'A' },
            'Key to delete'
        );
        expect(await passkeyService.listPasskeys()).toHaveLength(1);

        await passkeyService.deletePasskey(passkey.id);
        expect(await passkeyService.listPasskeys()).toHaveLength(0);
    });

    it('throws when registration or authentication is cancelled', async () => {
        Object.defineProperty(navigator, 'credentials', {
            value: {
                create: vi.fn().mockResolvedValue(null),
                get: vi.fn().mockResolvedValue(null),
            },
            configurable: true,
        });

        await expect(
            passkeyService.registerPasskey({ id: 'u', email: 'e', name: 'n' })
        ).rejects.toThrow(/cancelled/i);

        await expect(
            passkeyService.authenticate(['invalid!base64!id'])
        ).rejects.toThrow(/cancelled/i);
    });

    it('handles corrupt JSON in passkey storage', async () => {
        appStorage.setItem('gf_passkeys', 'invalid-json{{{');
        expect(await passkeyService.listPasskeys()).toEqual([]);
    });

    it('handles unsupported WebAuthn environment gracefully', async () => {
        Object.defineProperty(navigator, 'credentials', {
            value: undefined,
            configurable: true,
        });

        await expect(
            passkeyService.registerPasskey({ id: 'u', email: 'e', name: 'n' })
        ).rejects.toThrow(/not supported/i);
    });
});
