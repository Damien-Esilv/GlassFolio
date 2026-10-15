import { describe, it, expect, beforeEach } from 'vitest';
import { appStorage } from '../../../../src/services/storage/appStorage';
import { vaultService } from '../../../../src/services/security/vaultService';
import {
    InvalidVaultCredentialsError,
    VaultAlreadyInitializedError,
    VaultLockedError,
} from '../../../../src/services/security/vaultTypes';
import { VAULT_HEADER_KEY } from '../../../../src/services/storage/storageKeys';
import { parseEnvelope, randomBytes } from '../../../../src/services/security/crypto';

describe('VaultService Lifecycle, Migration & Key Rotation (TGLA-041)', () => {
    beforeEach(async () => {
        localStorage.clear();
        await vaultService.resetVault();
    });

    describe('Plaintext-to-Encrypted Migration', () => {
        it('migrates legacy plaintext records in localStorage to encrypted envelopes upon setup()', async () => {
            // Seed legacy unencrypted data directly in backing store before vault initialization
            const legacyTx = JSON.stringify([{ id: 'tx-legacy-1', amount: 3500, symbol: 'NVDA' }]);
            const legacyPos = JSON.stringify([{ symbol: 'NVDA', quantity: 15, avgPrice: 120 }]);
            
            appStorage.getBacking().setItem('glassfolio_transactions', legacyTx);
            appStorage.getBacking().setItem('glassfolio_positions', legacyPos);

            // Verify they are raw plaintext
            expect(appStorage.getBacking().getItem('glassfolio_transactions')).toBe(legacyTx);

            // Initialize vault
            const password = 'StrongMasterPassword2026!';
            await vaultService.setup(password);

            // Backing storage records must now be encrypted envelopes
            const rawTxAfter = appStorage.getBacking().getItem('glassfolio_transactions');
            const rawPosAfter = appStorage.getBacking().getItem('glassfolio_positions');

            expect(rawTxAfter).not.toContain('NVDA');
            expect(rawTxAfter).not.toContain('3500');
            expect(parseEnvelope(rawTxAfter)).not.toBeNull();
            expect(parseEnvelope(rawPosAfter)).not.toBeNull();

            // Decrypted reads through appStorage return original plaintexts
            expect(appStorage.getItem('glassfolio_transactions')).toBe(legacyTx);
            expect(appStorage.getItem('glassfolio_positions')).toBe(legacyPos);
        });
    });

    describe('Unlock Flows (Password, Recovery Key & Passkey PRF)', () => {
        it('supports unlocking via Master Password and verifies wrong password fails cleanly', async () => {
            const password = 'CorrectPassword123!';
            await vaultService.setup(password);
            appStorage.setItem('glassfolio_user', JSON.stringify({ name: 'Alex' }));
            await appStorage.getEncrypted()!.flush();

            await vaultService.lock();
            expect(vaultService.getStatus()).toBe('locked');
            expect(appStorage.getItem('glassfolio_user')).toBeNull();

            // Wrong password fails
            await expect(vaultService.unlock('WrongPassword!')).rejects.toBeInstanceOf(
                InvalidVaultCredentialsError
            );
            expect(vaultService.getStatus()).toBe('locked');

            // Correct password unlocks
            await vaultService.unlock(password);
            expect(vaultService.getStatus()).toBe('unlocked');
            expect(appStorage.getItem('glassfolio_user')).toContain('Alex');
        });

        it('supports unlocking via Recovery Key when master password is lost', async () => {
            const { recoveryKey } = await vaultService.setup('ForgottenPassword!');
            appStorage.setItem('glassfolio_goals', JSON.stringify([{ title: 'Financial Independence' }]));
            await appStorage.getEncrypted()!.flush();

            await vaultService.lock();

            // Invalid recovery key throws
            await expect(vaultService.unlockWithRecoveryKey('AAAA-BBBB-CCCC-DDDD')).rejects.toBeInstanceOf(
                InvalidVaultCredentialsError
            );

            // Valid recovery key unlocks
            await vaultService.unlockWithRecoveryKey(recoveryKey);
            expect(vaultService.getStatus()).toBe('unlocked');
            expect(appStorage.getItem('glassfolio_goals')).toContain('Financial Independence');
        });

        it('supports enrolling and unlocking with WebAuthn Passkey PRF secret', async () => {
            const password = 'MasterPassword2026!';
            await vaultService.setup(password);

            const credentialId = 'cred_test_webauthn_123';
            const prfSecret = randomBytes(32);

            // Enroll Passkey PRF wrapper
            await vaultService.enrollPasskeyPrf(credentialId, 'MacBook Touch ID', prfSecret, password);

            appStorage.setItem('glassfolio_accounts', JSON.stringify([{ id: 'acc-1', name: 'Livret A' }]));
            await appStorage.getEncrypted()!.flush();

            await vaultService.lock();
            expect(vaultService.getStatus()).toBe('locked');

            // Wrong PRF secret fails
            const wrongPrfSecret = randomBytes(32);
            await expect(vaultService.unlockWithPasskeyPrf(credentialId, wrongPrfSecret)).rejects.toBeInstanceOf(
                InvalidVaultCredentialsError
            );

            // Correct PRF secret unlocks
            await vaultService.unlockWithPasskeyPrf(credentialId, prfSecret);
            expect(vaultService.getStatus()).toBe('unlocked');
            expect(appStorage.getItem('glassfolio_accounts')).toContain('Livret A');
        });
    });

    describe('Key Rotation: changePassword vs rotateDek', () => {
        it('changePassword only re-wraps the DEK (existing ciphertexts remain unchanged)', async () => {
            const oldPassword = 'OldPassword123!';
            const newPassword = 'BrandNewPassword456!';
            await vaultService.setup(oldPassword);

            appStorage.setItem('glassfolio_transactions', JSON.stringify([{ id: 'tx-stable', amount: 999 }]));
            await appStorage.getEncrypted()!.flush();

            // Capture raw envelope in backing store
            const rawEnvelopeBefore = appStorage.getBacking().getItem('glassfolio_transactions');
            expect(rawEnvelopeBefore).not.toBeNull();

            // Change password
            await vaultService.changePassword(oldPassword, newPassword);

            // Backing store ciphertext for transactions must be IDENTICAL (only header changed)
            const rawEnvelopeAfter = appStorage.getBacking().getItem('glassfolio_transactions');
            expect(rawEnvelopeAfter).toBe(rawEnvelopeBefore);

            await vaultService.lock();

            // Old password fails
            await expect(vaultService.unlock(oldPassword)).rejects.toBeInstanceOf(InvalidVaultCredentialsError);

            // New password unlocks and reads data successfully
            await vaultService.unlock(newPassword);
            expect(appStorage.getItem('glassfolio_transactions')).toContain('tx-stable');
        });

        it('rotateDek generates a new DEK and re-encrypts all records with fresh IVs', async () => {
            const password = 'RotateMasterPassword!';
            await vaultService.setup(password);

            appStorage.setItem('glassfolio_transactions', JSON.stringify([{ id: 'tx-rotate', amount: 5000 }]));
            await appStorage.getEncrypted()!.flush();

            const rawEnvelopeBefore = appStorage.getBacking().getItem('glassfolio_transactions');
            const parsedBefore = parseEnvelope(rawEnvelopeBefore);

            // Rotate DEK
            await vaultService.rotateDek(password);

            const rawEnvelopeAfter = appStorage.getBacking().getItem('glassfolio_transactions');
            const parsedAfter = parseEnvelope(rawEnvelopeAfter);

            // Both IV and ciphertext MUST change because of new DEK and fresh IV
            expect(parsedAfter?.iv).not.toEqual(parsedBefore?.iv);
            expect(parsedAfter?.ct).not.toEqual(parsedBefore?.ct);

            // Decrypted content remains intact
            expect(appStorage.getItem('glassfolio_transactions')).toContain('tx-rotate');
        });
    });

    describe('Escape Hatch (Vault Reset)', () => {
        it('wipes all encrypted data and returns to uninitialized state', async () => {
            await vaultService.setup('SetupPassword!');
            appStorage.setItem('glassfolio_accounts', 'sensitive');

            await vaultService.resetVault();

            expect(vaultService.isInitialized()).toBe(false);
            expect(vaultService.getStatus()).toBe('uninitialized');
            expect(appStorage.getBacking().getItem(VAULT_HEADER_KEY)).toBeNull();
            expect(appStorage.getBacking().getItem('glassfolio_accounts')).toBeNull();
        });
    });

    describe('Auto-Lock & Status Monitoring', () => {
        it('configures auto-lock timeout, handles status subscriptions, and manages visibility listeners', async () => {
            const statuses: string[] = [];
            const unsubscribe = vaultService.subscribeStatus((st) => statuses.push(st));

            vaultService.setAutoLockMinutes(30);
            expect(vaultService.getAutoLockMinutes()).toBe(30);

            vaultService.setLockOnVisibilityHidden(true);

            await vaultService.setup('AutoLockPassword123!');
            expect(statuses).toContain('unlocked');

            // Trigger activity listeners (mousemove, keydown)
            window.dispatchEvent(new Event('mousemove'));
            window.dispatchEvent(new Event('keydown'));

            // Trigger visibility change
            Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
            await new Promise(r => setTimeout(r, 100));

            expect(vaultService.getStatus()).toBe('locked');
            expect(statuses).toContain('locked');

            unsubscribe();
        });
    });
});
