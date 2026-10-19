/**
 * Unified Authentication Service (TGLA-047, TGLA-059 & TGLA-060).
 *
 * Implements:
 *   - LocalAuthProvider (E2EE local mode, single-vault direct unlock, PBKDF2/HKDF dual-key unlock, lockout protection).
 *   - SupabaseAuthProvider (E2EE cloud mode, GoTrue Auth, Google/Apple OAuth, automated encrypted vault sync).
 *   - Factory keyed on VITE_DEPLOYMENT_MODE & Supabase configuration.
 */

import { getDeploymentMode } from '../../config/deployment';
import { User } from '../../types/domain';
import { delay } from '../db';
import { userRepository } from '../repositories';
import { AuthResult, AuthSession, IAuthProvider } from './authTypes';
import { evaluatePassword } from './passwordValidator';
import { vaultService } from './vaultService';
import { appStorage } from '../storage/appStorage';
import { PUBLIC_LANG_STORAGE_KEY, PUBLIC_THEME_STORAGE_KEY } from '../storage/storageKeys';
import { getSyncedStorageProvider } from '../storage/storageFactory';
import {
    isSupabaseConfigured,
    SupabaseAuthSession,
    supabaseClient,
    consumeInitialOAuthHash,
    SupabaseUserData,
} from '../supabase/supabaseClient';

function getInitialAuthPreferences(): User['preferences'] {
    const storedTheme = appStorage.getItem(PUBLIC_THEME_STORAGE_KEY);
    const validTheme = storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'night'
        ? storedTheme
        : (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'night');

    const storedLang = appStorage.getItem(PUBLIC_LANG_STORAGE_KEY);
    const validLang = storedLang === 'fr' || storedLang === 'en'
        ? storedLang
        : (typeof document !== 'undefined' && document.documentElement.lang?.toLowerCase().startsWith('fr') ? 'fr' : 'en');

    const currency = validLang === 'fr' ? 'EUR' : 'USD';

    return {
        theme: validTheme,
        currency,
        notifications: true,
        language: validLang,
        dateFormat: 'DD/MM/YYYY',
    };
}

const MAX_UNLOCKED_ATTEMPTS = 5;
const BASE_LOCKOUT_SECONDS = 30;

// Helper to create in-memory session record
function createSessionRecord(userId: string): AuthSession {
    return {
        id: `sess-${Math.random().toString(36).substr(2, 9)}`,
        userId,
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node/Test',
        deviceLabel: 'Current Device',
    };
}

