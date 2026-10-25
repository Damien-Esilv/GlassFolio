/**
 * Authentication capabilities per deployment mode (TGLA-101).
 *
 * Local and cloud builds do not secure accounts the same way. UI and services read these flags
 * instead of branching on the mode themselves or falling back silently when a cloud call fails.
 *
 *  - local: the encrypted vault on this device is the account. No email, no server; TOTP lives
 *    inside the vault (with backup codes) and passkeys unlock the vault through WebAuthn PRF.
 *  - cloud: Supabase Auth owns the account. TOTP is a Supabase factor enforced by RLS (AAL2),
 *    passkeys are Supabase passkeys (passwordless sign-in) that also unlock the vault via PRF.
 */

import { DeploymentMode, getDeploymentMode } from '../../config/deployment';
import { isSupabaseConfigured } from '../supabase/supabaseClient';

export type PasskeyMode = 'vault-prf' | 'supabase-passkey';

export interface AuthCapabilities {
    mode: DeploymentMode;
    /** Cloud build without Supabase credentials: authentication cannot work and the UI must block. */
    misconfigured: boolean;
    /** Email ownership is verified (6-digit code + link) before an account exists. */
    emailVerification: boolean;
    /** TOTP is a server factor: sessions must reach AAL2, enforced by RLS. */
    serverMfa: boolean;
    /** Single-use TOTP backup codes (Supabase has no recovery codes: cloud users enroll two factors). */
    backupCodes: boolean;
    passkeyMode: PasskeyMode;
    /** Sensitive actions without a second factor are confirmed by an emailed one-time code. */
    reauthEmail: boolean;
    /** Supabase sends security notifications (password, email, factor changes). */
    securityEmails: boolean;
    accountDeletion: 'local-wipe' | 'server-rpc';
}

export const getAuthCapabilities = (
    mode: DeploymentMode = getDeploymentMode(),
    supabaseConfigured: boolean = isSupabaseConfigured()
): AuthCapabilities => {
    if (mode === 'cloud') {
        return {
            mode,
            misconfigured: !supabaseConfigured,
            emailVerification: true,
            serverMfa: true,
            backupCodes: false,
            passkeyMode: 'supabase-passkey',
            reauthEmail: true,
            securityEmails: true,
            accountDeletion: 'server-rpc',
        };
    }
    return {
        mode,
        misconfigured: false,
        emailVerification: false,
        serverMfa: false,
        backupCodes: true,
        passkeyMode: 'vault-prf',
        reauthEmail: false,
        securityEmails: false,
        accountDeletion: 'local-wipe',
    };
};
