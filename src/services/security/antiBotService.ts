import { Result, ok, err, ValidationError } from '../../types/result';
import { createPowChallenge, solveProofOfWork, verifyProofOfWork } from './crypto';
import { auditLogService } from './auditLogService';

export const MIN_SUBMISSION_DURATION_MS = 1500;

export interface AntiBotVerificationParams {
    honeypot: string;
    mountedAt: number;
    submittedAt?: number;
    powChallenge: string;
    powNonce: number;
    powHash: string;
    captchaToken?: string;
}

const getEnvVar = (key: string): string | undefined => {
    const metaEnv = typeof import.meta !== 'undefined'
        ? (import.meta as { env?: Record<string, string | undefined> }).env
        : undefined;
    const procEnv = typeof process !== 'undefined' ? process.env : undefined;
    return metaEnv?.[key] ?? procEnv?.[key];
};

export const getTurnstileSiteKey = (): string | null => {
    const raw = getEnvVar('VITE_TURNSTILE_SITE_KEY')?.trim();
    return raw || null;
};

export const isTurnstileEnabled = (): boolean => getTurnstileSiteKey() !== null;

export const antiBotService = {
    createChallenge(): string {
        return createPowChallenge();
    },

    async solveChallenge(challenge: string): Promise<{ nonce: number; hash: string }> {
        return solveProofOfWork(challenge, 3);
    },

    async verify(
        params: AntiBotVerificationParams,
        options?: { minDurationMs?: number; skipPow?: boolean }
    ): Promise<Result<boolean, ValidationError>> {
        const submittedAt = params.submittedAt ?? Date.now();
        const minDuration = options?.minDurationMs ?? MIN_SUBMISSION_DURATION_MS;

        // 1. Honeypot check
        if (params.honeypot && params.honeypot.trim().length > 0) {
            await auditLogService.record('antibot_blocked', 'Honeypot field was filled by automated agent', 'warning');
            return err(new ValidationError('Automated submission detected (honeypot triggered).', 'honeypot'));
        }

        // 2. Minimum submission duration check (< 1.5s is superhuman speed)
        const elapsed = submittedAt - params.mountedAt;
        if (elapsed < minDuration) {
            await auditLogService.record(
                'antibot_blocked',
                `Form submitted too fast (${elapsed}ms < ${minDuration}ms)`,
                'warning'
            );
            return err(new ValidationError(`Submission too fast (${elapsed}ms). Please take your time.`, 'timing'));
        }

        // 3. Proof-of-Work verification
        if (!options?.skipPow) {
            if (!params.powChallenge || params.powNonce === undefined || !params.powHash) {
                await auditLogService.record('antibot_blocked', 'Missing Proof-of-Work telemetry', 'warning');
                return err(new ValidationError('Missing Proof-of-Work challenge.', 'pow'));
            }

            const isPowValid = await verifyProofOfWork(
                params.powChallenge,
                params.powNonce,
                params.powHash,
                3
            );

            if (!isPowValid) {
                await auditLogService.record('antibot_blocked', 'Invalid Proof-of-Work solution', 'warning');
                return err(new ValidationError('Invalid Proof-of-Work solution.', 'pow'));
            }
        }

        return ok(true);
    },
};