// ── LOCAL AUTH PROVIDER (Offline-first & Docker single-vault) ─────────────────

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

    protected checkLockout(): void {
        const remaining = this.getLockoutRemainingSeconds();
        if (remaining > 0) {
            throw new Error(`Account temporarily locked. Please wait ${remaining} seconds.`);
        }
    }

    protected registerFailure(): void {
        this.failedAttempts++;
        if (this.failedAttempts >= MAX_UNLOCKED_ATTEMPTS) {
            const multiplier = Math.pow(2, this.failedAttempts - MAX_UNLOCKED_ATTEMPTS);
            const lockoutDurationSec = BASE_LOCKOUT_SECONDS * multiplier;
            this.lockoutUntil = Date.now() + lockoutDurationSec * 1000;
        }
    }

    protected resetFailures(): void {
        this.failedAttempts = 0;
        this.lockoutUntil = null;
    }

    public async setupLocalVault(name: string, masterPassword: string): Promise<AuthResult> {
        await delay(300);

        const validation = evaluatePassword(masterPassword);
        if (!validation.isValid) {
            throw new Error('Password does not meet NIST security requirements (minimum 12 characters, complexity required).');
        }

        if (vaultService.isInitialized()) {
            await vaultService.resetVault();
        }
        const setupRes = await vaultService.setup(masterPassword);
        const recoveryKey = setupRes.recoveryKey;

        const userId = `usr-local-${Math.random().toString(36).substr(2, 7)}`;
        const localUser: User = {
            id: userId,
            name: name.trim() || 'Local Vault Master',
            email: 'local@glassfolio.vault',
            avatar: '/avatars/local-user.jpg',
            preferences: getInitialAuthPreferences(),
            xp: 0,
            level: 1,
        };

        await userRepository.saveUser(localUser);
        this.resetFailures();
        const session = createSessionRecord(localUser.id);
        this.currentSession = session;

        return { user: localUser, recoveryKey, session };
    }

    public async unlockLocalVault(masterPassword: string): Promise<AuthResult> {
        await delay(250);
        this.checkLockout();

        try {
            if (vaultService.isInitialized() && !vaultService.isUnlocked()) {
                await vaultService.unlock(masterPassword);
            }
            let user = await userRepository.getUser();
            if (!user) {
                user = {
                    id: 'usr-local-default',
                    name: 'Local Vault Master',
                    email: 'local@glassfolio.vault',
                    avatar: '/avatars/local-user.jpg',
                    preferences: getInitialAuthPreferences(),
                    xp: 0,
                    level: 1,
                };
                await userRepository.saveUser(user);
            }
            this.resetFailures();
            const session = createSessionRecord(user.id);
            this.currentSession = session;
            return { user, session };
        } catch {
            this.registerFailure();
            throw new Error('Invalid master password.');
        }
    }

    public async signUp(email: string, password: string, name: string): Promise<AuthResult> {
        await delay(300);

        // Strict password policy validation
        const validation = evaluatePassword(password);
        if (!validation.isValid) {
            throw new Error('Password does not meet NIST security requirements (minimum 12 characters, complexity required).');
        }

        // If a vault is already initialized (e.g. from a previous demo session or locked state),
        // reset it so the new account gets a clean, unlocked E2EE vault
        if (vaultService.isInitialized()) {
            await vaultService.resetVault();
        }

        // Initialize encrypted vault
        const setupRes = await vaultService.setup(password);
        const recoveryKey = setupRes.recoveryKey;

        const userId = `usr-${Math.random().toString(36).substr(2, 9)}`;
        const newUser: User = {
            id: userId,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            avatar: `https://i.pravatar.cc/150?u=${encodeURIComponent(email)}`,
            preferences: getInitialAuthPreferences(),
            xp: 0,
            level: 1,
        };

        await userRepository.saveUser(newUser);
        this.resetFailures();
        const session = createSessionRecord(newUser.id);
        this.currentSession = session;

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
            // Guard: ensure no Supabase session can ever sync demo data to the cloud
            getSyncedStorageProvider()?.setSupabaseSession(null);
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem('gf_sb_session');
            }

            // Guard: if a real user vault was present, reset to a fresh demo vault
            if (vaultService.isInitialized() && !vaultService.isDemoVault()) {
                await vaultService.resetVault();
            }

            try {
                if (!vaultService.isInitialized()) {
                    await vaultService.setup('password', { isDemo: true });
                } else if (!vaultService.isUnlocked()) {
                    await vaultService.unlock('password');
                }
            } catch (err) {
                console.error('[authService] Failed to unlock demo vault', err);
            }

            const existingDemo = await userRepository.getUser();
            const storedTheme = appStorage.getItem(PUBLIC_THEME_STORAGE_KEY) as User['preferences']['theme'];
            const storedLang = appStorage.getItem(PUBLIC_LANG_STORAGE_KEY) as User['preferences']['language'];

            const demoUser: User = {
                id: 'demo-123',
                name: 'Thomas Martin',
                email: 'demo@glassfolio.com',
                avatar: '/avatars/demo-user.jpg',
                preferences: {
                    ...getInitialAuthPreferences(),
                    currency: 'EUR',
                    dateFormat: 'DD/MM/YYYY',
                    notifications: true,
                    ...(existingDemo?.preferences || {}),
                    theme: storedTheme || existingDemo?.preferences?.theme || 'night',
                    language: storedLang || existingDemo?.preferences?.language || 'fr',
                    fiscalProfile: {
                        familyStatus: 'married',
                        fiscalShares: 3,
                        taxResidenceCountries: ['FR'],
                        department: '75',
                        taxZone: 'zone_3',
                        otherTaxableIncome: 68000,
                        estimatedTMI: 30,
                        hasOpted2OP: false,
                        lossCarryforwards: {},
                        ...(existingDemo?.preferences?.fiscalProfile || {}),
                    },
                },
                xp: Math.max(existingDemo?.xp || 0, 2750),
                level: Math.max(existingDemo?.level || 0, 6),
            };

            await userRepository.saveUser(demoUser);
            this.resetFailures();
            const session = createSessionRecord(demoUser.id);
            this.currentSession = session;
            return { user: demoUser, session };
        }

        // 2. Custom account handling via encrypted vault
        try {
            if (vaultService.isInitialized() && !vaultService.isUnlocked()) {
                await vaultService.unlock(password);
            }
            const storedUser = await userRepository.getUser();
            if (storedUser && storedUser.email.toLowerCase() === cleanEmail) {
                this.resetFailures();
                const session = createSessionRecord(storedUser.id);
                this.currentSession = session;
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
        if (provider === 'apple') {
            throw new Error('Apple Sign-In is disabled.');
        }
        throw new Error('Google Login requires Supabase to be configured in .env.local.');
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

// ── SUPABASE AUTH PROVIDER (Cloud E2EE Sync) ──────────────────────────────────

export class SupabaseAuthProvider extends LocalAuthProvider implements IAuthProvider {
    private supabaseSession: SupabaseAuthSession | null = null;

    constructor() {
        super();
        this.restoreSessionFromStorage();
    }

    private restoreSessionFromStorage(): void {
        if (typeof window === 'undefined') return;
        try {
            const raw = localStorage.getItem('gf_sb_session');
            if (raw) {
                const parsed = JSON.parse(raw) as SupabaseAuthSession;
                if (parsed.expiresAt > Date.now()) {
                    this.supabaseSession = parsed;
                    getSyncedStorageProvider()?.setSupabaseSession(parsed);
                } else {
                    localStorage.removeItem('gf_sb_session');
                }
            }
        } catch {
            // Silent fallback
        }
    }

    private persistSession(session: SupabaseAuthSession | null): void {
        this.supabaseSession = session;
        getSyncedStorageProvider()?.setSupabaseSession(session);
        if (typeof window === 'undefined') return;
        if (session) {
            localStorage.setItem('gf_sb_session', JSON.stringify(session));
        } else {
            localStorage.removeItem('gf_sb_session');
        }
    }

    public async handleOAuthCallback(): Promise<AuthResult | null> {
        if (typeof window === 'undefined') return null;
        const hash = consumeInitialOAuthHash() || window.location.hash;
        if (!hash || !hash.includes('access_token=')) return null;

        const cleanFragment = hash.replace(/^[#/?]+/, '');
        const params = new URLSearchParams(cleanFragment);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const expiresIn = params.get('expires_in');

        if (!accessToken) return null;

        // Clean URL hash without reload
        window.history.replaceState(null, '', window.location.pathname + window.location.search);

        // 1. Fetch verified user profile from Supabase Auth
        let sbUser: SupabaseUserData;
        try {
            sbUser = await supabaseClient.getUser(accessToken);
        } catch (err) {
            console.error('[authService] Failed to retrieve Supabase user from OAuth token', err);
            return null;
        }

        const session: SupabaseAuthSession = {
            accessToken,
            refreshToken: refreshToken || '',
            expiresAt: Date.now() + (Number(expiresIn) || 3600) * 1000,
            user: {
                id: sbUser.id,
                email: sbUser.email,
                user_metadata: sbUser.user_metadata,
            },
        };

        this.persistSession(session);

        // 2. Clear any leftover demo vault if present so demo data never mixes with Google account
        if (vaultService.isDemoVault()) {
            await vaultService.resetVault();
        }

        // 3. Pull user's encrypted vault from Supabase PostgREST
        const synced = getSyncedStorageProvider();
        if (synced) {
            await synced.pullFromRemote();
        }

        // 4. Derive seamless E2EE vault secret and initialize or unlock vault
        const oauthEmail = (sbUser.email || '').trim().toLowerCase();
        const oauthVaultSecret = `gf-oauth-e2ee-v1:${sbUser.id}:${oauthEmail}`;

        try {
            if (vaultService.isInitialized() && !vaultService.isDemoVault()) {
                if (!vaultService.isUnlocked()) {
                    await vaultService.unlock(oauthVaultSecret);
                }
            } else {
                if (vaultService.isInitialized()) {
                    await vaultService.resetVault();
                }
                await vaultService.setup(oauthVaultSecret, { isDemo: false });
            }
        } catch (err) {
            console.error('[authService] E2EE vault auto-unlock error on OAuth callback', err);
        }

        // 5. Construct or retrieve user profile
        let user = await userRepository.getUser();
        const googleName = sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || oauthEmail.split('@')[0] || 'Investor';
        const googleAvatar = sbUser.user_metadata?.avatar_url || sbUser.user_metadata?.picture || `https://i.pravatar.cc/150?u=${encodeURIComponent(sbUser.id)}`;

        if (!user) {
            user = {
                id: sbUser.id,
                name: googleName,
                email: oauthEmail,
                avatar: googleAvatar,
                preferences: getInitialAuthPreferences(),
                xp: 0,
                level: 1,
            };
            await userRepository.saveUser(user);
        } else {
            let updated = false;
            if (googleName && user.name !== googleName) {
                user.name = googleName;
                updated = true;
            }
            if (googleAvatar && user.avatar !== googleAvatar) {
                user.avatar = googleAvatar;
                updated = true;
            }
            if (updated) {
                await userRepository.saveUser(user);
            }
        }

        this.resetFailures();
        return {
            user,
            session: createSessionRecord(user.id),
        };
    }

    public override async signUp(email: string, password: string, name: string): Promise<AuthResult> {
        this.checkLockout();

        // 1. NIST evaluation
        const validation = evaluatePassword(password);
        if (!validation.isValid) {
            throw new Error('Password does not meet NIST security requirements (minimum 12 characters, complexity required).');
        }

        // 2. Register user on Supabase Auth
        const sbSession = await supabaseClient.signUp(email, password, name);
        this.persistSession(sbSession);

        // 3. Setup client-side encrypted vault
        if (vaultService.isInitialized()) {
            await vaultService.resetVault();
        }
        const setupRes = await vaultService.setup(password);

        // 4. Save User record
        const newUser: User = {
            id: sbSession.user.id,
            name: name.trim() || sbSession.user.user_metadata?.name || 'Investor',
            email: email.trim().toLowerCase(),
            avatar: sbSession.user.user_metadata?.avatar_url || `https://i.pravatar.cc/150?u=${encodeURIComponent(email)}`,
            preferences: getInitialAuthPreferences(),
            xp: 0,
            level: 1,
        };

        await userRepository.saveUser(newUser);

        // 5. Trigger initial remote sync
        const synced = getSyncedStorageProvider();
        if (synced) {
            await synced.pullFromRemote();
        }

        this.resetFailures();
        return {
            user: newUser,
            recoveryKey: setupRes.recoveryKey,
            session: createSessionRecord(newUser.id),
        };
    }

    public override async signIn(email: string, password: string): Promise<AuthResult> {
        this.checkLockout();

        const cleanEmail = email.trim().toLowerCase();
        if (cleanEmail === 'demo@glassfolio.com') {
            return super.signIn(email, password);
        }

        try {
            // 1. Authenticate against Supabase Auth
            const sbSession = await supabaseClient.signInWithPassword(cleanEmail, password);
            this.persistSession(sbSession);

            // 2. Pull remote encrypted vault from Supabase PostgREST
            const synced = getSyncedStorageProvider();
            if (synced) {
                await synced.pullFromRemote();
            }

            // 3. Unlock encrypted vault
            if (vaultService.isInitialized() && !vaultService.isUnlocked()) {
                await vaultService.unlock(password);
            }

            // 4. Retrieve or reconstruct user profile
            let user = await userRepository.getUser();
            if (!user) {
                user = {
                    id: sbSession.user.id,
                    name: sbSession.user.user_metadata?.name || cleanEmail.split('@')[0],
                    email: cleanEmail,
                    avatar: sbSession.user.user_metadata?.avatar_url || `https://i.pravatar.cc/150?u=${encodeURIComponent(cleanEmail)}`,
                    preferences: getInitialAuthPreferences(),
                    xp: 0,
                    level: 1,
                };
                await userRepository.saveUser(user);
            }

            this.resetFailures();
            return {
                user,
                session: createSessionRecord(user.id),
            };
        } catch (err: unknown) {
            this.registerFailure();
            const msg = err instanceof Error ? err.message : 'Invalid credentials.';
            throw new Error(msg);
        }
    }

    protected redirectToUrl(url: string): void {
        if (typeof window !== 'undefined' && window.location?.assign) {
            window.location.assign(url);
        }
    }

    public override async signInWithOAuth(provider: 'google' | 'apple'): Promise<never> {
        if (provider === 'apple') {
            throw new Error('Apple Sign-In is disabled.');
        }
        if (!isSupabaseConfigured() || typeof window === 'undefined') {
            return super.signInWithOAuth(provider);
        }
        const redirectUrl = supabaseClient.getOAuthUrl(provider);
        this.redirectToUrl(redirectUrl);
        // Returns promise that never resolves as browser is redirecting
        return new Promise(() => {});
    }

    public override async signOut(): Promise<void> {
        if (this.supabaseSession) {
            await supabaseClient.signOut(this.supabaseSession.accessToken);
        }
        this.persistSession(null);
        await super.signOut();
    }
}

// ── FACTORY ───────────────────────────────────────────────────────────────────

export const createAuthProvider = (mode: string): IAuthProvider => {
    switch (mode) {
        case 'cloud':
            if (isSupabaseConfigured()) {
                return new SupabaseAuthProvider();
            }
            return new LocalAuthProvider();
        case 'local':
        default:
            if (isSupabaseConfigured()) {
                return new SupabaseAuthProvider();
            }
            return new LocalAuthProvider();
    }
};

export const authService = createAuthProvider(getDeploymentMode());
