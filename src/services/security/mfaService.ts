/**
 * Second-factor (TOTP) service (TGLA-101, multi-factor support).
 *
 * One entry point for TOTP whatever the deployment mode (see authCapabilities):
 *  - local: up to 5 named TOTP secrets and shared single-use backup codes inside the encrypted vault (totpService).
 *  - cloud: up to 5 named Supabase TOTP factors. Their state lives on the server, so a new device or
 *    a cleared browser still enforces them, and adding/removing a factor requires an AAL2 session.
 * No path silently falls back from one to the other.
 */

import { getAuthCapabilities } from './authCapabilities';
import { authService } from './authService';
import { auditLogService } from './auditLogService';
import { MAX_TOTP_FACTORS, totpService } from './totpService';
import { deduplicateLabel } from './passkeyAaguid';

export { MAX_TOTP_FACTORS };

export interface TotpFactorInfo {
    id: string;
    friendlyName: string;
    enrolledAt?: string;
}

export interface TotpStatus {
    enabled: boolean;
    /** First enrolled factor id (kept for backward compatibility with single-factor callers). */
    factorId?: string;
    factors: TotpFactorInfo[];
    maxFactors: number;
    /** Local only: remaining vault-wide emergency backup codes. */
    remainingBackupCodes?: number;
}

export interface TotpEnrollmentDraft {
    secret: string;
    uri: string;
    qrSvg: string;
    friendlyName: string;
    /** Supabase factor being enrolled (cloud). */
    factorId?: string;
    /** Local only: Supabase has no recovery codes. Empty when adding a 2nd+ local factor. */
    plainBackupCodes: string[];
    hashedBackupCodes: string[];
    /** True in local mode when vault-wide backup codes already exist from an earlier factor. */
    hasExistingBackupCodes?: boolean;
}

const QR_OPTIONS = { margin: 4, bg: 'white', color: 'black' } as const;

const usesServerMfa = (): boolean => getAuthCapabilities().serverMfa;

