import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLocalVaultStore } from '../../../../server/localVault.mjs';
import '../../../../src/services/storage/appStorage';
import { getLocalVaultProvider } from '../../../../src/services/storage/storageFactory';
import { LocalVaultClient } from '../../../../src/services/storage/LocalVaultStorageProvider';
import { LocalAuthProvider } from '../../../../src/services/security/authService';
import { vaultService } from '../../../../src/services/security/vaultService';
import { userRepository } from '../../../../src/services/repositories';

const silentLogger = { warn: () => undefined, error: () => undefined, log: () => undefined } as unknown as Pick<Console, 'warn' | 'error' | 'log'>;

describe('Local Multi-Vault Architecture & Demo Isolation (TGLA-218)', () => {
    let dir: string;
    let store: ReturnType<typeof createLocalVaultStore>;
    let auth: LocalAuthProvider;

    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-multivault-'));
        store = createLocalVaultStore({ dataDir: dir, logger: silentLogger });

        const localProvider = getLocalVaultProvider()!;
        const client: LocalVaultClient = {
            fetchSnapshot: async () => ({ status: 'ok', snapshot: store.snapshot() }),
            commitBatch: async (batch) => {
                store.apply(batch);
                return true;
            },
            mutateProfile: async (action) => {
                if (action.action === 'select') return { status: 'ok', snapshot: store.selectProfile(action.vaultId) };
                if (action.action === 'create') return { status: 'ok', snapshot: store.createProfile(action.name) };
                if (action.action === 'rename') return { status: 'ok', snapshot: store.renameProfile(action.vaultId, action.name) };
                if (action.action === 'delete') return { status: 'ok', snapshot: store.deleteProfile(action.vaultId) };
                return { status: 'error', message: 'Unknown action' };
            },
        };

        // Wire the singleton localVaultProvider to our in-memory localVaultStore
        (localProvider as unknown as { client: LocalVaultClient }).client = client;
        await localProvider.connect();
        vaultService.syncStatus();
        auth = new LocalAuthProvider();
    });

    afterEach(async () => {
        if (vaultService.isUnlocked()) {
            await vaultService.lock();
        }
        const localProvider = getLocalVaultProvider();
        localProvider?.dispose();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('creates multiple independent local vaults, switches between them, isolates demo mode, renames and deletes', async () => {
        const localProvider = getLocalVaultProvider()!;

        // 1. Create first vault ("Damien Perso") — reuses 'default' profile
        const res1 = await auth.setupLocalVault('Damien Perso', 'MasterPass!Alpha123');
        expect(res1.user.name).toBe('Damien Perso');
        expect(res1.recoveryKey).toBeDefined();
        expect(localProvider.getStatus().activeVaultId).toBe('default');
        expect(localProvider.getStatus().profiles).toHaveLength(1);
        expect(localProvider.getStatus().profiles[0]).toMatchObject({
            id: 'default',
            name: 'Damien Perso',
            initialized: true,
        });

        // 2. Create second vault ("Holding SCI") without ExistingVaultError or erasing the first vault
        const res2 = await auth.setupLocalVault('Holding SCI', 'MasterPass!Beta456');
        expect(res2.user.name).toBe('Holding SCI');
        const secondVaultId = localProvider.getStatus().activeVaultId;
        expect(secondVaultId).not.toBe('default');
        expect(localProvider.getStatus().profiles).toHaveLength(2);

        // 3. Explore demo account (1-click) — switches to isolated 'demo' profile without touching personal vaults
        const demoRes = await auth.signIn('demo@glassfolio.com', 'password');
        expect(demoRes.user.email).toBe('demo@glassfolio.com');
        expect(localProvider.getStatus().activeVaultId).toBe('demo');
        expect(vaultService.isDemoVault()).toBe(true);

        // Signing out of demo automatically switches back to the last personal vault
        await auth.signOut();
        expect(localProvider.getStatus().activeVaultId).toBe(secondVaultId);
        expect(vaultService.isUnlocked()).toBe(false);

        // 4. Switch to first vault ('default') and unlock with its own master password
        const unlocked1 = await auth.unlockLocalVault('MasterPass!Alpha123', 'default');
        expect(unlocked1.user.name).toBe('Damien Perso');
        expect(localProvider.getStatus().activeVaultId).toBe('default');

        // Wrong password for second vault is rejected when unlocking first vault
        await expect(auth.unlockLocalVault('MasterPass!Beta456', 'default')).rejects.toThrow(/Invalid master password/);

        // 5. Switch to second vault (secondVaultId) and unlock with its master password
        const unlocked2 = await auth.unlockLocalVault('MasterPass!Beta456', secondVaultId);
        expect(unlocked2.user.name).toBe('Holding SCI');
        expect((await userRepository.getUser())?.name).toBe('Holding SCI');

        // 6. Rename second vault in profile settings
        await localProvider.renameActiveProfile('Holding Familiale');
        expect(localProvider.getStatus().profiles.find(p => p.id === secondVaultId)?.name).toBe('Holding Familiale');

        // 7. Delete second vault permanently -> removes it and switches back to 'default'
        await auth.deleteAccountPermanently({ password: 'MasterPass!Beta456' });
        expect(localProvider.getStatus().profiles).toHaveLength(1);
        expect(localProvider.getStatus().activeVaultId).toBe('default');

        // First vault ('Damien Perso') is still intact and unlockable!
        const unlockedAgain = await auth.unlockLocalVault('MasterPass!Alpha123', 'default');
        expect(unlockedAgain.user.name).toBe('Damien Perso');
    });
});
