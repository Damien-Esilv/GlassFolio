import type { User } from '../../types/domain';
import { getDeploymentMode } from '../../config/deployment';

export const LOCAL_VAULT_SENTINEL_EMAIL = 'local@glassfolio.vault';

type AccountIdentityInput = Pick<Partial<User>, 'name' | 'email' | 'authProvider'> | null | undefined;

/** True when the user record belongs to a local encrypted vault rather than a cloud email/Google account. */
export function isLocalVaultUser(user: AccountIdentityInput): boolean {
    if (!user) return getDeploymentMode() === 'local';
    if (user.authProvider === 'local') return true;
    return user.email?.trim().toLowerCase() === LOCAL_VAULT_SENTINEL_EMAIL;
}

/**
 * Canonical account identifier for password managers, WebAuthn user.name, TOTP otpauth URIs,
 * and security exports.
 *
 * - Local vault accounts return the vault display name (never the internal sentinel email).
 * - Cloud accounts return the verified email address (or fallback if omitted).
 */
export function getAccountIdentifier(user: AccountIdentityInput, fallback?: string): string {
    if (isLocalVaultUser(user)) {
        return user?.name?.trim() || fallback?.trim() || 'Local Vault';
    }
    return user?.email?.trim() || user?.name?.trim() || fallback?.trim() || 'user';
}

/**
 * Best-effort Chromium Credential Management API hook so Google Password Manager / Edge offers
 * to save or update credentials on SPA form submissions without a full page reload.
 */
export function persistPasswordCredential(params: { id: string; name?: string; password: string }): void {
    if (typeof window === 'undefined' || !params.id || !params.password) return;
    const win = window as Window & {
        PasswordCredential?: new (data: { id: string; name?: string; password: string }) => Credential;
    };
    if (!win.PasswordCredential || !navigator.credentials?.store) return;
    try {
        const credential = new win.PasswordCredential({
            id: params.id,
            name: params.name || params.id,
            password: params.password,
        });
        void navigator.credentials.store(credential).catch(() => undefined);
    } catch {
        // Fallback to native browser form heuristics
    }
}
