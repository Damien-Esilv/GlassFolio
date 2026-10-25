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
import { supabaseClient } from '../supabase/supabaseClient';

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

    /** The master password wraps the vault key into the new PRF slot (it is never stored). */
    async register(params: {
        user: { id: string; email: string; name: string };
        label: string;
        masterPassword: string;
    }): Promise<{ unlocksVault: boolean }> {
        if (!(await vaultService.verifyPassword(params.masterPassword))) {
            throw new Error('Invalid master password.');
        }

        const existing = await passkeyService.listPasskeys();
        let serverId: string | undefined;
        let attestation;
        if (usesSupabasePasskeys()) {
            const token = await requireAccessToken();
            const ceremony = await supabaseClient.startPasskeyRegistration(token);
            attestation = await passkeyService.create({ user: params.user, serverOptions: ceremony.options });
            serverId = (await supabaseClient.verifyPasskeyRegistration(token, ceremony.challenge_id, attestation.credentialJson)).id;
        } else {
            attestation = await passkeyService.create({ user: params.user, excludeCredentialIds: existing.map(record => record.id) });
            if (!attestation.prfEnabled) {
                throw new Error('This authenticator cannot unlock the vault (PRF extension unsupported).');
            }
        }

        // Some authenticators only return the PRF output on an assertion, not at creation.
        let prfSecret = attestation.prfSecret;
        if (!prfSecret && attestation.prfEnabled) {
            prfSecret = (await passkeyService.authenticate({ allowCredentialIds: [attestation.credentialId], withPrf: true })).prfSecret;
        }
        if (prfSecret) {
            await vaultService.enrollPasskeyPrf(attestation.credentialId, params.label, prfSecret, params.masterPassword);
        } else if (!usesSupabasePasskeys()) {
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
                void supabaseClient.notifySecurityEvent(token, 'passkey_added', params.label);
            }
        }
        return { unlocksVault: Boolean(prfSecret) };
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
                void supabaseClient.notifySecurityEvent(token, 'passkey_removed', passkey.name);
            }
        }
    },
};
