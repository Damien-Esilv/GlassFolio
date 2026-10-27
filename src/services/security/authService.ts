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
import { AuthResult, AuthSession, SignUpOptions, EmailTokenHashType, IAuthProvider, PendingSignup, SecondFactorMethod, StepUpProof, VerifyTokenHashResult } from './authTypes';
import { evaluatePassword } from './passwordValidator';
import { vaultService } from './vaultService';
import { totpService } from './totpService';
import { passkeyService } from './passkeyService';
import { auditLogService } from './auditLogService';
import { ExistingVaultError } from './vaultTypes';
import { appStorage } from '../storage/appStorage';
import { PUBLIC_LANG_STORAGE_KEY, PUBLIC_THEME_STORAGE_KEY, VAULT_HEADER_KEY } from '../storage/storageKeys';
import { getSyncedStorageProvider, requireLocalPersistence } from '../storage/storageFactory';
import { purgeLocalAccountFootprint } from '../storage/accountErasure';
import {
    isSupabaseConfigured,
    SupabaseAuthSession,
    supabaseClient,
    consumeInitialOAuthHash,
    getSessionAssurance,
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
const LOCAL_EMAIL_UNAVAILABLE = 'Email verification is not available in local mode.';
const SIGN_IN_EXPIRED = 'Your sign-in session expired. Please sign in again.';
const VAULT_UNREACHABLE = 'Your encrypted vault could not be reached. Check your connection and try again.';
const SESSION_REFRESH_MARGIN_MS = 60_000;

/** The password was right but the address is not confirmed yet: the user must enter the emailed code. */
export class EmailNotConfirmedError extends Error {
    constructor() {
        super('Your email address is not verified yet.');
        this.name = 'EmailNotConfirmedError';
    }
}

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
    /** User whose vault is open but who still owes their second factor. */
    protected pendingLocalSignIn: User | null = null;

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

    /**
     * Whether the vault cached on this device may be discarded without the user's confirmation.
     * In local mode it is the only copy of the user's data.
     */
    protected canDiscardLocalVault(): boolean {
        return false;
    }

    /** Throws unless the device holds no vault, a demo vault, or one the user agreed to replace. */
    protected assertVaultReplaceable(overwriteExisting = false): void {
        if (overwriteExisting || this.canDiscardLocalVault()) return;
        if (vaultService.isInitialized() && !vaultService.isDemoVault()) {
            throw new ExistingVaultError();
        }
    }

    public async setupLocalVault(
        name: string,
        masterPassword: string,
        options?: { overwriteExisting?: boolean }
    ): Promise<AuthResult> {
        await delay(300);

        const validation = evaluatePassword(masterPassword);
        if (!validation.isValid) {
            throw new Error('Password does not meet NIST security requirements (minimum 12 characters, complexity required).');
        }

        this.assertVaultReplaceable(options?.overwriteExisting);
        await vaultService.resetVault();
        const setupRes = await vaultService.setup(masterPassword);
        const recoveryKey = setupRes.recoveryKey;

        const userId = `usr-local-${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`;
        const localUser: User = {
            id: userId,
            name: name.trim() || 'Local Vault Master',
            email: 'local@glassfolio.vault',
            avatar: '',
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

        if (!vaultService.isInitialized()) {
            throw new Error('No vault exists on this device yet. Initialize one first.');
        }
        // Always prove the password, even when the vault happens to be open already.
        if (!(await vaultService.verifyPassword(masterPassword))) {
            this.registerFailure();
            throw new Error('Invalid master password.');
        }
        if (!vaultService.isUnlocked()) {
            await vaultService.unlock(masterPassword);
        }
        return this.requireLocalSecondFactor(await this.loadLocalUser(), 'Local vault unlocked');
    }

    /** Local vault profile (created on first unlock of a vault set up without one). */
    protected async loadLocalUser(): Promise<User> {
        const stored = await userRepository.getUser();
        if (stored) return stored;
        const user: User = {
            id: 'usr-local-default',
            name: 'Local Vault Master',
            email: 'local@glassfolio.vault',
            avatar: '',
            preferences: getInitialAuthPreferences(),
            xp: 0,
            level: 1,
            authProvider: 'local',
            emailVerified: true,
        };
        await userRepository.saveUser(user);
        return user;
    }

    /**
     * Passwordless unlock through a PRF passkey. A passkey with user verification is a strong
     * factor on its own, so no second factor is asked on top of it.
     */
    public async signInWithPasskey(): Promise<AuthResult> {
        if (!vaultService.isInitialized()) {
            throw new Error('No vault exists on this device yet. Initialize one first.');
        }
        await passkeyService.unlockVault();
        await auditLogService.record('passkey_authenticated', 'Vault unlocked with a passkey');
        return this.completeLocalSignIn(await this.loadLocalUser(), 'Local vault unlocked with a passkey');
    }

    /** Second factor with a registered passkey; any other credential is rejected. */
    public async verifySecondFactorWithPasskey(): Promise<AuthResult> {
        const user = this.pendingLocalSignIn;
        if (!user || !vaultService.isUnlocked()) {
            throw new Error(SIGN_IN_EXPIRED);
        }
        const records = await passkeyService.listPasskeys();
        if (records.length === 0) {
            throw new Error('No passkey is registered for this account.');
        }
        await passkeyService.authenticate({ allowCredentials: records.map(record => ({ id: record.id, transports: record.transports })) });
        await auditLogService.record('passkey_authenticated', 'Passkey second factor verified');
        return this.completeLocalSignIn(user, `Login successful for ${user.email}`);
    }

    /**
     * Local second factor. It is checked after the unlock because its secret lives inside the
     * vault; the user stays signed out (and the vault is locked on cancel) until it is verified.
     */
    protected async requireLocalSecondFactor(user: User, auditDetails: string): Promise<AuthResult> {
        const methods: SecondFactorMethod[] = [];
        if (await totpService.isEnabled()) methods.push('totp');
        if ((await passkeyService.listPasskeys()).length > 0) methods.push('passkey');
        if (methods.length > 0) {
            this.pendingLocalSignIn = user;
            return {
                user,
                session: createSessionRecord(user.id),
                requiresTwoFactor: true,
                secondFactorMethods: methods,
                tempUserId: user.id,
            };
        }
        return this.completeLocalSignIn(user, auditDetails);
    }

    protected async completeLocalSignIn(user: User, auditDetails: string): Promise<AuthResult> {
        this.pendingLocalSignIn = null;
        this.resetFailures();
        const session = createSessionRecord(user.id);
        this.currentSession = session;
        await auditLogService.record('auth_login', auditDetails);
        return { user, session };
    }

    public async signUp(email: string, password: string, name: string): Promise<AuthResult> {
        await delay(300);

        // Strict password policy validation
        const validation = evaluatePassword(password);
        if (!validation.isValid) {
            throw new Error('Password does not meet NIST security requirements (minimum 12 characters, complexity required).');
        }

        // Reset any previous demo remnants so the new account gets a clean, unlocked E2EE vault
        this.assertVaultReplaceable();
        await vaultService.resetVault();

        // Initialize encrypted vault
        const setupRes = await vaultService.setup(password);
        const recoveryKey = setupRes.recoveryKey;

        const userId = `usr-${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        const newUser: User = {
            id: userId,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            avatar: '',
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

            // Guard: a real vault is only replaced when it is a disposable cache (cloud)
            if (vaultService.isInitialized() && !vaultService.isDemoVault()) {
                this.assertVaultReplaceable();
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
                return await this.requireLocalSecondFactor(storedUser, `Login successful for ${storedUser.email}`);
            }
        } catch {
            // credentials invalid for vault
        }

        this.registerFailure();
        throw new Error('Invalid email or password.');
    }

    public async verifySecondFactor(tokenOrCode: string): Promise<AuthResult> {
        this.checkLockout();

        const user = this.pendingLocalSignIn;
        if (!user || !vaultService.isUnlocked()) {
            throw new Error(SIGN_IN_EXPIRED);
        }
        if (!(await totpService.verify(tokenOrCode))) {
            this.registerFailure();
            throw new Error('Invalid two-factor authentication code or backup code.');
        }

        await auditLogService.record('totp_verified', 'Two-factor authentication challenge passed');
        return this.completeLocalSignIn(user, `Login successful for ${user.email}`);
    }

    public async cancelSecondFactor(): Promise<void> {
        if (!this.pendingLocalSignIn) return;
        this.pendingLocalSignIn = null;
        await vaultService.lock();
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

    public async changePassword(oldPassword: string, newPassword: string, _options?: { nonce?: string; totpCode?: string }): Promise<void> {
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
        await auditLogService.record('password_changed', 'Master password changed and DEK re-wrapped');
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

    public async requestPasswordReset(email: string, _redirectTo?: string, _options?: { captchaToken?: string }): Promise<void> {
        await delay(200);
        // Generic response to prevent account enumeration
        await auditLogService.record('password_reset_requested', `Password reset requested for ${email}`);
    }

    // Local mode has no email channel: verification calls fail instead of pretending to succeed.
    public async resendEmailVerification(_email?: string, _options?: { captchaToken?: string }): Promise<void> {
        throw new Error(LOCAL_EMAIL_UNAVAILABLE);
    }

    public async verifyEmailOtp(_email: string, _token: string): Promise<AuthResult> {
        throw new Error(LOCAL_EMAIL_UNAVAILABLE);
    }

    public async verifyEmailTokenHash(_tokenHash: string, _type: EmailTokenHashType = 'signup'): Promise<VerifyTokenHashResult> {
        throw new Error(LOCAL_EMAIL_UNAVAILABLE);
    }

    public async syncEmailLocale(_locale: string): Promise<void> {
        // Local mode sends no emails: nothing to sync.
    }

    public async signInWithOAuth(provider: 'google' | 'apple'): Promise<never> {
        await delay(400);
        if (provider === 'apple') {
            throw new Error('Apple Sign-In is disabled.');
        }
        throw new Error('Google Login requires Supabase to be configured in .env.local.');
    }

    /** Signing out locks the vault; the profile stays inside it (it is the account in local mode). */
    public async signOut(): Promise<void> {
        this.currentSession = null;
        this.pendingLocalSignIn = null;
        await vaultService.lock();
    }

    public async getCurrentUser(): Promise<User | null> {
        return userRepository.getUser();
    }

    /** Local step-up: the vault password, plus the local TOTP or a registered passkey if any. */
    public async reauthenticate(proof: StepUpProof): Promise<void> {
        this.checkLockout();
        if (!proof.password || !(await vaultService.verifyPassword(proof.password))) {
            this.registerFailure();
            throw new Error('Invalid master password.');
        }
        const hasTotp = await totpService.isEnabled();
        const passkeys = await passkeyService.listPasskeys();
        if (proof.usePasskey && passkeys.length > 0) {
            await passkeyService.authenticate({ allowCredentialIds: passkeys.map(record => record.id) });
        } else if (hasTotp) {
            if (!proof.totpCode || !(await totpService.verify(proof.totpCode))) {
                this.registerFailure();
                throw new Error('Invalid two-factor authentication code or backup code.');
            }
        } else if (passkeys.length > 0) {
            throw new Error('Confirm with one of your passkeys.');
        }
        this.resetFailures();
    }

    public async deleteAccountPermanently(options?: { password?: string; confirmationText?: string }): Promise<void> {
        if (vaultService.isInitialized() && !vaultService.isDemoVault()) {
            if (!options?.password || !(await vaultService.verifyPassword(options.password))) {
                throw new Error('Invalid master password.');
            }
        }

        await vaultService.resetVault();
        await userRepository.clearUser();
        db.resetToInitialData();
        await this.signOut();
        purgeLocalAccountFootprint();
        await requireLocalPersistence();
    }
}

// ── SUPABASE AUTH PROVIDER (Cloud E2EE Sync) ──────────────────────────────────

export class SupabaseAuthProvider extends LocalAuthProvider implements IAuthProvider {
    private supabaseSession: SupabaseAuthSession | null = null;
    private pendingSignupSession: SupabaseAuthSession | null = null;
    private pendingSignupUser: User | null = null;
    /**
     * Credentials of a sign-up in progress, kept in memory only so the vault can be created with
     * the password once the address is verified (code, link, or a later sign-in).
     */
    private signupDraft: { email: string; password: string; name: string } | null = null;
    /**
     * AAL1 session waiting for its TOTP code. It is never persisted nor used to read the vault,
     * and `complete` (which may hold the password) is dropped once verified or cancelled.
     */
    private pendingMfa: {
        session: SupabaseAuthSession;
        methods: SecondFactorMethod[];
        complete: (session: SupabaseAuthSession) => Promise<AuthResult>;
    } | null = null;
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        super(3); // Enforce 3-attempt lockout for cloud auth
        this.restoreSessionFromStorage();
        // A restored session can pull, but only writes once the same user has unlocked their vault.
        vaultService.subscribeStatus((status) => {
            if (status === 'unlocked') {
                void this.enableReplicationIfOwner();
            } else {
                getSyncedStorageProvider()?.disableReplication();
            }
        });
    }

    /** The local vault is a cache of the server copy, so it can always be re-pulled. */
    protected override canDiscardLocalVault(): boolean {
        return true;
    }

    private async enableReplicationIfOwner(): Promise<void> {
        const session = this.supabaseSession;
        if (!session) return;
        try {
            const user = await userRepository.getUser();
            if (user && user.id === session.user.id) {
                getSyncedStorageProvider()?.enableReplication(user.id);
            }
        } catch {
            // Vault locked again before the profile could be read
        }
    }

    /** Uploads this device's freshly created vault header, then lets the vault replicate. */
    private async publishNewVault(session: SupabaseAuthSession): Promise<void> {
        const header = vaultService.getVaultHeader();
        if (!header) throw new Error('Vault header is missing.');
        await supabaseClient.upsertVaultHeader(session.accessToken, header as unknown as Record<string, unknown>);
        getSyncedStorageProvider()?.enableReplication(session.user.id);
    }

    private restoreSessionFromStorage(): void {
        if (typeof window === 'undefined') return;
        try {
            const raw = localStorage.getItem('gf_sb_session');
            if (raw) {
                const parsed = JSON.parse(raw) as SupabaseAuthSession;
                // An expired access token is kept while it can still be refreshed.
                if (parsed.expiresAt > Date.now() || parsed.refreshToken) {
                    this.supabaseSession = parsed;
                    getSyncedStorageProvider()?.setSupabaseSession(parsed);
                    this.scheduleRefresh(parsed);
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
        this.scheduleRefresh(session);
        if (typeof window === 'undefined') return;
        if (session) {
            localStorage.setItem('gf_sb_session', JSON.stringify(session));
        } else {
            localStorage.removeItem('gf_sb_session');
        }
    }

    /** Refreshes the access token shortly before it expires so sync never silently stops. */
    private scheduleRefresh(session: SupabaseAuthSession | null): void {
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
        if (!session?.refreshToken || typeof window === 'undefined') return;
        const delayMs = Math.max(session.expiresAt - Date.now() - SESSION_REFRESH_MARGIN_MS, 5_000);
        this.refreshTimer = setTimeout(() => {
            void this.refreshActiveSession().catch(() => undefined);
        }, delayMs);
    }

    private async refreshActiveSession(): Promise<SupabaseAuthSession | null> {
        const current = this.supabaseSession;
        if (!current?.refreshToken) return null;
        const refreshed = await supabaseClient.refreshSession(current.refreshToken);
        this.persistSession({ ...refreshed, user: refreshed.user ?? current.user });
        return this.supabaseSession;
    }

    /** The current session, refreshed first when its access token is about to expire. */
    private async getActiveSession(): Promise<SupabaseAuthSession | null> {
        const current = this.supabaseSession;
        if (!current) return null;
        if (current.expiresAt - Date.now() > SESSION_REFRESH_MARGIN_MS) return current;
        try {
            return await this.refreshActiveSession();
        } catch {
            this.persistSession(null);
            return null;
        }
    }

    private provisionalUser(session: SupabaseAuthSession, email: string, authProvider: User['authProvider']): User {
        return {
            id: session.user.id,
            name: session.user.user_metadata?.name || email.split('@')[0],
            email,
            avatar: session.user.user_metadata?.avatar_url || '',
            preferences: getInitialAuthPreferences(),
            xp: 0,
            level: 1,
            authProvider,
            emailVerified: Boolean(session.user.email_confirmed_at),
        };
    }

    /**
     * Opt-in MFA: an account with a verified TOTP factor must reach AAL2 before its vault is
     * touched (listing failures abort the sign-in). Without TOTP, a password sign-in still asks
     * for a registered passkey; that check is app-level since Supabase has no passkey MFA level.
     */
    private async continueAfterPrimaryAuth(
        session: SupabaseAuthSession,
        authProvider: User['authProvider'],
        complete: (session: SupabaseAuthSession) => Promise<AuthResult>,
        options?: { offerPasskey?: boolean }
    ): Promise<AuthResult> {
        const factors = await supabaseClient.listMfaFactors(session.accessToken);
        const methods: SecondFactorMethod[] = [];
        if (factors.some(factor => factor.factor_type === 'totp')) {
            if (getSessionAssurance(session.accessToken).aal !== 'aal2') methods.push('totp');
        }
        if (options?.offerPasskey) {
            const passkeys = await supabaseClient.listPasskeys(session.accessToken).catch(() => []);
            if (passkeys.length > 0) methods.push('passkey');
        }

        if (methods.length > 0) {
            this.pendingMfa = { session, methods, complete };
            return {
                user: this.provisionalUser(session, (session.user.email || '').toLowerCase(), authProvider),
                session: createSessionRecord(session.user.id),
                requiresTwoFactor: true,
                secondFactorMethods: methods,
                tempUserId: session.user.id,
            };
        }
        return complete(session);
    }

    public async getActiveAccessToken(): Promise<string | undefined> {
        return (await this.getActiveSession())?.accessToken;
    }

    /** Supabase passkey sign-in: the same gesture yields the PRF secret that unlocks the vault. */
    public override async signInWithPasskey(): Promise<AuthResult> {
        const ceremony = await supabaseClient.startPasskeyAuthentication();
        const rpId = typeof ceremony.options.rpId === 'string' ? ceremony.options.rpId : undefined;
        passkeyService.rememberServerRpId(rpId);
        const assertion = await passkeyService.authenticate({ serverOptions: ceremony.options, withPrf: true });
        const session = await supabaseClient.verifyPasskeyAuthentication(ceremony.challenge_id, assertion.credentialJson);
        return this.finishPasskeySignIn(session, { ...assertion, rpId });
    }

    private async finishPasskeySignIn(
        session: SupabaseAuthSession,
        assertion: { credentialId: string; prfSecret?: Uint8Array; rpId?: string }
    ): Promise<AuthResult> {
        this.persistSession(session);
        const synced = getSyncedStorageProvider();
        const pull = synced ? await synced.pullFromRemote() : { ok: true, hasRemoteHeader: vaultService.isInitialized() };
        if (!pull.ok) {
            throw new Error(VAULT_UNREACHABLE);
        }
        if (!pull.hasRemoteHeader || !assertion.prfSecret || !vaultService.hasPasskeySlot(assertion.credentialId)) {
            await this.signOut();
            throw new Error('This passkey cannot unlock your vault on this device. Sign in with your password.');
        }

        if (vaultService.isUnlocked()) await vaultService.lock();
        await vaultService.unlockWithPasskeyPrf(assertion.credentialId, assertion.prfSecret);
        // Self-heal slots enrolled before the RP ID was stored, so the lock screen finds them
        if (assertion.rpId) vaultService.updatePasskeySlotMeta(assertion.credentialId, { rpId: assertion.rpId });

        const user = await this.resolveEmailUser(session, (session.user.email || '').toLowerCase());
        getSyncedStorageProvider()?.enableReplication(session.user.id);
        this.resetFailures();
        await auditLogService.record('passkey_authenticated', `Passkey sign-in for ${user.email}`);
        return { user, session: createSessionRecord(user.id) };
    }

    /** Profile of an email account from its unlocked vault, rebuilt if missing or foreign. */
    private async resolveEmailUser(session: SupabaseAuthSession, cleanEmail: string): Promise<User> {
        const isEmailConfirmed = Boolean(session.user.email_confirmed_at);
        let user = await userRepository.getUser();
        if (user && (user.id === 'u1' || user.email.toLowerCase() === 'demo@glassfolio.com' || (user.id !== session.user.id && user.email.toLowerCase() !== cleanEmail))) {
            user = null;
        }
        if (!user) {
            user = { ...this.provisionalUser(session, cleanEmail, 'email'), emailVerified: isEmailConfirmed };
            await userRepository.saveUser(user);
        } else if (user.authProvider !== 'email' || user.emailVerified !== isEmailConfirmed) {
            user.authProvider = 'email';
            user.emailVerified = isEmailConfirmed;
            await userRepository.saveUser(user);
        }
        return user;
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
                const hashType = hashParams.get('type');
                // When Supabase sends links for email flows (recovery, email_change, signup),
                // the hash contains type != 'oauth'. Do not consume or treat these as OAuth logins.
                if (hashType && hashType !== 'oauth' && hashType !== 'bearer') {
                    return null;
                }
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

        return this.continueAfterPrimaryAuth(session, 'google', (verified) => this.finishOAuthSignIn(verified, sbUser));
    }

    private async finishOAuthSignIn(session: SupabaseAuthSession, sbUser: SupabaseUserData): Promise<AuthResult> {
        this.persistSession(session);

        // 2. Clear any leftover demo vault if present so demo data never mixes with Google account
        if (vaultService.isDemoVault()) {
            await vaultService.resetVault();
        }

        // 3. Pull user's encrypted vault from Supabase PostgREST. An unreachable vault must never be
        //    mistaken for a missing one: creating a new vault would orphan the user's data.
        const synced = getSyncedStorageProvider();
        const pull = synced ? await synced.pullFromRemote() : { ok: true, hasRemoteHeader: false };
        if (!pull.ok) {
            throw new Error('Your encrypted vault could not be reached. Check your connection and try again.');
        }

        // 4. Zero-Password Seamless Vault Initialization or Unlock (Option A)
        const oauthEmail = (sbUser.email || '').trim().toLowerCase();
        const oauthVaultSecret = `gf-oauth-e2ee-v1:${sbUser.id}:${oauthEmail}`;

        if (pull.hasRemoteHeader) {
            const header = vaultService.getVaultHeader();
            if (header && (header.authProvider === 'email' || header.authProvider === 'local')) {
                await auditLogService.record('account_conflict_blocked', `Account conflict for ${oauthEmail}: user already has password vault`, 'warning');
                throw new Error('An account already exists with this email address using password authentication. Please log in with your master password.');
            }

            try {
                if (!vaultService.isUnlocked()) {
                    await vaultService.unlockOAuthVault(oauthVaultSecret);
                }
                getSyncedStorageProvider()?.enableReplication(sbUser.id);
            } catch (err) {
                // The server copy itself cannot be opened with this account's secret: it is unrecoverable.
                console.error('[authService] E2EE vault OAuth unlock error, recreating clean OAuth vault', err);
                await vaultService.resetVault();
                await vaultService.setupOAuthVault(oauthVaultSecret);
                await this.publishNewVault(session);
                await auditLogService.record('vault_reset', `Unreadable OAuth vault recreated for ${oauthEmail}`, 'warning');
            }
        } else {
            await vaultService.resetVault();
            await vaultService.setupOAuthVault(oauthVaultSecret);
            await this.publishNewVault(session);
        }

        // 5. Construct or retrieve user profile
        let user = await userRepository.getUser();
        const googleName = sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || oauthEmail.split('@')[0] || 'Investor';
        const googleAvatar = sbUser.user_metadata?.avatar_url || sbUser.user_metadata?.picture || '';

        if (user && (user.id === 'u1' || user.email.toLowerCase() === 'demo@glassfolio.com' || (user.id !== sbUser.id && user.email.toLowerCase() !== oauthEmail))) {
            user = null;
        }

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
        options?: SignUpOptions
    ): Promise<AuthResult> {
        const pending = await this.beginSignupVerification(email, password, name, options);
        // Projects with email confirmation disabled return a live session. They may
        // complete setup immediately without weakening the verified-email flow.
        if (this.pendingSignupSession?.accessToken && this.pendingSignupSession.user.email_confirmed_at !== null) {
            const recoveryKey = await this.preparePendingSignup(pending.email, password, pending.name);
            const completed = await this.completePendingSignup(true);
            return { ...completed, recoveryKey };
        }
        return {
            user: {
                id: '', name: pending.name, email: pending.email, avatar: '', preferences: getInitialAuthPreferences(),
                xp: 0, level: 1, authProvider: 'email', emailVerified: false,
            },
            session: createSessionRecord('pending-signup'),
        };
    }

    public async beginSignupVerification(
        email: string,
        password: string,
        name: string,
        options?: SignUpOptions
    ): Promise<PendingSignup> {
        this.checkLockout();
        const validation = evaluatePassword(password);
        if (!validation.isValid) {
            throw new Error('Password does not meet NIST security requirements (minimum 12 characters, complexity required).');
        }
        const session = await supabaseClient.signUp(email.trim().toLowerCase(), password, name, {
            ...options,
            locale: getInitialAuthPreferences().language,
        });
        if (session.accessToken && session.user.email_confirmed_at !== null) this.pendingSignupSession = session;
        this.signupDraft = { email: email.trim().toLowerCase(), password, name: name.trim() };
        return { email: email.trim().toLowerCase(), name: name.trim() || 'Investor' };
    }

    public getSignupDraftEmail(): string | null {
        return this.signupDraft?.email ?? null;
    }

    /** The address was confirmed through the link (another tab or device): sign in with the draft password. */
    public async continueSignupAfterLinkVerification(): Promise<string> {
        const draft = this.signupDraft;
        if (!draft) throw new Error(SIGN_IN_EXPIRED);
        this.pendingSignupSession = await supabaseClient.signInWithPassword(draft.email, draft.password);
        return this.preparePendingSignup();
    }

    /** Abandons the sign-up: ends its session and drops the vault that was never published. */
    public async cancelPendingSignup(): Promise<void> {
        const session = this.pendingSignupSession;
        const vaultWasPrepared = this.pendingSignupUser !== null;
        this.pendingSignupSession = null;
        this.pendingSignupUser = null;
        this.signupDraft = null;
        if (session?.accessToken) await supabaseClient.signOut(session.accessToken);
        if (vaultWasPrepared) await vaultService.resetVault();
    }

    public async preparePendingSignup(email?: string, password?: string, name?: string): Promise<string> {
        const draft = this.signupDraft;
        const cleanEmail = (email ?? draft?.email ?? '').trim().toLowerCase();
        const secret = password ?? draft?.password;
        const session = this.pendingSignupSession;
        if (!session || !secret || session.user.email?.toLowerCase() !== cleanEmail) {
            throw new Error('Verify your email before creating the vault.');
        }

        // Signing up again with an unconfirmed address keeps the first password at Supabase:
        // align it with the vault password, which is the same secret.
        try {
            await supabaseClient.updateUser(session.accessToken, { password: secret });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '';
            if (!/different from the old password|same_password/i.test(message)) throw err;
        }

        await vaultService.resetVault();
        const setupRes = await vaultService.setup(secret, { authProvider: 'email' });
        db.resetAccountDataToZero();
        this.pendingSignupUser = {
            id: session.user.id,
            name: (name ?? draft?.name ?? '').trim() || session.user.user_metadata?.name || 'Investor',
            email: cleanEmail,
            avatar: session.user.user_metadata?.avatar_url || '',
            preferences: getInitialAuthPreferences(),
            xp: 0,
            level: 1,
            authProvider: 'email',
            emailVerified: true,
        };
        return setupRes.recoveryKey;
    }

    public async completePendingSignup(legacyImmediateSignup = false): Promise<AuthResult> {
        if (!this.pendingSignupSession || !this.pendingSignupUser) {
            throw new Error('No verified signup is waiting for completion.');
        }
        const session = this.pendingSignupSession;
        const user = this.pendingSignupUser;
        this.persistSession(session);
        const rawHeader = appStorage.getBacking().getItem(VAULT_HEADER_KEY);
        if (!rawHeader && !legacyImmediateSignup) throw new Error('Vault header is missing.');
        if (!legacyImmediateSignup && rawHeader) {
            await supabaseClient.upsertVaultHeader(session.accessToken, JSON.parse(rawHeader) as Record<string, unknown>);
            // Informative only: the header insert stamps app_metadata server-side (migration 0003).
            await supabaseClient.updateUser(session.accessToken, { data: { glassfolio_signup_state: 'complete' } }).catch(() => undefined);
        }
        getSyncedStorageProvider()?.enableReplication(session.user.id);
        await userRepository.saveUser(user);
        this.pendingSignupSession = null;
        this.pendingSignupUser = null;
        this.signupDraft = null;
        this.resetFailures();
        await auditLogService.record('auth_login', `Supabase signup completed for ${user.email}`);
        return {
            user,
            session: createSessionRecord(user.id),
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

        let sbSession: SupabaseAuthSession;
        try {
            sbSession = await supabaseClient.signInWithPassword(cleanEmail, password, options);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Invalid credentials.';
            if (/email not confirmed|email_not_confirmed/i.test(message)) {
                this.signupDraft = { email: cleanEmail, password, name: '' };
                throw new EmailNotConfirmedError();
            }
            this.registerFailure();
            throw new Error(message);
        }

        return this.continueAfterPrimaryAuth(
            sbSession,
            'email',
            (session) => this.finishPasswordSignIn(session, password, cleanEmail),
            { offerPasskey: true }
        );
    }

    /** Opens the account's vault with the password once the session has the required assurance. */
    private async finishPasswordSignIn(session: SupabaseAuthSession, password: string, cleanEmail: string): Promise<AuthResult> {
        const synced = getSyncedStorageProvider();
        synced?.setSupabaseSession(session);
        const pull = synced ? await synced.pullFromRemote() : { ok: true, hasRemoteHeader: vaultService.isInitialized() };
        if (!pull.ok) {
            throw new Error(VAULT_UNREACHABLE);
        }
        if (!pull.hasRemoteHeader) {
            // Verified address but the vault was never finalized: resume the sign-up (new recovery key).
            synced?.setSupabaseSession(this.supabaseSession);
            this.pendingSignupSession = session;
            this.signupDraft = { email: cleanEmail, password, name: session.user.user_metadata?.name || '' };
            return {
                user: this.provisionalUser(session, cleanEmail, 'email'),
                session: createSessionRecord(session.user.id),
                requiresSignupCompletion: true,
            };
        }
        this.persistSession(session);

        // Unlock with this password even if a vault was left open: it proves they match.
        if (vaultService.isUnlocked()) await vaultService.lock();
        try {
            await vaultService.unlock(password);
        } catch {
            this.registerFailure();
            throw new Error('Your vault could not be opened with this password. Use your recovery key to reset it.');
        }

        const user = await this.resolveEmailUser(session, cleanEmail);
        getSyncedStorageProvider()?.enableReplication(session.user.id);
        this.resetFailures();
        await auditLogService.record('auth_login', `Supabase signin for ${user.email}`);

        return {
            user,
            session: createSessionRecord(user.id),
        };
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

        const active = await this.getActiveSession();
        if (!active) {
            throw new Error('Active session required for email update.');
        }

        // Step 2: Request Secure Email Change on Supabase
        await supabaseClient.updateUser(active.accessToken, { email: cleanNewEmail });

        // Step 3: Record pending email state
        if (user) {
            user.pendingEmail = cleanNewEmail;
            await userRepository.saveUser(user);
        }

        this.resetFailures();
        await auditLogService.record('email_change_requested', `Confirmation emails sent to verify change to ${cleanNewEmail}`);
    }

    public override async changePassword(oldPassword: string, newPassword: string, options?: { nonce?: string; totpCode?: string }): Promise<void> {
        this.checkLockout();

        const user = await userRepository.getUser();
        if (user?.authProvider === 'google') {
            throw new Error('Password change is disabled for Google OAuth accounts.');
        }

        const validation = evaluatePassword(newPassword);
        if (!validation.isValid) {
            throw new Error('Password does not meet NIST security requirements (minimum 12 characters, complexity required).');
        }

        if (!(await vaultService.verifyPassword(oldPassword))) {
            this.registerFailure();
            throw new Error('Invalid current password.');
        }
        let active = await this.getActiveSession();
        if (!active) {
            throw new Error('Your session expired. Sign in again to change your password.');
        }

        // In cloud mode, ensure we have an active session with proper AAL assurance
        if (user?.email) {
            try {
                let freshSession = await supabaseClient.signInWithPassword(user.email, oldPassword);
                const factors = await supabaseClient.listMfaFactors(freshSession.accessToken).catch(() => []);
                const hasTotp = factors.some(f => f.factor_type === 'totp' && f.status === 'verified');
                if (hasTotp) {
                    if (options?.totpCode) {
                        freshSession = await this.verifyTotpForSession(freshSession, options.totpCode);
                    } else if (getSessionAssurance(active.accessToken).aal === 'aal2') {
                        freshSession = active;
                    }
                }
                active = freshSession;
                this.persistSession(active);
            } catch {
                // If re-authenticating with oldPassword fails, proceed with active session
            }
        }

        // Supabase first: the account and vault passwords are the same secret, so if the server
        // refuses (AAL2, reauthentication) the vault must keep the old one too.
        await supabaseClient.updateUser(active.accessToken, { password: newPassword, ...(options?.nonce ? { nonce: options.nonce } : {}) });
        try {
            await vaultService.changePassword(oldPassword, newPassword);
            const header = vaultService.getVaultHeader();
            if (header) {
                await supabaseClient.upsertVaultHeader(
                    active.accessToken,
                    header as unknown as Record<string, unknown>,
                    Boolean(header.totpEnabled)
                );
            }
        } catch (err) {
            await supabaseClient.updateUser(active.accessToken, { password: oldPassword }).catch(() => undefined);
            throw err;
        }

        this.resetFailures();
        await auditLogService.record('password_changed', 'Account password changed and vault key re-wrapped');
    }

    public override async requestPasswordReset(email: string, redirectTo?: string, options?: { captchaToken?: string }): Promise<void> {
        await delay(200);
        try {
            if (options?.captchaToken) {
                await supabaseClient.resetPasswordForEmail(email.trim().toLowerCase(), redirectTo, options.captchaToken);
            } else {
                await supabaseClient.resetPasswordForEmail(email.trim().toLowerCase(), redirectTo);
            }
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
        const active = await this.getActiveSession();
        if (active) {
            try {
                await supabaseClient.updateUser(active.accessToken, { password: newPassword });
            } catch {
                // If token expired, user will log in with new password
            }
        }

        this.resetFailures();
        await auditLogService.record('recovery_key_used', 'Emergency recovery key used to unlock vault', 'warning');
        await auditLogService.record('recovery_key_rotated', 'Recovery key rotated following emergency reset', 'info');

        return { newRecoveryKey: res.value.newRecoveryKey };
    }

    public override async resendEmailVerification(email?: string, options?: { captchaToken?: string }): Promise<void> {
        const targetEmail = email || this.signupDraft?.email || this.supabaseSession?.user.email;
        if (!targetEmail) {
            throw new Error('Email address required to resend verification.');
        }
        if (options?.captchaToken) {
            await supabaseClient.resendVerificationEmail(targetEmail, options.captchaToken);
        } else {
            await supabaseClient.resendVerificationEmail(targetEmail);
        }
    }

    public override async verifyEmailOtp(email: string, token: string): Promise<AuthResult> {
        const session = await supabaseClient.verifyEmailOtp(email.trim().toLowerCase(), token.trim());
        this.pendingSignupSession = session;
        return {
            user: { id: session.user.id, name: session.user.user_metadata?.name || 'Investor', email: email.trim().toLowerCase(), avatar: '', preferences: getInitialAuthPreferences(), xp: 0, level: 1, authProvider: 'email', emailVerified: true },
            session: createSessionRecord(session.user.id),
        };
    }

    /**
     * Email link. It only proves ownership of the address: no session or profile is kept here.
     * The vault is created by the tab or device that knows the password (sign-up tab or a later sign-in).
     */
    public override async verifyEmailTokenHash(
        tokenHash: string,
        type: EmailTokenHashType = 'signup'
    ): Promise<VerifyTokenHashResult> {
        const session = await supabaseClient.verifyTokenHash(tokenHash.trim(), type);
        const email = (session.user?.email || '').toLowerCase();
        const pendingEmail = session.user?.user_metadata?.new_email || session.user?.email;

        if (type === 'recovery') {
            // Keep the active session in memory so the recovery/reset flow can call updateUser({ password })
            this.supabaseSession = session;
            return { email, type, hasSession: Boolean(session.accessToken) };
        }

        if (type === 'signup' || type === 'email') {
            // Address ownership confirmed. The vault is created by the sign-up tab or subsequent sign-in.
            if (session.accessToken) {
                await supabaseClient.signOut(session.accessToken).catch(() => undefined);
            }
            return { email, type, hasSession: false };
        }

        if (type === 'email_change') {
            if (session.accessToken) {
                this.supabaseSession = session;
                const user = await userRepository.getUser();
                if (user && user.email !== email) {
                    user.email = email;
                    delete user.pendingEmail;
                    await userRepository.saveUser(user);
                }
                return { email, type, hasSession: true };
            }
            // First confirmation (awaiting 2nd confirmation link on the other address)
            return { email, type, hasSession: false, pendingEmail };
        }

        // magiclink / invite
        if (session.accessToken) {
            this.supabaseSession = session;
        }
        return { email, type, hasSession: Boolean(session.accessToken) };
    }

    public override async syncEmailLocale(locale: string): Promise<void> {
        const normalized = locale.slice(0, 2).toLowerCase();
        const active = await this.getActiveSession();
        if (!active) return;
        await supabaseClient.updateUser(active.accessToken, { data: { locale: normalized } }).catch(() => undefined);
    }

    public override async verifySecondFactor(tokenOrCode: string): Promise<AuthResult> {
        if (!this.pendingMfa) return super.verifySecondFactor(tokenOrCode);
        this.checkLockout();

        const pending = this.pendingMfa;
        if (!pending.methods.includes('totp')) {
            throw new Error('Confirm this sign-in with one of your passkeys.');
        }
        let upgraded: SupabaseAuthSession;
        try {
            upgraded = await this.verifyTotpForSession(pending.session, tokenOrCode);
        } catch {
            this.registerFailure();
            throw new Error('Invalid two-factor authentication code.');
        }
        this.pendingMfa = null;

        const result = await pending.complete({ ...upgraded, user: upgraded.user ?? pending.session.user });
        await auditLogService.record('totp_verified', 'Two-factor authentication challenge passed').catch(() => undefined);
        return result;
    }

    /** Password sign-in confirmed by a Supabase passkey of the same account. */
    public override async verifySecondFactorWithPasskey(): Promise<AuthResult> {
        if (!this.pendingMfa) return super.verifySecondFactorWithPasskey();
        const pending = this.pendingMfa;
        if (!pending.methods.includes('passkey')) {
            throw new Error('A code from your authenticator app is required.');
        }

        const ceremony = await supabaseClient.startPasskeyAuthentication();
        const assertion = await passkeyService.authenticate({ serverOptions: ceremony.options });
        let passkeySession: SupabaseAuthSession;
        try {
            passkeySession = await supabaseClient.verifyPasskeyAuthentication(ceremony.challenge_id, assertion.credentialJson);
        } catch {
            this.registerFailure();
            throw new Error('This passkey could not be verified.');
        }
        if (passkeySession.user.id !== pending.session.user.id) {
            await supabaseClient.signOut(passkeySession.accessToken);
            this.registerFailure();
            throw new Error('This passkey belongs to another account.');
        }

        this.pendingMfa = null;
        await supabaseClient.signOut(pending.session.accessToken);
        const result = await pending.complete(passkeySession);
        await auditLogService.record('passkey_authenticated', 'Passkey second factor verified').catch(() => undefined);
        return result;
    }

    public override async cancelSecondFactor(): Promise<void> {
        const pending = this.pendingMfa;
        this.pendingMfa = null;
        if (pending) {
            await supabaseClient.signOut(pending.session.accessToken);
        }
        await super.cancelSecondFactor();
    }

    public getSupabaseAccessToken(): string | undefined {
        return this.supabaseSession?.accessToken;
    }

    public async enrollMfaTotp(friendlyName?: string): Promise<{ id: string; secret: string; qrCodeSvg?: string; uri?: string } | null> {
        const active = await this.getActiveSession();
        if (!active) return null;
        const accessToken = active.accessToken;
        // Abandoned enrollments leave unverified factors behind; they would collide with a new one.
        const stale = await supabaseClient.listMfaFactors(accessToken, { includeUnverified: true });
        await Promise.all(stale
            .filter(factor => factor.factor_type === 'totp' && factor.status === 'unverified')
            .map(factor => supabaseClient.unenrollMfaFactor(accessToken, factor.id).catch(() => undefined)));
        const name = friendlyName || `Authenticator ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
        const res = await supabaseClient.enrollMfaFactor(accessToken, 'totp', name);
        const totpData = res.totp as { secret?: string; qr_code?: string; uri?: string } | undefined;
        return {
            id: res.id as string,
            secret: totpData?.secret || '',
            qrCodeSvg: totpData?.qr_code,
            uri: totpData?.uri,
        };
    }

    /** Proves possession of the TOTP factor and upgrades the current session to AAL2. */
    public async verifyTotpCode(code: string): Promise<void> {
        const active = await this.getActiveSession();
        if (!active) throw new Error('Active session required for two-factor verification.');
        const upgraded = await this.verifyTotpForSession(active, code);
        this.persistSession(upgraded);
    }

    private async verifyTotpForSession(session: SupabaseAuthSession, code: string): Promise<SupabaseAuthSession> {
        const factors = await supabaseClient.listMfaFactors(session.accessToken);
        const factor = factors.find(candidate => candidate.factor_type === 'totp');
        if (!factor) throw new Error('No verified authenticator app is enrolled on this account.');
        const challenge = await supabaseClient.challengeMfaFactor(session.accessToken, factor.id);
        return supabaseClient.verifyMfaFactor(session.accessToken, factor.id, challenge.id, code.trim());
    }

    public async verifyMfaEnrollment(factorId: string, code: string): Promise<void> {
        const active = await this.getActiveSession();
        if (!active) throw new Error('Active session required for MFA enrollment.');
        const challenge = await supabaseClient.challengeMfaFactor(active.accessToken, factorId);
        const upgradedSession = await supabaseClient.verifyMfaFactor(active.accessToken, factorId, challenge.id, code);
        this.persistSession(upgradedSession);
    }

    public async unenrollMfa(factorId: string): Promise<void> {
        const active = await this.getActiveSession();
        if (!active) throw new Error('Active session required to remove factor.');
        await supabaseClient.unenrollMfaFactor(active.accessToken, factorId);
    }

    public async listMfaFactors(): Promise<Array<{ id: string; factor_type: string; friendly_name?: string }>> {
        const active = await this.getActiveSession();
        if (!active) return [];
        return supabaseClient.listMfaFactors(active.accessToken);
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
        this.pendingMfa = null;
        if (this.supabaseSession) {
            await supabaseClient.signOut(this.supabaseSession.accessToken);
        }
        this.persistSession(null);
        await super.signOut();
    }

    /**
     * Cloud step-up: a fresh password sign-in (renews the `amr` timestamp checked by the account
     * deletion RPC), raised to AAL2 with TOTP when enrolled, or confirmed by a passkey otherwise.
     * Google accounts have no password: they must have signed in recently (see isRecentlyAuthenticated).
     */
    public override async reauthenticate(proof: StepUpProof): Promise<void> {
        this.checkLockout();
        const current = await this.getActiveSession();
        if (!current?.user.email) throw new Error(SIGN_IN_EXPIRED);
        if (!proof.password) throw new Error('Invalid master password.');

        let session: SupabaseAuthSession;
        try {
            session = await supabaseClient.signInWithPassword(current.user.email, proof.password);
        } catch {
            this.registerFailure();
            throw new Error('Invalid master password.');
        }
        if (session.user.id !== current.user.id) throw new Error(SIGN_IN_EXPIRED);

        const factors = await supabaseClient.listMfaFactors(session.accessToken);
        if (factors.some(factor => factor.factor_type === 'totp')) {
            try {
                session = await this.verifyTotpForSession(session, proof.totpCode || '');
            } catch {
                await supabaseClient.signOut(session.accessToken);
                this.registerFailure();
                throw new Error('Invalid two-factor authentication code.');
            }
        } else if (proof.usePasskey) {
            const ceremony = await supabaseClient.startPasskeyAuthentication();
            const assertion = await passkeyService.authenticate({ serverOptions: ceremony.options });
            const passkeySession = await supabaseClient.verifyPasskeyAuthentication(ceremony.challenge_id, assertion.credentialJson);
            await supabaseClient.signOut(session.accessToken);
            if (passkeySession.user.id !== current.user.id) {
                await supabaseClient.signOut(passkeySession.accessToken);
                throw new Error('This passkey belongs to another account.');
            }
            session = passkeySession;
        }

        this.persistSession({ ...session, user: session.user ?? current.user });
        await supabaseClient.signOut(current.accessToken);
        this.resetFailures();
    }

    public isRecentlyAuthenticated(maxAgeSeconds: number): boolean {
        if (!this.supabaseSession) return false;
        const newest = Math.max(0, ...getSessionAssurance(this.supabaseSession.accessToken).amr.map(entry => entry.timestamp));
        return Date.now() / 1000 - newest <= maxAgeSeconds;
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

        const active = await this.getActiveSession();
        if (!active) {
            throw new Error('Your session expired. Sign in again to delete your account.');
        }
        await supabaseClient.deleteOwnAccount(active.accessToken);

        await vaultService.resetVault();
        await userRepository.clearUser();
        db.resetToInitialData();
        await this.signOut();
        purgeLocalAccountFootprint();
        await requireLocalPersistence();
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
