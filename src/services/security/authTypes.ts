/**
 * Authentication types and contracts for GlassFolio (TGLA-047).
 */

import { User } from '../../types/domain';

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

export interface AuthResult {
    user: User;
    recoveryKey?: string;
    session: AuthSession;
    requiresTwoFactor?: boolean;
    tempUserId?: string;
}

export interface IAuthProvider {
    signUp(email: string, password: string, name: string, options?: { captchaToken?: string }): Promise<AuthResult>;
    signIn(email: string, password: string, options?: { captchaToken?: string }): Promise<AuthResult>;
    signInWithOAuth(provider: 'google' | 'apple'): Promise<void | AuthResult>;
    signOut(): Promise<void>;
    getCurrentUser(): Promise<User | null>;
    getFailedAttemptsCount(): number;
    getLockoutRemainingSeconds(): number;
    handleOAuthCallback?(): Promise<AuthResult | null>;
    setupLocalVault?(name: string, masterPassword: string): Promise<AuthResult>;
    unlockLocalVault?(masterPassword: string): Promise<AuthResult>;
    verifySecondFactor?(tokenOrCode: string): Promise<AuthResult>;
    changeEmail?(currentPassword: string, newEmail: string): Promise<void>;
    changePassword?(oldPassword: string, newPassword: string): Promise<void>;
    requestPasswordReset?(email: string, redirectTo?: string): Promise<void>;
    recoverPassword?(recoveryKey: string, newPassword: string): Promise<{ newRecoveryKey: string }>;
    resendEmailVerification?(email?: string): Promise<void>;
    verifyEmailOtp?(email: string, token: string): Promise<AuthResult>;
    deleteAccountPermanently?(options: { password?: string; confirmationText?: string }): Promise<void>;
}
