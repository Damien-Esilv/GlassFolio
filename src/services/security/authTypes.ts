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
}

export interface IAuthProvider {
    signUp(email: string, password: string, name: string): Promise<AuthResult>;
    signIn(email: string, password: string): Promise<AuthResult>;
    signInWithOAuth(provider: 'google' | 'apple'): Promise<never>;
    signOut(): Promise<void>;
    getCurrentUser(): Promise<User | null>;
    getFailedAttemptsCount(): number;
    getLockoutRemainingSeconds(): number;
}
