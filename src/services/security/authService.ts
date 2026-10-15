/**
 * Unified Authentication Service (TGLA-047).
 *
 * Implements:
 *   - LocalAuthProvider (zero-knowledge local mode, PBKDF2/HKDF dual-key unlock, lockout protection).
 *   - OAuth stubs (Google / Apple Sign-In).
 *   - Factory keyed on VITE_DEPLOYMENT_MODE.
 */

import { getDeploymentMode } from '../../config/deployment';
import { User } from '../../types/domain';
import { delay } from '../db';
import { userRepository } from '../repositories';
import { AuthResult, AuthSession, IAuthProvider } from './authTypes';
import { evaluatePassword } from './passwordValidator';
import { vaultService } from './vaultService';

const MAX_UNLOCKED_ATTEMPTS = 5;
const BASE_LOCKOUT_SECONDS = 30;

export class LocalAuthProvider implements IAuthProvider {
    private failedAttempts = 0;
    private lockoutUntil: number | null = null;
    private currentSession: AuthSession | null = null;

    public getFailedAttemptsCount(): number {
        return this.failedAttempts;
    }

    public getLockoutRemainingSeconds(): number {
        if (!this.lockoutUntil) return 0;
        const diff = Math.ceil((this.lockoutUntil - Date.now()) / 1000);
        if (diff <= 0) {
            this.lockoutUntil = null;
            return 0;
        }
        return diff;
    }

    private checkLockout(): void {
        const remaining = this.getLockoutRemainingSeconds();
        if (remaining > 0) {
            throw new Error(`Account temporarily locked. Please wait ${remaining} seconds.`);
        }
    }

    private registerFailure(): void {
        this.failedAttempts++;
        if (this.failedAttempts >= MAX_UNLOCKED_ATTEMPTS) {
            const multiplier = Math.pow(2, this.failedAttempts - MAX_UNLOCKED_ATTEMPTS);
            const lockoutDurationSec = BASE_LOCKOUT_SECONDS * multiplier;
            this.lockoutUntil = Date.now() + lockoutDurationSec * 1000;
        }
    }

    private resetFailures(): void {
        this.failedAttempts = 0;
        this.lockoutUntil = null;
    }

    private createSession(userId: string): AuthSession {
        const session: AuthSession = {
            id: `sess-${Math.random().toString(36).substr(2, 9)}`,
            userId,
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node/Test',
            deviceLabel: 'Current Device',
        };
        this.currentSession = session;
        return session;
    }

    public async signUp(email: string, password: string, name: string): Promise<AuthResult> {
        await delay(300);

        // Strict password policy validation
        const validation = evaluatePassword(password);
        if (!validation.isValid) {
            throw new Error('Password does not meet NIST security requirements (minimum 12 characters, complexity required).');
        }

        // Initialize zero-knowledge vault
        let recoveryKey: string | undefined;
        if (!vaultService.isInitialized()) {
            const setupRes = await vaultService.setup(password);
            recoveryKey = setupRes.recoveryKey;
        }

        const userId = `usr-${Math.random().toString(36).substr(2, 9)}`;
        const newUser: User = {
            id: userId,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            avatar: `https://i.pravatar.cc/150?u=${encodeURIComponent(email)}`,
            preferences: {
                theme: 'night',
                currency: 'USD',
                notifications: true,
                language: 'en',
                dateFormat: 'DD/MM/YYYY',
            },
            xp: 0,
            level: 1,
        };

        await userRepository.saveUser(newUser);
        this.resetFailures();
        const session = this.createSession(newUser.id);

        return {
            user: newUser,
            recoveryKey,
            session,
        };
    }

    public async signIn(email: string, password: string): Promise<AuthResult> {
        await delay(300);
        this.checkLockout();

        const cleanEmail = email.trim().toLowerCase();

        // 1. Demo account handling
        if (cleanEmail === 'demo@glassfolio.com' && password === 'password') {
            try {
                if (!vaultService.isInitialized()) {
                    await vaultService.setup('password');
                } else if (!vaultService.isUnlocked()) {
                    await vaultService.unlock('password');
                }
            } catch (err) {
                console.error('[authService] Failed to unlock demo vault', err);
            }

            const demoUser: User = {
                id: 'demo-123',
                name: 'Alex Trader',
                email: 'demo@glassfolio.com',
                avatar: 'https://i.pravatar.cc/150?u=alex',
                preferences: {
                    theme: 'night',
                    currency: 'USD',
                    notifications: true,
                    language: 'en',
                    dateFormat: 'DD/MM/YYYY',
                },
                xp: 1250,
                level: 5,
            };

            await userRepository.saveUser(demoUser);
            this.resetFailures();
            const session = this.createSession(demoUser.id);
            return { user: demoUser, session };
        }

        // 2. Custom account handling via zero-knowledge vault
        try {
            if (vaultService.isInitialized() && !vaultService.isUnlocked()) {
                await vaultService.unlock(password);
            }
            const storedUser = await userRepository.getUser();
            if (storedUser && storedUser.email.toLowerCase() === cleanEmail) {
                this.resetFailures();
                const session = this.createSession(storedUser.id);
                return { user: storedUser, session };
            }
        } catch {
            // credentials invalid for vault
        }

        this.registerFailure();
        throw new Error('Invalid email or password.');
    }

    public async signInWithOAuth(provider: 'google' | 'apple'): Promise<never> {
        await delay(400);
        throw new Error(
            provider === 'google'
                ? 'Google Login is currently in preview mode. Please use Email or Demo account.'
                : 'Apple Sign-In is currently in preview mode. Please use Email or Demo account.'
        );
    }

    public async signOut(): Promise<void> {
        this.currentSession = null;
        await userRepository.clearUser();
        await vaultService.lock();
    }

    public async getCurrentUser(): Promise<User | null> {
        return userRepository.getUser();
    }
}

/**
 * Factory for creating the appropriate auth provider based on deployment mode.
 */
export const createAuthProvider = (mode: string): IAuthProvider => {
    switch (mode) {
        case 'cloud':
            // Cloud provider uses LocalAuthProvider as local fallback until InstantDB/Azure is configured
            return new LocalAuthProvider();
        case 'local':
        default:
            return new LocalAuthProvider();
    }
};

export const authService = createAuthProvider(getDeploymentMode());
