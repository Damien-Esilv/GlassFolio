import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { googleOidcService } from '../../../../src/services/security/googleOidcService';
import { googleDriveVaultKeyService } from '../../../../src/services/security/googleDriveVaultKeyService';
import { vaultService } from '../../../../src/services/security/vaultService';
import { appStorage } from '../../../../src/services/storage/appStorage';
import { VAULT_HEADER_KEY } from '../../../../src/services/storage/storageKeys';
import { deviceVaultKeyStore } from '../../../../src/services/security/deviceVaultKeyStore';
import { toBase64 } from '../../../../src/services/security/crypto';

describe('Google Drive E2EE Split-Trust Architecture (Lot 1)', () => {
    beforeEach(() => {
        appStorage.getBacking().clear();
        sessionStorage.clear();
        vi.restoreAllMocks();
    });

    afterEach(async () => {
        await vaultService.lock();
        await deviceVaultKeyStore.clearAll();
    });

    describe('googleOidcService', () => {
        it('throws error when Google client ID is not configured', async () => {
            vi.spyOn(googleOidcService, 'getClientId').mockReturnValue('');
            await expect(googleOidcService.startCeremony()).rejects.toThrow('GOOGLE_CLIENT_ID_NOT_CONFIGURED');
        });

        it('prepares ceremony state in sessionStorage and builds direct Google auth URL', async () => {
            vi.spyOn(googleOidcService, 'getClientId').mockReturnValue('mock-client-id.apps.googleusercontent.com');
            const assignSpy = vi.fn();
            Object.defineProperty(window, 'location', {
                value: {
                    origin: 'http://localhost:3000',
                    assign: assignSpy,
                    pathname: '/auth/google-callback',
                    hash: '',
                },
                writable: true,
            });

            await googleOidcService.startCeremony();

            expect(assignSpy).toHaveBeenCalledTimes(1);
            const redirectUrl = assignSpy.mock.calls[0][0] as string;
            expect(redirectUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
            expect(redirectUrl).toContain('client_id=mock-client-id.apps.googleusercontent.com');
            expect(redirectUrl).toContain('response_type=id_token+token');
            expect(redirectUrl).toContain('drive.appdata');
            expect(redirectUrl).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fgoogle-callback');

            const storedRaw = sessionStorage.getItem('gf_google_oidc_ceremony');
            expect(storedRaw).toBeTruthy();
            const stored = JSON.parse(storedRaw!);
            expect(stored.state).toBeTruthy();
            expect(stored.rawNonce).toBeTruthy();
            expect(stored.createdAt).toBeGreaterThan(0);
        });

        it('parses and validates callback hash successfully', () => {
            const ceremony = {
                state: 'test-state-123',
                rawNonce: 'test-nonce-456',
                createdAt: Date.now(),
            };
            sessionStorage.setItem('gf_google_oidc_ceremony', JSON.stringify(ceremony));

            const hash = '#access_token=ya29.mock-token&id_token=mock-jwt&state=test-state-123&scope=openid+email+https://www.googleapis.com/auth/drive.appdata';
            const result = googleOidcService.parseCallbackHash(hash);

            expect(result.idToken).toBe('mock-jwt');
            expect(result.accessToken).toBe('ya29.mock-token');
            expect(result.rawNonce).toBe('test-nonce-456');
            expect(result.state).toBe('test-state-123');

            // Ceremony is single-use and immediately consumed
            expect(sessionStorage.getItem('gf_google_oidc_ceremony')).toBeNull();
        });

        it('rejects callback when state is invalid or ceremony expired', () => {
            const ceremony = {
                state: 'valid-state',
                rawNonce: 'test-nonce',
                createdAt: Date.now() - 20 * 60 * 1000, // 20 mins ago (expired)
            };
            sessionStorage.setItem('gf_google_oidc_ceremony', JSON.stringify(ceremony));

            const hash = '#access_token=tok&id_token=jwt&state=valid-state&scope=openid+https://www.googleapis.com/auth/drive.appdata';
            expect(() => googleOidcService.parseCallbackHash(hash)).toThrow('EXPIRED_CEREMONY_STATE');
        });

        it('rejects callback if drive.appdata scope was not granted', () => {
            const ceremony = {
                state: 'valid-state',
                rawNonce: 'test-nonce',
                createdAt: Date.now(),
            };
            sessionStorage.setItem('gf_google_oidc_ceremony', JSON.stringify(ceremony));

            const hash = '#access_token=tok&id_token=jwt&state=valid-state&scope=openid+email';
            expect(() => googleOidcService.parseCallbackHash(hash)).toThrow('MISSING_DRIVE_APPDATA_SCOPE');
        });
    });

    describe('googleDriveVaultKeyService', () => {
        it('reads root secret when key file exists in appDataFolder', async () => {
            const fakeSecret = new Uint8Array(32).fill(7);
            const fakeFileId = 'drive-file-id-42';

            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
                const url = String(input);
                if (url.includes('spaces=appDataFolder')) {
                    return new Response(JSON.stringify({ files: [{ id: fakeFileId, name: 'glassfolio-vault-key-v1.json' }] }), { status: 200 });
                }
                if (url.includes(fakeFileId)) {
                    return new Response(JSON.stringify({
                        version: 1,
                        keyId: 'key-id-99',
                        userId: 'u-1',
                        secretBase64: toBase64(fakeSecret),
                        createdAt: new Date().toISOString(),
                    }), { status: 200 });
                }
                return new Response('Not Found', { status: 404 });
            });

            const result = await googleDriveVaultKeyService.readRootSecret('fake-token', 'u-1');
            expect(result).toBeTruthy();
            expect(result?.keyId).toBe('key-id-99');
            expect(result?.driveSecret).toEqual(fakeSecret);
            fetchSpy.mockRestore();
        });

        it('creates a new key file when none exists in appDataFolder', async () => {
            let uploadedBody = '';
            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
                const url = String(input);
                if (url.includes('spaces=appDataFolder')) {
                    return new Response(JSON.stringify({ files: [] }), { status: 200 });
                }
                if (url.includes('uploadType=multipart')) {
                    if (init?.body && ArrayBuffer.isView(init.body)) {
                        uploadedBody = new TextDecoder().decode(init.body as Uint8Array);
                    } else {
                        uploadedBody = String(init?.body || '');
                    }
                    return new Response(JSON.stringify({ id: 'new-file-id' }), { status: 200 });
                }
                return new Response('Not Found', { status: 404 });
            });

            const result = await googleDriveVaultKeyService.getOrCreateRootSecret('fake-token', 'u-1');
            expect(result.driveSecret).toHaveLength(32);
            expect(result.keyId).toBeTruthy();
            expect(uploadedBody).toContain('glassfolio-vault-key-v1.json');
            fetchSpy.mockRestore();
        });
    });

    describe('vaultService Google Drive Split-Trust Lifecycle', () => {
        const driveSecret = new Uint8Array(32).fill(42);
        const keyId = 'test-drive-key-1';
        const userId = 'user-google-123';

        it('initializes a fresh Google Drive vault with recovery key and zero password slot', async () => {
            const setupRes = await vaultService.setupGoogleDriveVault(driveSecret, keyId, userId);
            expect(setupRes.recoveryKey).toMatch(/^([A-Z2-7]{4}-){12}[A-Z2-7]{4}$/);
            expect(vaultService.isUnlocked()).toBe(true);

            const header = vaultService.getVaultHeader();
            expect(header?.authProvider).toBe('google');
            expect(header?.wrappedKeys.password).toBeNull();
            expect(header?.wrappedKeys.googleDrive?.keyId).toBe(keyId);
            expect(header?.wrappedKeys.recovery).toBeTruthy();

            // Set sensitive data
            appStorage.setItem('glassfolio_accounts', JSON.stringify([{ id: 'acc-1', name: 'PEA Bourse' }]));
            await appStorage.getEncrypted()!.flush();

            // Lock and unlock via Google Drive secret
            await vaultService.lock();
            expect(vaultService.isUnlocked()).toBe(false);

            await vaultService.unlockGoogleDriveVault(driveSecret, userId);
            expect(vaultService.isUnlocked()).toBe(true);
            expect(appStorage.getItem('glassfolio_accounts')).toContain('PEA Bourse');
        });

        it('unlocks seamlessly using local device key (IndexedDB extractable: false)', async () => {
            await vaultService.setupGoogleDriveVault(driveSecret, keyId, userId);
            appStorage.setItem('glassfolio_positions', JSON.stringify([{ symbol: 'CW8.PA', qty: 10 }]));
            await appStorage.getEncrypted()!.flush();

            // Detach without clearing device store to simulate page refresh
            appStorage.detachEncrypted();
            (vaultService as any).setStatus('locked');

            const unlocked = await vaultService.unlockWithDeviceKey(userId);
            expect(unlocked).toBe(true);
            expect(vaultService.isUnlocked()).toBe(true);
            expect(appStorage.getItem('glassfolio_positions')).toContain('CW8.PA');
        });

        it('migrates legacy identity-derived Google vault with full DEK rotation', async () => {
            const legacySecret = `gf-oauth-e2ee-v1:${userId}:user@example.com`;
            // Set up legacy vault with weak identity secret
            await vaultService.setupOAuthVault(legacySecret);
            appStorage.setItem('glassfolio_transactions', JSON.stringify([{ id: 'tx-1', amount: 500 }]));
            await appStorage.getEncrypted()!.flush();

            expect(vaultService.isLegacyIdentityGoogleVault()).toBe(true);

            const oldHeader = vaultService.getVaultHeader();
            const oldWrappedDek = oldHeader?.wrappedKeys.password?.wrapped;

            // Run migration
            const migrateRes = await vaultService.migrateLegacyGoogleVault(
                legacySecret,
                driveSecret,
                keyId,
                userId
            );

            expect(migrateRes.recoveryKey).toBeTruthy();
            expect(vaultService.isUnlocked()).toBe(true);
            expect(vaultService.isLegacyIdentityGoogleVault()).toBe(false);

            const newHeader = vaultService.getVaultHeader();
            expect(newHeader?.wrappedKeys.password).toBeNull();
            expect(newHeader?.wrappedKeys.googleDrive?.keyId).toBe(keyId);
            expect(newHeader?.wrappedKeys.googleDrive?.wrapped).not.toBe(oldWrappedDek);

            // Data survived DEK rotation and is readable
            expect(appStorage.getItem('glassfolio_transactions')).toContain('tx-1');

            // Old legacy secret can no longer unlock
            await vaultService.lock();
            await expect(vaultService.unlockOAuthVault(legacySecret)).rejects.toThrow();

            // Drive secret unlocks successfully
            await vaultService.unlockGoogleDriveVault(driveSecret, userId);
            expect(vaultService.isUnlocked()).toBe(true);
        });
    });

    describe('optional recovery key', () => {
        const userId = 'u-opt';

        it('creates a vault without a recovery key when asked, then adds one that opens the vault', async () => {
            const driveSecret = crypto.getRandomValues(new Uint8Array(32));
            const res = await vaultService.setupGoogleDriveVault(driveSecret, 'k1', userId, { withRecoveryKey: false });
            expect(res.recoveryKey).toBeUndefined();
            expect(vaultService.hasRecoveryKey()).toBe(false);
            expect(vaultService.getVaultHeader()?.wrappedKeys.recovery).toBeNull();

            const recoveryKey = await vaultService.createRecoveryKeyFromDriveSecret(driveSecret);
            expect(recoveryKey).toMatch(/^[A-Z2-7-]{20,}$/);
            expect(vaultService.hasRecoveryKey()).toBe(true);

            await vaultService.lock();
            await vaultService.unlockWithRecoveryKey(recoveryKey);
            expect(vaultService.isUnlocked()).toBe(true);
        });

        it('keeps creating the recovery key by default', async () => {
            const res = await vaultService.setupGoogleDriveVault(crypto.getRandomValues(new Uint8Array(32)), 'k1', userId);
            expect(res.recoveryKey).toBeTruthy();
            expect(vaultService.hasRecoveryKey()).toBe(true);
        });

        it('refuses to add a recovery key with a secret that does not open the vault', async () => {
            await vaultService.setupGoogleDriveVault(crypto.getRandomValues(new Uint8Array(32)), 'k1', userId, { withRecoveryKey: false });
            await expect(vaultService.createRecoveryKeyFromDriveSecret(crypto.getRandomValues(new Uint8Array(32)))).rejects.toThrow();
            expect(vaultService.hasRecoveryKey()).toBe(false);
        });
    });
});