export const mfaService = {
    async getTotpStatus(): Promise<TotpStatus> {
        if (usesServerMfa()) {
            const rawFactors = (await authService.listMfaFactors?.()) ?? [];
            const totpFactors: TotpFactorInfo[] = rawFactors
                .filter(factor => factor.factor_type === 'totp')
                .map((factor, idx) => ({
                    id: factor.id,
                    friendlyName: factor.friendly_name?.trim() || (idx === 0 ? 'Authenticator' : `Authenticator (${idx + 1})`),
                    enrolledAt: factor.created_at,
                }));
            return {
                enabled: totpFactors.length > 0,
                factorId: totpFactors[0]?.id,
                factors: totpFactors,
                maxFactors: MAX_TOTP_FACTORS,
            };
        }
        const localFactors = await totpService.listFactors();
        const factors: TotpFactorInfo[] = localFactors.map(factor => ({
            id: factor.id,
            friendlyName: factor.friendlyName,
            enrolledAt: factor.enrolledAt,
        }));
        const remainingBackupCodes = factors.length > 0
            ? await totpService.getRemainingBackupCodesCount()
            : 0;
        return {
            enabled: factors.length > 0,
            factorId: factors[0]?.id,
            factors,
            maxFactors: MAX_TOTP_FACTORS,
            remainingBackupCodes,
        };
    },

    async startTotpEnrollment(accountName: string, friendlyName?: string): Promise<TotpEnrollmentDraft> {
        const status = await this.getTotpStatus();
        if (status.factors.length >= MAX_TOTP_FACTORS) {
            throw new Error('Maximum number of authenticator apps reached.');
        }

        const existingNames = status.factors.map(f => f.friendlyName);
        const trimmedName = friendlyName?.trim();
        if (trimmedName) {
            const lower = trimmedName.toLowerCase();
            if (existingNames.some(name => name.trim().toLowerCase() === lower)) {
                throw new Error('An authenticator app with this name already exists.');
            }
        }
        const resolvedName = trimmedName || deduplicateLabel('Authenticator', existingNames);

        const { generateQrSvg } = await import('./qrCode');
        if (usesServerMfa()) {
            const factor = authService.enrollMfaTotp ? await authService.enrollMfaTotp(resolvedName) : null;
            if (!factor) throw new Error('An active session is required to enable two-factor authentication.');
            const uri = factor.uri || '';
            return {
                secret: factor.secret,
                uri,
                // Never inject server-provided markup: the QR is always drawn locally from the otpauth URI
                qrSvg: uri ? generateQrSvg(uri, QR_OPTIONS) : '',
                friendlyName: resolvedName,
                factorId: factor.id,
                plainBackupCodes: [],
                hashedBackupCodes: [],
                hasExistingBackupCodes: false,
            };
        }
        const draft = await totpService.initEnrollment(accountName);
        return {
            ...draft,
            friendlyName: resolvedName,
            qrSvg: generateQrSvg(draft.uri, QR_OPTIONS),
            hasExistingBackupCodes: status.factors.length > 0,
        };
    },

    /** Returns false for a wrong code; the draft stays usable for another attempt. */
    async confirmTotpEnrollment(draft: TotpEnrollmentDraft, code: string): Promise<boolean> {
        if (usesServerMfa()) {
            if (!draft.factorId || !authService.verifyMfaEnrollment) return false;
            try {
                await authService.verifyMfaEnrollment(draft.factorId, code.trim());
            } catch {
                return false;
            }
        } else if (!(await totpService.confirmEnrollment(draft.secret, code.trim(), draft.hashedBackupCodes, draft.friendlyName))) {
            return false;
        }
        await auditLogService.record('totp_enabled', `Two-factor authentication enabled (${draft.friendlyName})`);
        return true;
    },

    /** Drops the unverified Supabase factor of an abandoned enrollment. */
    async cancelTotpEnrollment(draft: TotpEnrollmentDraft | null): Promise<void> {
        if (draft?.factorId && authService.unenrollMfa) {
            await authService.unenrollMfa(draft.factorId).catch(() => undefined);
        }
    },

    /** Fresh proof of possession. In cloud mode it also upgrades the session to AAL2. */
    async verifyTotp(code: string, factorId?: string): Promise<boolean> {
        if (usesServerMfa()) {
            if (!authService.verifyTotpCode) return false;
            try {
                await authService.verifyTotpCode(code.trim(), factorId);
                return true;
            } catch {
                return false;
            }
        }
        return totpService.verify(code.trim(), factorId);
    },

    /**
     * Removes a single enrolled TOTP factor (or the first/only factor when omitted).
     * Call after a step-up (stepUpService): in cloud mode it raises the session to AAL2,
     * which Supabase requires to remove a verified factor.
     */
    async removeTotpFactor(factorId?: string): Promise<void> {
        const status = await this.getTotpStatus();
        const target = factorId
            ? status.factors.find(f => f.id === factorId)
            : status.factors[0];
        if (!target) return;

        if (usesServerMfa()) {
            if (authService.unenrollMfa) await authService.unenrollMfa(target.id);
        } else {
            await totpService.removeFactor(target.id);
        }
        await auditLogService.record(
            'totp_disabled',
            `Two-factor authentication factor "${target.friendlyName}" removed after step-up confirmation`
        );
    },

    /** Backward-compatible alias for removing a TOTP factor (or disabling when only one exists). */
    async disableTotp(factorId?: string): Promise<void> {
        if (!factorId && !usesServerMfa()) {
            await totpService.disable();
            await auditLogService.record('totp_disabled', 'Two-factor authentication disabled after step-up confirmation');
            return;
        }
        await this.removeTotpFactor(factorId);
    },

    /** Local only: renames an enrolled TOTP factor inside the encrypted vault. */
    async renameLocalTotpFactor(factorId: string, newName: string): Promise<void> {
        if (usesServerMfa()) return;
        await totpService.renameFactor(factorId, newName);
    },

    /** Local only: generates 10 fresh vault-wide backup codes (call after step-up). */
    async regenerateLocalBackupCodes(): Promise<string[]> {
        if (usesServerMfa()) {
            throw new Error('Backup codes are only available in local vault mode.');
        }
        const codes = await totpService.regenerateBackupCodes();
        await auditLogService.record('totp_enabled', 'Emergency 2FA backup codes regenerated');
        return codes;
    },
};
