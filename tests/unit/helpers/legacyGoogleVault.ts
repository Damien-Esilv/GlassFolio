import { vaultService } from '../../../src/services/security/vaultService';

/** Marks that THIS tab started a Google sign-in: the only way a URL fragment token is accepted. */
export const startOAuthFlow = (): void => {
    sessionStorage.setItem('gf_oauth_pending', '1');
};

/**
 * Seeds a returning user of the legacy (identity-derived) Google vault, then locks it.
 * New Google vaults can no longer be created through the Supabase-hosted flow, so tests that
 * exercise that callback must start from an existing vault.
 */
export const seedLegacyGoogleVault = async (userId: string, email: string): Promise<void> => {
    await vaultService.resetVault();
    await vaultService.setupOAuthVault(`gf-oauth-e2ee-v1:${userId}:${email.trim().toLowerCase()}`);
    await vaultService.lock();
};
