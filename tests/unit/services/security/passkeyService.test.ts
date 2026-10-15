import { describe, it, expect, beforeEach, vi } from 'vitest';
import { passkeyService, isPasskeySupported } from '../../../../src/services/security/passkeyService';
import { appStorage } from '../../../../src/services/storage/appStorage';

describe('passkeyService (WebAuthn)', () => {
    beforeEach(() => {
        appStorage.clear();
        vi.restoreAllMocks();
    });

    it('detects platform authenticator availability', async () => {
        // Mock PublicKeyCredential on window
        (window as unknown as { PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: () => Promise<boolean> } }).PublicKeyCredential = {
            isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
        };

        const supported = await isPasskeySupported();
        expect(supported).toBe(true);
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
});
