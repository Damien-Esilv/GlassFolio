/**
 * Unified Authentication Service (TGLA-047, TGLA-059, TGLA-060 & Epic 20).
 *
 * Implements:
 *   - LocalAuthProvider (E2EE local mode, single-vault direct unlock, PBKDF2/HKDF dual-key unlock, lockout protection).
 *   - SupabaseAuthProvider (E2EE cloud mode, GoTrue Auth, Google OAuth PKCE 0-password, automated encrypted vault sync).
 *   - Multi-slot KEK/DEK lifecycle with 256-bit emergency recovery key.
 *   - 2FA/TOTP step-up verification and anti-bot hardening.
 *   - Factory keyed strictly on VITE_DEPLOYMENT_MODE & Supabase configuration.
 */

import { getDeploymentMode } from '../../config/deployment';
import { User } from '../../types/domain';
import { isErr } from '../../types/result';
import { db, delay } from '../db';
import { userRepository } from '../repositories';
import { AuthResult, AuthSession, IAuthProvider } from './authTypes';
import { evaluatePassword } from './passwordValidator';
import { vaultService } from './vaultService';
import { totpService } from './totpService';
import { auditLogService } from './auditLogService';
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
    protected maxAttempts: number;
    private failedAttempts = 0;
    private lockoutUntil: number | null = null;
    protected currentSession: AuthSession | null = null;

    constructor(maxAttempts = 5) {
        this.maxAttempts = maxAttempts;
    }

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
        if (this.failedAttempts >= this.maxAttempts) {
            const multiplier = Math.pow(2, this.failedAttempts - this.maxAttempts);
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
            authProvider: 'local',
            emailVerified: true,
        };

        await userRepository.saveUser(localUser);
        this.resetFailures();
        const session = createSessionRecord(localUser.id);
        this.currentSession = session;

        await auditLogService.record('auth_login', 'Local master vault initialized successfully');

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
                    authProvider: 'local',
                    emailVerified: true,
                };
                await userRepository.saveUser(user);
            }
            this.resetFailures();
            const session = createSessionRecord(user.id);
            this.currentSession = session;

            await auditLogService.record('auth_login', 'Local vault unlocked');
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
            authProvider: 'local',
            emailVerified: true,
        };

        await userRepository.saveUser(newUser);
        this.resetFailures();
        const session = createSessionRecord(newUser.id);
        this.currentSession = session;

        await auditLogService.record('auth_login', `Account created for ${newUser.email}`);

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
                xp: existingDemo?.xp ?? 2150,
                level: existingDemo?.level ?? 5,
                authProvider: 'local',
                emailVerified: true,
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
                // Check if Two-Factor Authentication is enabled
                const hasTotp = await totpService.isEnabled();
                if (hasTotp) {
                    return {
                        user: storedUser,
                        session: createSessionRecord(storedUser.id),
                        requiresTwoFactor: true,
                        tempUserId: storedUser.id,
                    };
                }

                this.resetFailures();
                const session = createSessionRecord(storedUser.id);
                this.currentSession = session;
                await auditLogService.record('auth_login', `Login successful for ${storedUser.email}`);
                return { user: storedUser, session };
            }
        } catch {
            // credentials invalid for vault
        }

        this.registerFailure();
        throw new Error('Invalid email or password.');
    }

    public async verifySecondFactor(tokenOrCode: string): Promise<AuthResult> {
        this.checkLockout();

        const isValid = await totpService.verify(tokenOrCode);
        if (!isValid) {
            this.registerFailure();
            throw new Error('Invalid two-factor authentication code or backup code.');
        }

        const user = await userRepository.getUser();
        if (!user) {
            throw new Error('User session not found.');
        }

        this.resetFailures();
        const session = createSessionRecord(user.id);
        this.currentSession = session;
        await auditLogService.record('totp_verified', 'Two-factor authentication challenge passed');

        return { user, session };
    }

    public async changeEmail(currentPassword: string, newEmail: string): Promise<void> {
        this.checkLockout();

        const cleanNewEmail = newEmail.trim().toLowerCase();
        if (!cleanNewEmail.includes('@') || !cleanNewEmail.includes('.')) {
            throw new Error('Please enter a valid email address.');
        }

        const user = await userRepository.getUser();
        if (user?.authProvider === 'google') {
            throw new Error('Email change is disabled for Google OAuth accounts.');
        }

        const isPasswordValid = await vaultService.verifyPassword(currentPassword);
        if (!isPasswordValid) {
            this.registerFailure();
            throw new Error('Invalid current password.');
        }

        if (user) {
            const cleanNewEmail = newEmail.trim().toLowerCase();
            user.email = cleanNewEmail;
            user.pendingEmail = undefined;
            await userRepository.saveUser(user);
            await auditLogService.record('email_change_completed', `Email changed to ${cleanNewEmail}`);
        }
    }

    public async changePassword(oldPassword: string, newPassword: string): Promise<void> {
        this.checkLockout();

        const user = await userRepository.getUser();
        if (user?.authProvider === 'google') {
            throw new Error('Password change is disabled for Google OAuth accounts.');
        }

        const validation = evaluatePassword(newPassword);
        if (!validation.isValid) {
            throw new Error('Password does not meet NIST security requirements (minimum 12 characters, complexity required).');
        }

        await vaultService.changePassword(oldPassword, newPassword);
        this.resetFailures();
        await auditLogService.record('recovery_key_rotated', 'Master password changed and DEK re-wrapped');
    }

    public async recoverPassword(recoveryKey: string, newPassword: string): Promise<{ newRecoveryKey: string }> {
        this.checkLockout();

        const validation = evaluatePassword(newPassword);
        if (!validation.isValid) {
            throw new Error('Password does not meet NIST security requirements (minimum 12 characters, complexity required).');
        }

        const res = await vaultService.recoverPasswordWithRecoveryKey(recoveryKey, newPassword);
        if (isErr(res)) {
            throw new Error(res.error.message);
        }
        this.resetFailures();

        await auditLogService.record('recovery_key_used', 'Emergency recovery key used to unlock vault', 'warning');
        await auditLogService.record('recovery_key_rotated', 'Emergency recovery key rotated automatically', 'info');

        return { newRecoveryKey: res.value.newRecoveryKey };
    }

    public async requestPasswordReset(email: string): Promise<void> {
        await delay(200);
        // Generic response to prevent account enumeration
        await auditLogService.record('password_reset_requested', `Password reset requested for ${email}`);
    }

    public async resendEmailVerification(_email?: string): Promise<void> {
        await delay(200);
    }

    public async verifyEmailOtp(_email: string, _token: string): Promise<AuthResult> {
        const user = await userRepository.getUser();
        if (!user) throw new Error('User not found.');
        user.emailVerified = true;
        await userRepository.saveUser(user);
        return { user, session: createSessionRecord(user.id) };
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

    public async deleteAccountPermanently(options?: { password?: string; confirmationText?: string }): Promise<void> {
        if (options?.password && vaultService.isInitialized()) {
            const isValid = await vaultService.verifyPassword(options.password);
            if (!isValid) {
                throw new Error('Invalid master password.');
            }
        }

        await vaultService.resetVault();
        await userRepository.clearUser();
        db.resetToInitialData();
        await this.signOut();
    }
}

