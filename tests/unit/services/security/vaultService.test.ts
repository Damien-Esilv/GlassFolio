import { describe, it, expect, beforeEach } from 'vitest';
import { appStorage } from '../../../../src/services/storage/appStorage';
import { vaultService } from '../../../../src/services/security/vaultService';
import {
    InvalidVaultCredentialsError,
    VaultAlreadyInitializedError,
    VaultLockedError,
} from '../../../../src/services/security/vaultTypes';
import { VAULT_HEADER_KEY } from '../../../../src/services/storage/storageKeys';

describe('VaultService Lifecycle & Escape Hatch (TGLA-041)', () => {
    beforeEach(async () => {
        await vaultService.resetVault();
    });

    it('initializes vault, provides single-use recovery key, and enables encryption', async () => {
        expect(vaultService.isInitialized()).toBe(false);
        expect(vaultService.getStatus()).toBe('uninitialized');

        const { recoveryKey } = await vaultService.setup('StrongMasterPassword123!');

        expect(vaultService.isInitialized()).toBe(true);
        expect(vaultService.getStatus()).toBe('unlocked');
        expect(recoveryKey.split('-').length).toBe(8);

        // Header exists in backing storage
        const headerRaw = appStorage.getBacking().getItem(VAULT_HEADER_KEY);
        expect(headerRaw).not.toBeNull();
        expect(JSON.parse(headerRaw!).version).toBe(1);

        // Second setup attempt must fail
        await expect(vaultService.setup('AnotherPassword')).rejects.toBeInstanceOf(
            VaultAlreadyInitializedError
        );
    });

    it('locks vault, protects data, and prevents unauthorized writes', async () => {
        await vaultService.setup('MasterKey!');

        // Write sensitive record
        appStorage.setItem('glassfolio_accounts', JSON.stringify([{ id: 'acc-1', name: 'PEA' }]));

        // Lock vault
        await vaultService.lock();
        expect(vaultService.getStatus()).toBe('locked');

        // Sensitive reads return null when locked
        expect(appStorage.getItem('glassfolio_accounts')).toBeNull();

        // Sensitive writes throw VaultLockedError
        expect(() => {
            appStorage.setItem('glassfolio_accounts', 'new-val');
        }).toThrow(VaultLockedError);
    });

    it('unlocks with master password and restores full access to encrypted records', async () => {
        await vaultService.setup('CorrectPassword123');
        appStorage.setItem('glassfolio_user', JSON.stringify({ name: 'Alex' }));

        await vaultService.lock();
        expect(appStorage.getItem('glassfolio_user')).toBeNull();

        // Wrong password throws InvalidVaultCredentialsError
        await expect(vaultService.unlock('WrongPassword')).rejects.toBeInstanceOf(
            InvalidVaultCredentialsError
        );

        // Correct password unlocks
        await vaultService.unlock('CorrectPassword123');
        expect(vaultService.getStatus()).toBe('unlocked');
        expect(appStorage.getItem('glassfolio_user')).toContain('Alex');
    });

    it('unlocks with recovery key when master password is forgotten', async () => {
        const { recoveryKey } = await vaultService.setup('ForgottenPassword');
        appStorage.setItem('glassfolio_goals', JSON.stringify([{ title: 'Retirement' }]));

        await vaultService.lock();

        // Invalid recovery key throws
        await expect(vaultService.unlockWithRecoveryKey('AAAA-BBBB-CCCC-DDDD')).rejects.toBeInstanceOf(
            InvalidVaultCredentialsError
        );

        // Valid recovery key unlocks
        await vaultService.unlockWithRecoveryKey(recoveryKey);
        expect(vaultService.getStatus()).toBe('unlocked');
        expect(appStorage.getItem('glassfolio_goals')).toContain('Retirement');
    });

    it('changes master password without re-encrypting existing data', async () => {
        await vaultService.setup('InitialPassword');
        appStorage.setItem('glassfolio_achievements', JSON.stringify([{ id: 'ac1' }]));

        await vaultService.changePassword('InitialPassword', 'BrandNewPassword456');

        await vaultService.lock();

        // Old password no longer works
        await expect(vaultService.unlock('InitialPassword')).rejects.toBeInstanceOf(
            InvalidVaultCredentialsError
        );

        // New password unlocks and previous data is preserved
        await vaultService.unlock('BrandNewPassword456');
        expect(appStorage.getItem('glassfolio_achievements')).toContain('ac1');
    });

    it('executes vault reset escape hatch to wipe encrypted state and return to demo state', async () => {
        await vaultService.setup('MyPassword');
        appStorage.setItem('glassfolio_transactions', 'sensitive-data');

        await vaultService.resetVault();

        expect(vaultService.isInitialized()).toBe(false);
        expect(vaultService.getStatus()).toBe('uninitialized');
        expect(appStorage.getBacking().getItem(VAULT_HEADER_KEY)).toBeNull();
        expect(appStorage.getBacking().getItem('glassfolio_transactions')).toBeNull();
    });
});
