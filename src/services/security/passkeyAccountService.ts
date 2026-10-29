/**
 * Passkey lifecycle per deployment mode (TGLA-101, see authCapabilities.passkeyMode).
 *
 *  - local: the credential only lives on the device. It is useful only if it can unlock the vault,
 *    so authenticators without PRF are refused.
 *  - cloud: the credential is registered as a Supabase passkey (passwordless sign-in, verified
 *    server-side). A PRF slot is added when the authenticator supports it so the same gesture
 *    also unlocks the vault.
 * The local record keeps the credential id ↔ Supabase id mapping; it is synced inside the vault.
 */

import { getAuthCapabilities } from './authCapabilities';
import { authService } from './authService';
import { auditLogService } from './auditLogService';
import { passkeyService, PasskeyRecord } from './passkeyService';
import { vaultService } from './vaultService';
import { getSessionAssurance, supabaseClient } from '../supabase/supabaseClient';
import { getSyncedPublicLanguage } from '../storage/publicPreferencesSync';

export interface AccountPasskey {
    /** Stable key for lists: the credential id when known, else the Supabase id. */
    key: string;
    name: string;
    createdAt: string;
    credentialId?: string;
    serverId?: string;
    /** This passkey can unlock the vault (PRF slot present in the header). */
    unlocksVault: boolean;
}

const usesSupabasePasskeys = (): boolean => getAuthCapabilities().passkeyMode === 'supabase-passkey';

const requireAccessToken = async (): Promise<string> => {
    const token = await authService.getActiveAccessToken?.();
    if (!token) throw new Error('Your session expired. Sign in again to manage passkeys.');
    return token;
};

const fromRecord = (record: PasskeyRecord): AccountPasskey => ({
    key: record.id,
    name: record.name,
    createdAt: record.createdAt,
    credentialId: record.id,
    serverId: record.serverId,
    unlocksVault: vaultService.hasPasskeySlot(record.id),
});