// ── SUPABASE AUTH PROVIDER (Cloud E2EE Sync) ──────────────────────────────────

export class SupabaseAuthProvider extends LocalAuthProvider implements IAuthProvider {
    private supabaseSession: SupabaseAuthSession | null = null;

    constructor() {
        super(3); // Enforce 3-attempt lockout for cloud auth
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

        let accessToken: string | null = null;
        let refreshToken: string | null = null;
        let expiresIn: string | null = null;

        // Check 1: PKCE code query parameter (?code=...) in window.location.search or window.location.hash
        const urlParams = new URLSearchParams(window.location.search);
        let code = urlParams.get('code');
        let codeInHash = false;

        if (!code && window.location.hash) {
            const hash = window.location.hash;
            const qIndex = hash.indexOf('?');
            if (qIndex !== -1) {
                const hashParams = new URLSearchParams(hash.slice(qIndex + 1));
                code = hashParams.get('code');
                codeInHash = true;
            } else if (hash.includes('code=')) {
                const cleanHash = hash.replace(/^[#/?]+/, '');
                const hashParams = new URLSearchParams(cleanHash);
                code = hashParams.get('code');
                codeInHash = true;
            }
        }

        if (code) {
            try {
                const pkceSession = await supabaseClient.exchangePkceCode(code);
                accessToken = pkceSession.accessToken;
                refreshToken = pkceSession.refreshToken;
                expiresIn = String(Math.floor((pkceSession.expiresAt - Date.now()) / 1000));

                // Clean URL search query without page reload
                if (window.location.search.includes('code=')) {
                    urlParams.delete('code');
                    const newSearch = urlParams.toString() ? `?${urlParams.toString()}` : '';
                    window.history.replaceState(null, '', window.location.pathname + newSearch + window.location.hash);
                }
                if (codeInHash && window.location.hash.includes('code=')) {
                    const cleanHash = window.location.hash.replace(/[?&]code=[^&#]+/, '').replace(/\?$/, '');
                    window.history.replaceState(null, '', window.location.pathname + window.location.search + cleanHash);
                }
            } catch (pkceErr) {
                console.error('[authService] PKCE exchange error', pkceErr);
            }
        }

        // Check 2: Hash fragment (#access_token=...)
        if (!accessToken) {
            const hash = consumeInitialOAuthHash() || window.location.hash;
            if (hash && hash.includes('access_token=')) {
                const cleanFragment = hash.replace(/^[#/?]+/, '');
                const hashParams = new URLSearchParams(cleanFragment);
                accessToken = hashParams.get('access_token');
                refreshToken = hashParams.get('refresh_token');
                expiresIn = hashParams.get('expires_in');
                // Clean URL hash without reload
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        }

        if (!accessToken) return null;

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

        // 4. Zero-Password Seamless Vault Initialization or Unlock (Option A)
        // With account conflict protection: check if vault exists with password slot only
        const oauthEmail = (sbUser.email || '').trim().toLowerCase();
        const oauthVaultSecret = `gf-oauth-e2ee-v1:${sbUser.id}:${oauthEmail}`;

        if (vaultService.isInitialized() && !vaultService.isDemoVault()) {
            const header = vaultService.getVaultHeader();
            if (header && header.authProvider === 'email') {
                await auditLogService.record('account_conflict_blocked', `Account conflict for ${oauthEmail}: user already has password vault`, 'warning');
                throw new Error('An account already exists with this email address using password authentication. Please log in with your master password.');
            }

            try {
                if (!vaultService.isUnlocked()) {
                    await vaultService.unlockOAuthVault(oauthVaultSecret);
                }
            } catch (err) {
                console.error('[authService] E2EE vault OAuth unlock error, recreating clean OAuth vault', err);
                if (!header || header.authProvider === 'google' || !header.authProvider) {
                    await vaultService.resetVault();
                    await vaultService.setupOAuthVault(oauthVaultSecret);
                } else {
                    throw new Error('Failed to unlock vault with OAuth credentials.');
                }
            }
        } else {
            await vaultService.setupOAuthVault(oauthVaultSecret);
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
                authProvider: 'google',
                emailVerified: true,
            };
            await userRepository.saveUser(user);
        } else {
            let updated = false;
            if (user.authProvider !== 'google') {
                user.authProvider = 'google';
                updated = true;
            }
            if (!user.emailVerified) {
                user.emailVerified = true;
                updated = true;
            }
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
        await auditLogService.record('oauth_google_login', `Google OAuth login succeeded for ${oauthEmail}`);

        return {
            user,
            session: createSessionRecord(user.id),
        };
    }

    public override async signUp(
        email: string,
        password: string,
        name: string,
        options?: { captchaToken?: string }
    ): Promise<AuthResult> {
        this.checkLockout();

        // 1. NIST evaluation
        const validation = evaluatePassword(password);
        if (!validation.isValid) {
            throw new Error('Password does not meet NIST security requirements (minimum 12 characters, complexity required).');
        }

        // 2. Register user on Supabase Auth
        const sbSession = await supabaseClient.signUp(email, password, name, options);
        this.persistSession(sbSession);

        // 3. Setup client-side encrypted vault
        if (vaultService.isInitialized()) {
            await vaultService.resetVault();
        }
        const setupRes = await vaultService.setup(password);

        // 4. Save User record with email provider
        const isEmailConfirmed = Boolean(sbSession.user.email_confirmed_at);
        const newUser: User = {
            id: sbSession.user.id,
            name: name.trim() || sbSession.user.user_metadata?.name || 'Investor',
            email: email.trim().toLowerCase(),
            avatar: sbSession.user.user_metadata?.avatar_url || `https://i.pravatar.cc/150?u=${encodeURIComponent(email)}`,
            preferences: getInitialAuthPreferences(),
            xp: 0,
            level: 1,
            authProvider: 'email',
            emailVerified: isEmailConfirmed,
        };

        await userRepository.saveUser(newUser);

        // 5. Trigger initial remote sync
        const synced = getSyncedStorageProvider();
        if (synced) {
            await synced.pullFromRemote();
        }

        this.resetFailures();
        await auditLogService.record('auth_login', `Supabase signup for ${newUser.email} (confirmed: ${isEmailConfirmed})`);

        return {
            user: newUser,
            recoveryKey: setupRes.recoveryKey,
            session: createSessionRecord(newUser.id),
        };
    }

    public override async signIn(
        email: string,
        password: string,
        options?: { captchaToken?: string }
    ): Promise<AuthResult> {
        this.checkLockout();

        const cleanEmail = email.trim().toLowerCase();
        if (cleanEmail === 'demo@glassfolio.com') {
            return super.signIn(email, password);
        }

        try {
            // 1. Authenticate against Supabase Auth
            const sbSession = await supabaseClient.signInWithPassword(cleanEmail, password, options);
            this.persistSession(sbSession);

            // 2. Pull remote encrypted vault from Supabase PostgREST
            const synced = getSyncedStorageProvider();
            if (synced) {
                await synced.pullFromRemote();
            }

            // 3. Check Two-Factor Authentication requirement
            const isTotpActive = await totpService.isEnabled();
            if (isTotpActive) {
                const user = await userRepository.getUser();
                return {
                    user: user || {
                        id: sbSession.user.id,
                        name: sbSession.user.user_metadata?.name || cleanEmail.split('@')[0],
                        email: cleanEmail,
                        avatar: sbSession.user.user_metadata?.avatar_url || `https://i.pravatar.cc/150?u=${encodeURIComponent(cleanEmail)}`,
                        preferences: getInitialAuthPreferences(),
                        xp: 0,
                        level: 1,
                        authProvider: 'email',
                        emailVerified: Boolean(sbSession.user.email_confirmed_at),
                    },
                    session: createSessionRecord(sbSession.user.id),
                    requiresTwoFactor: true,
                    tempUserId: sbSession.user.id,
                };
            }

            // 4. Unlock encrypted vault
            if (vaultService.isInitialized() && !vaultService.isUnlocked()) {
                await vaultService.unlock(password);
            }

            // 5. Retrieve or reconstruct user profile
            const isEmailConfirmed = Boolean(sbSession.user.email_confirmed_at);
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
                    authProvider: 'email',
                    emailVerified: isEmailConfirmed,
                };
                await userRepository.saveUser(user);
            } else {
                let updated = false;
                if (user.authProvider !== 'email') {
                    user.authProvider = 'email';
                    updated = true;
                }
                if (user.emailVerified !== isEmailConfirmed) {
                    user.emailVerified = isEmailConfirmed;
                    updated = true;
                }
                if (updated) {
                    await userRepository.saveUser(user);
                }
            }

            this.resetFailures();
            await auditLogService.record('auth_login', `Supabase signin for ${user.email}`);

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

    public override async changeEmail(currentPassword: string, newEmail: string): Promise<void> {
        this.checkLockout();

        const cleanNewEmail = newEmail.trim().toLowerCase();
        if (!cleanNewEmail.includes('@') || !cleanNewEmail.includes('.')) {
            throw new Error('Please enter a valid email address.');
        }

        const user = await userRepository.getUser();
        if (user?.authProvider === 'google') {
            throw new Error('Email change is disabled for Google OAuth accounts.');
        }

        // Step 1: Re-authenticate locally
        const isPasswordValid = await vaultService.verifyPassword(currentPassword);
        if (!isPasswordValid) {
            this.registerFailure();
            throw new Error('Invalid current password.');
        }

        if (!this.supabaseSession?.accessToken) {
            throw new Error('Active session required for email update.');
        }

        // Step 2: Request Secure Email Change on Supabase
        await supabaseClient.updateUser(this.supabaseSession.accessToken, { email: cleanNewEmail });

        // Step 3: Record pending email state
        if (user) {
            user.pendingEmail = cleanNewEmail;
            await userRepository.saveUser(user);
        }

        this.resetFailures();
        await auditLogService.record('email_change_requested', `Confirmation emails sent to verify change to ${cleanNewEmail}`);
    }

    public override async changePassword(oldPassword: string, newPassword: string): Promise<void> {
        this.checkLockout();

        const user = await userRepository.getUser();
        if (user?.authProvider === 'google') {
            throw new Error('Password change is disabled for Google OAuth accounts.');
        }

        const validation = evaluatePassword(newPassword);
        if (!validation.isValid) {
            throw new Error('Password does not meet NIST security requirements (minimum 12 characters, complexity required).');
        }

        // Re-wrap DEK in client vault with fresh salt
        await vaultService.changePassword(oldPassword, newPassword);

        // Update password on Supabase Auth if session exists
        if (this.supabaseSession?.accessToken) {
            await supabaseClient.updateUser(this.supabaseSession.accessToken, { password: newPassword });
        }

        this.resetFailures();
        await auditLogService.record('recovery_key_rotated', 'Master password changed and DEK re-wrapped');
    }

    public override async requestPasswordReset(email: string, redirectTo?: string): Promise<void> {
        await delay(200);
        try {
            await supabaseClient.resetPasswordForEmail(email.trim().toLowerCase(), redirectTo);
        } catch {
            // Anti-enumeration: do not leak whether user exists
        }
        await auditLogService.record('password_reset_requested', `Password reset requested for ${email}`);
    }

    public override async recoverPassword(recoveryKey: string, newPassword: string): Promise<{ newRecoveryKey: string }> {
        this.checkLockout();

        const validation = evaluatePassword(newPassword);
        if (!validation.isValid) {
            throw new Error('Password does not meet NIST security requirements (minimum 12 characters, complexity required).');
        }

        // Recover DEK and rotate Recovery Key in client vault
        const res = await vaultService.recoverPasswordWithRecoveryKey(recoveryKey, newPassword);
        if (isErr(res)) {
            throw new Error(res.error.message);
        }

        // If active session, update password on Supabase
        if (this.supabaseSession?.accessToken) {
            try {
                await supabaseClient.updateUser(this.supabaseSession.accessToken, { password: newPassword });
            } catch {
                // If token expired, user will log in with new password
            }
        }

        this.resetFailures();
        await auditLogService.record('recovery_key_used', 'Emergency recovery key used to unlock vault', 'warning');
        await auditLogService.record('recovery_key_rotated', 'Recovery key rotated following emergency reset', 'info');

        return { newRecoveryKey: res.value.newRecoveryKey };
    }

    public override async resendEmailVerification(email?: string): Promise<void> {
        const targetEmail = email || this.supabaseSession?.user.email;
        if (!targetEmail) {
            throw new Error('Email address required to resend verification.');
        }
        await supabaseClient.resendVerificationEmail(targetEmail);
    }

    public override async verifyEmailOtp(email: string, token: string): Promise<AuthResult> {
        const session = await supabaseClient.verifyEmailOtp(email.trim().toLowerCase(), token.trim());
        this.persistSession(session);

        let user = await userRepository.getUser();
        if (user) {
            user.emailVerified = true;
            await userRepository.saveUser(user);
        } else {
            user = {
                id: session.user.id,
                name: session.user.user_metadata?.name || email.split('@')[0],
                email: email.trim().toLowerCase(),
                avatar: session.user.user_metadata?.avatar_url || `https://i.pravatar.cc/150?u=${encodeURIComponent(email)}`,
                preferences: getInitialAuthPreferences(),
                xp: 0,
                level: 1,
                authProvider: 'email',
                emailVerified: true,
            };
            await userRepository.saveUser(user);
        }

        await auditLogService.record('email_verified', `Email verified for ${email}`);

        return {
            user,
            session: createSessionRecord(user.id),
        };
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

        const redirectUrl = await supabaseClient.prepareOAuthPkceUrl(provider);
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

    public override async deleteAccountPermanently(options?: { password?: string; confirmationText?: string }): Promise<void> {
        const user = await userRepository.getUser();
        if (user?.authProvider === 'email' || !user?.authProvider) {
            if (!options?.password) {
                throw new Error('Password is required to delete an email-based account.');
            }
            if (vaultService.isInitialized()) {
                const isValid = await vaultService.verifyPassword(options.password);
                if (!isValid) {
                    throw new Error('Invalid master password.');
                }
            }
        } else if (user?.authProvider === 'google') {
            const confirm = (options?.confirmationText || '').trim().toUpperCase();
            if (confirm !== 'DELETE' && confirm !== 'SUPPRIMER') {
                throw new Error('Confirmation text must match DELETE or SUPPRIMER.');
            }
        }

        if (this.supabaseSession?.accessToken) {
            await supabaseClient.deleteOwnAccount(this.supabaseSession.accessToken);
        }

        await vaultService.resetVault();
        await userRepository.clearUser();
        db.resetToInitialData();
        await this.signOut();
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
            return new LocalAuthProvider();
    }
};

export const authService = createAuthProvider(getDeploymentMode());
