/**
 * Authentication types and contracts for GlassFolio (TGLA-047).
 */

import { User } from '../../types/domain';
import type { LegalAcceptance } from '../../config/legal';
import type { GoogleCallbackResult } from './googleOidcService';

/** Options shared by the sign-up entry points: anti-bot proof and the accepted legal documents version. */
export interface SignUpOptions {
    captchaToken?: string;
    legalAcceptance?: LegalAcceptance;
}

export interface PasswordRuleEvaluation {
    id: 'length' | 'uppercase' | 'lowercase' | 'digit' | 'symbol' | 'common';
    passed: boolean;
}

export interface PasswordValidationResult {
    /** Strength score from 0 (very weak) to 4 (very strong). */
    score: 0 | 1 | 2 | 3 | 4;
    rules: PasswordRuleEvaluation[];
    isValid: boolean;
    estimatedEntropyBits: number;
}

export interface AuthSession {
    id: string;
    userId: string;
    createdAt: string;
    lastSeenAt: string;
    userAgent: string;
    deviceLabel: string;
}

export type SecondFactorMethod = 'totp' | 'passkey';

export interface AuthResult {
    user: User;
    recoveryKey?: string;
    session: AuthSession;
    /** The sign-in is pending until one of `secondFactorMethods` is verified. */
    requiresTwoFactor?: boolean;
    secondFactorMethods?: SecondFactorMethod[];
    /** Cloud: the email is verified but the account's vault was never finalized. */
    requiresSignupCompletion?: boolean;
    tempUserId?: string;
}

export interface StepUpProof {
    password?: string;
    totpCode?: string;
    usePasskey?: boolean;
}

/** An email registration exists at Supabase but has no GlassFolio vault or session. */
export interface PendingSignup {
    email: string;
    name: string;
}

export type EmailTokenHashType = 'signup' | 'email_change' | 'recovery' | 'magiclink' | 'invite' | 'email';

export interface VerifyTokenHashResult {
    email: string;
    type: EmailTokenHashType;
    hasSession: boolean;
    pendingEmail?: string;
}

export interface IAuthProvider {
    signUp(email: string, password: string, name: string, options?: SignUpOptions): Promise<AuthResult>;
    signIn(email: string, password: string, options?: { captchaToken?: string }): Promise<AuthResult>;
    signInWithOAuth(provider: 'google' | 'apple'): Promise<void | AuthResult>;
    signOut(): Promise<void>;
    getCurrentUser(): Promise<User | null>;
    getFailedAttemptsCount(): number;
    getLockoutRemainingSeconds(): number;
    handleOAuthCallback?(): Promise<AuthResult | null>;
    setupLocalVault?(name: string, masterPassword: string, options?: { overwriteExisting?: boolean }): Promise<AuthResult>;
    unlockLocalVault?(masterPassword: string): Promise<AuthResult>;
    verifySecondFactor?(tokenOrCode: string): Promise<AuthResult>;
    /** Abandons a sign-in waiting for its second factor (locks the vault / ends the AAL1 session). */
    cancelSecondFactor?(): Promise<void>;
    changeEmail?(currentPassword: string, newEmail: string): Promise<void>;
    changePassword?(oldPassword: string, newPassword: string, options?: { nonce?: string; totpCode?: string }): Promise<void>;
    requestPasswordReset?(email: string, redirectTo?: string, options?: { captchaToken?: string }): Promise<void>;
    recoverPassword?(recoveryKey: string, newPassword: string): Promise<{ newRecoveryKey: string }>;
    resendEmailVerification?(email?: string, options?: { captchaToken?: string }): Promise<void>;
    verifyEmailOtp?(email: string, token: string): Promise<AuthResult>;
    beginSignupVerification?(email: string, password: string, name: string, options?: SignUpOptions): Promise<PendingSignup>;
    /** Creates the vault of a verified sign-up; arguments default to the in-memory sign-up draft. */
    preparePendingSignup?(email?: string, password?: string, name?: string): Promise<string>;
    completePendingSignup?(): Promise<AuthResult>;
    continueSignupAfterLinkVerification?(): Promise<string>;
    cancelPendingSignup?(): Promise<void>;
    getSignupDraftEmail?(): string | null;
    verifyEmailTokenHash?(tokenHash: string, type?: EmailTokenHashType): Promise<VerifyTokenHashResult>;
    /** Syncs the preferred language so branded auth emails are sent in it (Epic E25). */
    syncEmailLocale?(locale: string): Promise<void>;
    getSupabaseAccessToken?(): string | undefined;
    /** Cloud: the current access token, refreshed first if it is about to expire. */
    getActiveAccessToken?(): Promise<string | undefined>;
    /** Local: unlocks the vault through a PRF passkey. Cloud: Supabase passkey sign-in (+ PRF unlock). */
    signInWithPasskey?(): Promise<AuthResult>;
    /** Completes a pending sign-in with a passkey as second factor. */
    verifySecondFactorWithPasskey?(): Promise<AuthResult>;
    enrollMfaTotp?(friendlyName?: string): Promise<{ id: string; secret: string; uri?: string } | null>;
    verifyMfaEnrollment?(factorId: string, code: string): Promise<void>;
    /** Cloud: verifies a TOTP code against the Supabase factor and upgrades the session to AAL2. */
    verifyTotpCode?(code: string): Promise<void>;
    unenrollMfa?(factorId: string): Promise<void>;
    listMfaFactors?(): Promise<Array<{ id: string; factor_type: string; friendly_name?: string }>>;
    deleteAccountPermanently?(options: { password?: string; confirmationText?: string }): Promise<void>;
    /**
     * Step-up before a sensitive action. Local: vault password + local factor. Cloud: a fresh
     * sign-in with the password, raised to AAL2 by TOTP or confirmed by a Supabase passkey.
     */
    reauthenticate?(proof: StepUpProof): Promise<void>;
    /** Cloud: whether the session's newest authentication is younger than `maxAgeSeconds`. */
    isRecentlyAuthenticated?(maxAgeSeconds: number): boolean;
    /** Direct Google OIDC callback handling (Epic E25 / TGLA-170). */
    handleGoogleOidcCallback?(params: GoogleCallbackResult): Promise<AuthResult & { recoveryKey?: string }>;
    /** Goes through Google again for an action that needs the Drive key file (delete it, create a recovery key). */
    startGoogleReauth?(intent: 'delete-account' | 'recovery-key'): Promise<void>;
    /** After the Google round trip: removes the Drive key file, then deletes the account. */
    completeGoogleAccountDeletion?(params: GoogleCallbackResult): Promise<void>;
    /** After the Google round trip: creates the emergency recovery key of a Google vault and returns it once. */
    createGoogleRecoveryKey?(params: GoogleCallbackResult): Promise<string>;
}
