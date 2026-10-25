/**
 * Step-up authentication before sensitive actions (TGLA-101).
 *
 * What is asked depends on the deployment mode and on the account's factors:
 *  - local: the vault password, plus the local TOTP or a registered passkey when the account has one.
 *  - cloud (email account): the password through a fresh sign-in, plus TOTP when enrolled (the
 *    session must reach AAL2) or a Supabase passkey otherwise.
 *  - cloud (Google account): no password; the session must come from a recent Google sign-in.
 */

import { User } from '../../types/domain';
import { getAuthCapabilities } from './authCapabilities';
import { authService } from './authService';
import { SecondFactorMethod, StepUpProof } from './authTypes';
import { mfaService } from './mfaService';
import { passkeyAccountService } from './passkeyAccountService';

/** Matches the recency window enforced by the account deletion RPC (migration 0004). */
export const STEP_UP_MAX_AGE_SECONDS = 600;

export interface StepUpRequirements {
    password: boolean;
    /** The user proves one of these. Cloud accounts with TOTP must use it (AAL2). */
    secondFactor: SecondFactorMethod[];
    /** Google accounts: a recent sign-in replaces the password. */
    recentSignInRequired: boolean;
    recentSignInSatisfied: boolean;
}

export class RecentSignInRequiredError extends Error {
    constructor() {
        super('For your security, sign in again with Google, then retry within 10 minutes.');
        this.name = 'RecentSignInRequiredError';
    }
}

const isRecent = (): boolean => authService.isRecentlyAuthenticated?.(STEP_UP_MAX_AGE_SECONDS) ?? false;

export const stepUpService = {
    async getRequirements(user: User | null): Promise<StepUpRequirements> {
        if (user?.authProvider === 'google') {
            return { password: false, secondFactor: [], recentSignInRequired: true, recentSignInSatisfied: isRecent() };
        }

        const hasTotp = (await mfaService.getTotpStatus()).enabled;
        const hasPasskeys = (await passkeyAccountService.list().catch(() => [])).length > 0;
        let secondFactor: SecondFactorMethod[];
        if (getAuthCapabilities().serverMfa) {
            secondFactor = hasTotp ? ['totp'] : hasPasskeys ? ['passkey'] : [];
        } else {
            secondFactor = [...(hasTotp ? ['totp' as const] : []), ...(hasPasskeys ? ['passkey' as const] : [])];
        }
        return { password: true, secondFactor, recentSignInRequired: false, recentSignInSatisfied: true };
    },

    async verify(user: User | null, proof: StepUpProof): Promise<void> {
        if (user?.authProvider === 'google') {
            if (!isRecent()) throw new RecentSignInRequiredError();
            return;
        }
        if (!authService.reauthenticate) {
            throw new Error('Re-authentication is unavailable.');
        }
        await authService.reauthenticate(proof);
    },
};