export const passkeyAccountService = {
    async list(): Promise<AccountPasskey[]> {
        const records = await passkeyService.listPasskeys();
        if (!usesSupabasePasskeys()) return records.map(fromRecord);

        const serverPasskeys = await supabaseClient.listPasskeys(await requireAccessToken());
        return serverPasskeys.map(server => {
            const record = records.find(candidate => candidate.serverId === server.id);
            return record
                ? { ...fromRecord(record), name: record.name || server.friendly_name || record.name }
                : {
                    key: server.id,
                    name: server.friendly_name || server.id,
                    createdAt: server.created_at,
                    serverId: server.id,
                    unlocksVault: false,
                };
        });
    },

    /**
     * RP ID of the server passkeys (cloud mode). Cached after any ceremony; otherwise read from a
     * Supabase authentication challenge. Call it before the unlock click, never during it.
     */
    async resolveServerRpId(): Promise<string | undefined> {
        if (!usesSupabasePasskeys()) return undefined;
        const cached = passkeyService.getRememberedServerRpId();
        if (cached) return cached;
        try {
            const ceremony = await supabaseClient.startPasskeyAuthentication();
            const rpId = typeof ceremony.options.rpId === 'string' ? ceremony.options.rpId : undefined;
            passkeyService.rememberServerRpId(rpId);
            return rpId;
        } catch {
            return undefined;
        }
    },

    /**
     * Adds the PRF slot of an already registered passkey. Used when the browser did not return
     * the PRF output at creation and refused a second ceremony in the same gesture (Safari).
     */
    async enableVaultUnlock(params: { credentialId: string; label: string; masterPassword: string; rpId?: string; transports?: string[] }): Promise<boolean> {
        const { prfSecret } = await passkeyService.authenticate({
            rpId: params.rpId,
            allowCredentials: [{ id: params.credentialId, transports: params.transports }],
            withPrf: true,
        });
        if (!prfSecret) return false;
        await vaultService.enrollPasskeyPrf(params.credentialId, params.label, prfSecret, params.masterPassword, {
            rpId: params.rpId,
            transports: params.transports,
        });
        const records = await passkeyService.listPasskeys();
        const record = records.find(r => r.id === params.credentialId);
        if (record) await passkeyService.saveRecord({ ...record, prfEnabled: true });
        await auditLogService.record('passkey_registered', `Passkey "${params.label}" can now unlock the vault`);
        return true;
    },

    /** The master password wraps the vault key into the new PRF slot (it is never stored). */
    async register(params: {
        user: { id: string; email: string; name: string };
        label: string;
        masterPassword: string;
    }): Promise<{ unlocksVault: boolean; pendingVaultUnlock?: { credentialId: string; label: string; rpId: string; transports?: string[] } }> {
        if (!(await vaultService.verifyPassword(params.masterPassword))) {
            throw new Error('Invalid master password.');
        }

        const existing = await passkeyService.listPasskeys();
        let serverId: string | undefined;
        let attestation;
        if (usesSupabasePasskeys()) {
            const token = await requireAccessToken();
            // If the account has an active, verified TOTP factor, passkey enrollment requires aal2 step-up
            // Fail closed: if the factors cannot be read we cannot tell whether TOTP protects the account,
            // so enrolling a passkey (which the database treats as MFA-equivalent) must not go ahead.
            let factors;
            try {
                factors = await supabaseClient.listMfaFactors(token);
            } catch {
                throw new Error('MFA_STEP_UP_REQUIRED: Could not verify the account two-factor status. Try again.');
            }
            const hasVerifiedTotp = factors.some(f => f.factor_type === 'totp' && f.status === 'verified');
            if (hasVerifiedTotp) {
                const assurance = getSessionAssurance(token);
                if (assurance.aal !== 'aal2') {
                    throw new Error('MFA_STEP_UP_REQUIRED: Two-factor authentication (TOTP) is required to register a new passkey.');
                }
            }

            const ceremony = await supabaseClient.startPasskeyRegistration(token);
            attestation = await passkeyService.create({ user: params.user, serverOptions: ceremony.options });
            serverId = (await supabaseClient.verifyPasskeyRegistration(token, ceremony.challenge_id, attestation.credentialJson)).id;
            passkeyService.rememberServerRpId(attestation.rpId);
        } else {
            attestation = await passkeyService.create({ user: params.user, excludeCredentialIds: existing.map(record => record.id) });
            if (!attestation.prfEnabled) {
                throw new Error('This authenticator cannot unlock the vault (PRF extension unsupported).');
            }
        }

        // Some authenticators only return the PRF output on an assertion, not at creation. Safari
        // refuses that second ceremony within the same gesture: the user then confirms it with a click.
        const slotMeta = { rpId: attestation.rpId, transports: attestation.transports };
        let prfSecret = attestation.prfSecret;
        let pendingVaultUnlock: { credentialId: string; label: string; rpId: string; transports?: string[] } | undefined;
        if (!prfSecret && attestation.prfEnabled) {
            try {
                prfSecret = (await passkeyService.authenticate({
                    rpId: attestation.rpId,
                    allowCredentials: [{ id: attestation.credentialId, transports: attestation.transports }],
                    withPrf: true,
                })).prfSecret;
            } catch {
                pendingVaultUnlock = { credentialId: attestation.credentialId, label: params.label, ...slotMeta };
            }
        }
        if (prfSecret) {
            await vaultService.enrollPasskeyPrf(attestation.credentialId, params.label, prfSecret, params.masterPassword, slotMeta);
        } else if (!usesSupabasePasskeys() && !pendingVaultUnlock) {
            throw new Error('This authenticator cannot unlock the vault (PRF extension unsupported).');
        }

        await passkeyService.saveRecord({
            id: attestation.credentialId,
            name: params.label,
            createdAt: new Date().toISOString(),
            algorithm: attestation.algorithm,
            transports: attestation.transports,
            prfEnabled: Boolean(prfSecret),
            serverId,
        });
        await auditLogService.record('passkey_registered', `Passkey "${params.label}" registered`);
        if (usesSupabasePasskeys()) {
            const token = await authService.getActiveAccessToken?.();
            if (token) {
                const locale = getSyncedPublicLanguage();
                void supabaseClient.notifySecurityEvent(token, 'passkey_added', params.label, locale);
            }
        }
        return { unlocksVault: Boolean(prfSecret), pendingVaultUnlock };
    },

    async remove(passkey: AccountPasskey): Promise<void> {
        if (usesSupabasePasskeys() && passkey.serverId) {
            await supabaseClient.deletePasskey(await requireAccessToken(), passkey.serverId);
        }
        if (passkey.credentialId) {
            await passkeyService.deletePasskey(passkey.credentialId);
            vaultService.removePasskeyPrf(passkey.credentialId);
        }
        await auditLogService.record('passkey_deleted', `Passkey "${passkey.name}" removed`);
        if (usesSupabasePasskeys()) {
            const token = await authService.getActiveAccessToken?.();
            if (token) {
                const locale = getSyncedPublicLanguage();
                void supabaseClient.notifySecurityEvent(token, 'passkey_removed', passkey.name, locale);
            }
        }
    },
};
