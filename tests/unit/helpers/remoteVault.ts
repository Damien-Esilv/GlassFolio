import { vi } from 'vitest';
import { vaultService } from '../../../src/services/security/vaultService';
import { getSyncedStorageProvider } from '../../../src/services/storage/storageFactory';
import { supabaseClient } from '../../../src/services/supabase/supabaseClient';

/**
 * Stubs the Supabase endpoints used by sign-in flows so they never reach the network: the
 * "remote" vault is whatever header this device already holds, and the account has no MFA
 * factor nor passkey unless a test overrides these spies.
 */
export const mockRemoteVault = (): void => {
    const synced = getSyncedStorageProvider();
    if (synced) {
        vi.spyOn(synced, 'pullFromRemote').mockImplementation(async () => ({
            ok: true,
            hasRemoteHeader: vaultService.isInitialized(),
        }));
    }
    vi.spyOn(supabaseClient, 'upsertVaultHeader').mockResolvedValue();
    vi.spyOn(supabaseClient, 'listMfaFactors').mockResolvedValue([]);
    vi.spyOn(supabaseClient, 'listPasskeys').mockResolvedValue([]);
    vi.spyOn(supabaseClient, 'signOut').mockResolvedValue();
};
