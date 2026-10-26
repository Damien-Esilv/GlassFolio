/**
 * Second-factor (TOTP) service (TGLA-101).
 *
 * One entry point for TOTP whatever the deployment mode (see authCapabilities):
 *  - local: secret and backup codes inside the encrypted vault (totpService).
 *  - cloud: Supabase factor only. Its state lives on the server, so a new device or a cleared
 *    browser still enforces it, and removing it requires an AAL2 session.
 * No path silently falls back from one to the other.
 */

import { getAuthCapabilities } from './authCapabilities';
import { authService } from './authService';
import { auditLogService } from './auditLogService';
import { totpService } from './totpService';

export interface TotpStatus {
    enabled: boolean;
    /** Supabase factor id (cloud). */
    factorId?: string;
}

export interface TotpEnrollmentDraft {
    secret: string;
    uri: string;
    qrSvg: string;
    /** Supabase factor being enrolled (cloud). */
    factorId?: string;
    /** Local only: Supabase has no recovery codes. */
    plainBackupCodes: string[];
    hashedBackupCodes: string[];
}

const QR_OPTIONS = { margin: 4, bg: 'white', color: 'black' } as const;

const usesServerMfa = (): boolean => getAuthCapabilities().serverMfa;

export const mfaService = {
    async getTotpStatus(): Promise<TotpStatus> {
        if (usesServerMfa()) {
            const factors = (await authService.listMfaFactors?.()) ?? [];
            const totp = factors.find(factor => factor.factor_type === 'totp');
            return { enabled: Boolean(totp), factorId: totp?.id };
        }
        return { enabled: await totpService.isEnabled() };
    },

    async startTotpEnrollment(accountName: string): Promise<TotpEnrollmentDraft> {
        const { generateQrSvg } = await import('./qrCode');
        if (usesServerMfa()) {
            const factor = authService.enrollMfaTotp ? await authService.enrollMfaTotp() : null;
            if (!factor) throw new Error('An active session is required to enable two-factor authentication.');
            const uri = factor.uri || '';
            return {
                secret: factor.secret,
                uri,
                // Never inject server-provided markup: the QR is always drawn locally from the otpauth URI
                qrSvg: uri ? generateQrSvg(uri, QR_OPTIONS) : '',
                factorId: factor.id,
                plainBackupCodes: [],
                hashedBackupCodes: [],
            };
        }
        const draft = await totpService.initEnrollment(accountName);
        return { ...draft, qrSvg: generateQrSvg(draft.uri, QR_OPTIONS) };
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
        } else if (!(await totpService.confirmEnrollment(draft.secret, code.trim(), draft.hashedBackupCodes))) {
            return false;
        }
        await auditLogService.record('totp_enabled', 'Two-factor authentication enabled');
        return true;
    },

    /** Drops the unverified Supabase factor of an abandoned enrollment. */
    async cancelTotpEnrollment(draft: TotpEnrollmentDraft | null): Promise<void> {
        if (draft?.factorId && authService.unenrollMfa) {
            await authService.unenrollMfa(draft.factorId).catch(() => undefined);
        }
    },

    /** Fresh proof of possession. In cloud mode it also upgrades the session to AAL2. */
    async verifyTotp(code: string): Promise<boolean> {
        if (usesServerMfa()) {
            if (!authService.verifyTotpCode) return false;
            try {
                await authService.verifyTotpCode(code.trim());
                return true;
            } catch {
                return false;
            }
        }
        return totpService.verify(code.trim());
    },

    /**
     * Call after a step-up (stepUpService): it proved the factor and, in cloud mode, raised the
     * session to AAL2, which Supabase requires to remove a verified factor.
     */
    async disableTotp(): Promise<void> {
        if (usesServerMfa()) {
            const { factorId } = await this.getTotpStatus();
            if (factorId && authService.unenrollMfa) await authService.unenrollMfa(factorId);
        } else {
            await totpService.disable();
        }
        await auditLogService.record('totp_disabled', 'Two-factor authentication disabled after step-up confirmation');
    },
};
