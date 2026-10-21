/**
 * Vault Service — Orchestrates E2EE encrypted vault lifecycle (TGLA-041).
 *
 * Implements:
 *   - Setup: derives Dual-Keys (KEK + AuthKey), generates Recovery Key, wraps DEK, writes VaultHeader.
 *   - Unlock: unwraps non-extractable DEK, attaches EncryptedStorageProvider to appStorage.
 *   - Recovery: unlocks using the 160-bit recovery key.
 *   - Lock: flushes dirty writes, detaches & disposes encrypted provider, clears sensitive memory.
 *   - Auto-lock: inactivity timer (default 15 mins) + visibility change listener.
 *   - Escape hatch: complete vault reset & fallback to demo/initial state.
 */

import { delay } from '../db';
import { appStorage } from '../storage/appStorage';
import { EncryptedStorageProvider } from '../storage/EncryptedStorageProvider';
import { isGlassFolioKey, VAULT_HEADER_KEY } from '../storage/storageKeys';
import {
    createKdfParams,
    deriveMasterKeys,
    deriveOAuthKek,
    derivePasskeyKek,
    deriveRecoveryKek,
    formatRecoveryKey,
    generateExtractableDek,
    parseRecoveryKey,
    randomBytes,
    RECOVERY_KEY_BYTES,
    RECOVERY_KEY_256_BYTES,
    SALT_BYTES,
    unwrapDek,
    wipe,
    wrapDek,
} from './crypto';
import { toBase64 } from './encoding';
import { Result, ok, err, ValidationError } from '../../types/result';
import {
    InvalidVaultCredentialsError,
    VaultAlreadyInitializedError,
    VaultHeader,
    VaultHeaderCorruptedError,
    VaultNotInitializedError,
    VaultSetupResult,
    VaultStatus,
    VaultUnlockResult,
} from './vaultTypes';

type StatusListener = (status: VaultStatus) => void;

const DEFAULT_AUTOLOCK_MINUTES = 15;

export class VaultService {
    private currentStatus: VaultStatus = 'uninitialized';
    private autoLockTimeoutMs = DEFAULT_AUTOLOCK_MINUTES * 60 * 1000;
    private autoLockTimer: ReturnType<typeof setTimeout> | null = null;
    private lockOnVisibilityHidden = false;
    private readonly statusListeners = new Set<StatusListener>();
    private activityListenerAttached = false;

    constructor() {
        this.syncStatus();
        this.setupActivityListeners();
    }

    /**
     * Re-synchronizes internal status based on storage and provider state.
     */
    public syncStatus(): VaultStatus {
        if (!appStorage.isVaultInitialized()) {
            this.currentStatus = 'uninitialized';
        } else if (appStorage.getEncrypted()?.isOpen()) {
            this.currentStatus = 'unlocked';
        } else {
            this.currentStatus = 'locked';
        }
        return this.currentStatus;
    }

    public getStatus(): VaultStatus {
        return this.currentStatus;
    }

    public isInitialized(): boolean {
        return appStorage.isVaultInitialized();
    }

    public isUnlocked(): boolean {
        return this.currentStatus === 'unlocked';
    }

    public isDemoVault(): boolean {
        try {
            const header = this.getVaultHeader();
            return Boolean(header?.isDemo);
        } catch {
            return false;
        }
    }

    public subscribeStatus(listener: StatusListener): () => void {
        this.statusListeners.add(listener);
        listener(this.currentStatus);
        return () => this.statusListeners.delete(listener);
    }

    private setStatus(newStatus: VaultStatus): void {
        if (this.currentStatus === newStatus) return;
        this.currentStatus = newStatus;
        this.statusListeners.forEach(listener => {
            try {
                listener(newStatus);
            } catch (err) {
                console.error('[vaultService] Error in status listener', err);
            }
        });
    }

    /**
     * Returns the parsed vault header from backing storage.
     */
    public getVaultHeader(): VaultHeader | null {
        const raw = appStorage.getBacking().getItem(VAULT_HEADER_KEY);
        if (!raw) return null;
        try {
            const header = JSON.parse(raw) as VaultHeader;
            if (header.version === 1 && header.kdf && header.wrappedKeys) {
                return header;
            }
        } catch {
            // malformed
        }
        throw new VaultHeaderCorruptedError();
    }

    /**
     * Sets up a new E2EE encrypted vault with a master password.
     * Generates a high-entropy recovery key and returns it (shown ONCE to the user).
     */
    public async setup(
        password: string,
        options?: { isDemo?: boolean; authProvider?: 'local' | 'email' | 'google' | 'demo'; recoveryKeyBits?: 160 | 256 }
    ): Promise<VaultSetupResult> {
        await delay(300);

        if (this.isInitialized()) {
            throw new VaultAlreadyInitializedError();
        }

        // 1. Generate DEK (extractable momentarily to wrap)
        const dek = await generateExtractableDek();

        // 2. Derive Master KEK and AuthKey (PBKDF2 600k + HKDF)
        const kdf = createKdfParams();
        const { kek: passwordKek, authKey } = await deriveMasterKeys(password, kdf);

        // 3. Generate high-entropy Recovery Key (256 bits by default, or 160 bits if specified)
        const keyLength = options?.recoveryKeyBits === 160 ? RECOVERY_KEY_BYTES : RECOVERY_KEY_256_BYTES;
        const recoveryBytes = randomBytes(keyLength);
        const recoverySalt = toBase64(randomBytes(SALT_BYTES));
        const recoveryKek = await deriveRecoveryKek(recoveryBytes, recoverySalt);

        // 4. Wrap DEK with both KEKs
        const wrappedPasswordDek = await wrapDek(dek, passwordKek);
        const wrappedRecoveryDek = await wrapDek(dek, recoveryKek);

        // 5. Build and save consolidated VaultHeader
        const nowIso = new Date().toISOString();
        const passwordEntry = {
            alg: 'AES-KW' as const,
            wrapped: wrappedPasswordDek,
            createdAt: nowIso,
            salt: kdf.salt,
        };
        const recoveryEntry = {
            alg: 'AES-KW' as const,
            wrapped: wrappedRecoveryDek,
            createdAt: nowIso,
            salt: recoverySalt,
        };

        const header: VaultHeader = {
            version: 1,
            kdf,
            dekAlgorithm: 'AES-256-GCM',
            wrappedKeys: {
                password: passwordEntry,
                recovery: recoveryEntry,
                passkeys: [],
            },
            passwordSlot: passwordEntry,
            recoverySlot: recoveryEntry,
            createdAt: nowIso,
            updatedAt: nowIso,
            dekCreatedAt: nowIso,
            isDemo: Boolean(options?.isDemo),
            authProvider: options?.authProvider || (options?.isDemo ? 'demo' : 'local'),
            totpEnabled: false,
        };

        appStorage.getBacking().setItem(VAULT_HEADER_KEY, JSON.stringify(header));

        // 6. Unwrap DEK with extractable: false for runtime protection
        const runtimeDek = await unwrapDek(wrappedPasswordDek, passwordKek, false);

        // 7. Initialize EncryptedStorageProvider (which also encrypts any existing plaintext)
        const encrypted = await EncryptedStorageProvider.open(appStorage.getBacking(), runtimeDek);
        await encrypted.flush();
        appStorage.attachEncrypted(encrypted);

        if (!options?.isDemo) {
            const EMPTY_KEYS = [
                'glassfolio_transactions',
                'glassfolio_positions',
                'glassfolio_alerts',
                'glassfolio_alert_rules',
                'glassfolio_goals',
                'glassfolio_accounts',
                'glassfolio_unified_transactions',
                'glassfolio_import_batches',
                'glassfolio_asset_positions',
            ];
            for (const k of EMPTY_KEYS) {
                if (appStorage.getItem(k) === null) {
                    appStorage.setItem(k, '[]');
                }
            }
        }

        // Wipe sensitive raw buffers
        const recoveryKeyFormatted = formatRecoveryKey(recoveryBytes);
        wipe(recoveryBytes);

        this.setStatus('unlocked');
        this.resetAutoLockTimer();

        return {
            recoveryKey: recoveryKeyFormatted,
            authKey,
        };
    }

    /**
     * Unlocks the vault using the master password.
     */
    public async unlock(password: string): Promise<VaultUnlockResult> {
        await delay(300);

        const header = this.getVaultHeader();
        if (!header) {
            throw new VaultNotInitializedError();
        }

        try {
            // 1. Derive KEK and AuthKey with header's salt & iterations
            const { kek, authKey } = await deriveMasterKeys(password, header.kdf);

            // 2. Unwrap DEK with extractable: false
            const runtimeDek = await unwrapDek(header.wrappedKeys.password.wrapped, kek, false);

            // 3. Hydrate EncryptedStorageProvider and attach
            const encrypted = await EncryptedStorageProvider.open(appStorage.getBacking(), runtimeDek);
            await encrypted.flush();
            appStorage.attachEncrypted(encrypted);

            this.setStatus('unlocked');
            this.resetAutoLockTimer();

            return { authKey };
        } catch {
            throw new InvalidVaultCredentialsError();
        }
    }

    /**
     * Unlocks the vault using the Recovery Key.
     */
    public async unlockWithRecoveryKey(recoveryKeyInput: string): Promise<VaultUnlockResult> {
        await delay(400);

        const header = this.getVaultHeader();
        if (!header) {
            throw new VaultNotInitializedError();
        }
        if (!header.wrappedKeys.recovery) {
            throw new InvalidVaultCredentialsError();
        }

        const recoveryBytes = parseRecoveryKey(recoveryKeyInput);
        if (!recoveryBytes) {
            throw new InvalidVaultCredentialsError();
        }

        try {
            const recoverySalt = header.wrappedKeys.recovery.salt || header.recoverySlot?.salt || header.kdf.salt;
            const recoveryKek = await deriveRecoveryKek(recoveryBytes, recoverySalt);
            wipe(recoveryBytes);

            const runtimeDek = await unwrapDek(header.wrappedKeys.recovery.wrapped, recoveryKek, false);
            const encrypted = await EncryptedStorageProvider.open(appStorage.getBacking(), runtimeDek);
            await encrypted.flush();
            appStorage.attachEncrypted(encrypted);

            this.setStatus('unlocked');
            this.resetAutoLockTimer();

            // When unlocking with recovery key, authKey can be a sentinel or zeroed bytes
            return { authKey: new Uint8Array(32) };
        } catch {
            throw new InvalidVaultCredentialsError();
        }
    }

    /**
     * Enrolls a WebAuthn PRF-derived encryption key to unlock the vault.
     */
    public async enrollPasskeyPrf(
        credentialId: string,
        label: string,
        prfSecret: Uint8Array,
        masterPassword?: string
    ): Promise<void> {
        await delay(300);
        const header = this.getVaultHeader();
        if (!header) throw new VaultNotInitializedError();

        if (!masterPassword) {
            throw new Error('Master password is required to enroll passkey PRF wrapping.');
        }

        const derived = await deriveMasterKeys(masterPassword, header.kdf);
        let extractableDek: CryptoKey;
        try {
            extractableDek = await unwrapDek(header.wrappedKeys.password.wrapped, derived.kek, true);
        } catch {
            throw new InvalidVaultCredentialsError();
        }

        const passkeyKek = await derivePasskeyKek(prfSecret, header.kdf.salt);
        const wrappedPasskey = await wrapDek(extractableDek, passkeyKek);

        const existingPasskeys = header.wrappedKeys.passkeys || [];
        const updatedPasskeys = [
            ...existingPasskeys.filter(p => p.credentialId !== credentialId),
            {
                alg: 'AES-KW' as const,
                wrapped: wrappedPasskey,
                credentialId,
                label,
                createdAt: new Date().toISOString(),
                salt: header.kdf.salt,
            },
        ];

        const updatedHeader: VaultHeader = {
            ...header,
            wrappedKeys: {
                ...header.wrappedKeys,
                passkeys: updatedPasskeys,
            },
            updatedAt: new Date().toISOString(),
        };

        appStorage.getBacking().setItem(VAULT_HEADER_KEY, JSON.stringify(updatedHeader));
    }

    /**
     * Unlocks the vault using WebAuthn PRF output.
     */
    public async unlockWithPasskeyPrf(
        credentialId: string,
        prfSecret: Uint8Array
    ): Promise<VaultUnlockResult> {
        await delay(500);

        const header = this.getVaultHeader();
        if (!header) throw new VaultNotInitializedError();

        const passkeys = header.wrappedKeys.passkeys || [];
        const entry = passkeys.find(p => p.credentialId === credentialId);
        if (!entry) throw new InvalidVaultCredentialsError();

        try {
            const passkeySalt = entry.salt || header.kdf.salt;
            const passkeyKek = await derivePasskeyKek(prfSecret, passkeySalt);
            const runtimeDek = await unwrapDek(entry.wrapped, passkeyKek, false);
            const encrypted = await EncryptedStorageProvider.open(appStorage.getBacking(), runtimeDek);
            await encrypted.flush();
            appStorage.attachEncrypted(encrypted);

            this.setStatus('unlocked');
            this.resetAutoLockTimer();

            return { authKey: new Uint8Array(32) };
        } catch {
            throw new InvalidVaultCredentialsError();
        }
    }

    /**
     * Locks the vault immediately.
     */
    public async lock(): Promise<void> {
        this.clearAutoLockTimer();
        const encrypted = appStorage.detachEncrypted();
        if (encrypted) {
            await encrypted.flush();
            encrypted.dispose();
        }
        this.setStatus('locked');
    }

    /**
     * Changes the master password without re-encrypting data.
     * Re-wraps the DEK under a freshly derived KEK with new salt.
     */
    public async changePassword(oldPassword: string, newPassword: string): Promise<void> {
        await delay(400);

        const header = this.getVaultHeader();
        if (!header) throw new VaultNotInitializedError();

        // 1. Verify old password and unwrap DEK (momentarily extractable)
        const oldDerived = await deriveMasterKeys(oldPassword, header.kdf);
        let extractableDek: CryptoKey;
        try {
            extractableDek = await unwrapDek(header.wrappedKeys.password.wrapped, oldDerived.kek, true);
        } catch {
            throw new InvalidVaultCredentialsError();
        }

        // 2. Derive new Master KEK
        const newKdf = createKdfParams(header.kdf.iterations);
        const newDerived = await deriveMasterKeys(newPassword, newKdf);

        // 3. Wrap DEK with new KEK
        const newWrappedPassword = await wrapDek(extractableDek, newDerived.kek);

        // 4. Update recovery and passkeys slots while preserving their existing derivation salts
        const recoveryEntry = header.wrappedKeys.recovery ? {
            ...header.wrappedKeys.recovery,
            salt: header.wrappedKeys.recovery.salt || header.kdf.salt,
        } : null;

        const passkeysEntries = (header.wrappedKeys.passkeys || []).map(p => ({
            ...p,
            salt: p.salt || header.kdf.salt,
        }));

        const passwordEntry = {
            alg: 'AES-KW' as const,
            wrapped: newWrappedPassword,
            createdAt: new Date().toISOString(),
            salt: newKdf.salt,
        };

        const updatedHeader: VaultHeader = {
            ...header,
            kdf: newKdf,
            wrappedKeys: {
                ...header.wrappedKeys,
                password: passwordEntry,
                recovery: recoveryEntry,
                passkeys: passkeysEntries,
            },
            passwordSlot: passwordEntry,
            recoverySlot: recoveryEntry,
            updatedAt: new Date().toISOString(),
        };

        appStorage.getBacking().setItem(VAULT_HEADER_KEY, JSON.stringify(updatedHeader));
    }

    /**
     * Verifies whether a given password correctly unwraps the vault without altering state.
     */
    public async verifyPassword(password: string): Promise<boolean> {
        const header = this.getVaultHeader();
        if (!header) return false;
        try {
            const derived = await deriveMasterKeys(password, header.kdf);
            await unwrapDek(header.wrappedKeys.password.wrapped, derived.kek, false);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Initializes a seamless E2EE vault for Google OAuth users (0-Password flow).
     */
    public async setupOAuthVault(oauthSecret: string): Promise<void> {
        await delay(250);
        if (this.isInitialized()) {
            throw new VaultAlreadyInitializedError();
        }

        const dek = await generateExtractableDek();
        const kdf = createKdfParams();
        const oauthKek = await deriveOAuthKek(oauthSecret, kdf.salt);
        const wrappedDek = await wrapDek(dek, oauthKek);

        const nowIso = new Date().toISOString();
        const oauthEntry = {
            alg: 'AES-KW' as const,
            wrapped: wrappedDek,
            createdAt: nowIso,
            salt: kdf.salt,
        };

        const header: VaultHeader = {
            version: 1,
            kdf,
            dekAlgorithm: 'AES-256-GCM',
            wrappedKeys: {
                password: oauthEntry,
                recovery: null,
                passkeys: [],
            },
            passwordSlot: oauthEntry,
            recoverySlot: null,
            createdAt: nowIso,
            updatedAt: nowIso,
            dekCreatedAt: nowIso,
            isDemo: false,
            authProvider: 'google',
            totpEnabled: false,
        };

        appStorage.getBacking().setItem(VAULT_HEADER_KEY, JSON.stringify(header));

        const runtimeDek = await unwrapDek(wrappedDek, oauthKek, false);
        const encrypted = await EncryptedStorageProvider.open(appStorage.getBacking(), runtimeDek);
        await encrypted.flush();
        appStorage.attachEncrypted(encrypted);

        const EMPTY_KEYS = [
            'glassfolio_transactions',
            'glassfolio_positions',
            'glassfolio_alerts',
            'glassfolio_alert_rules',
            'glassfolio_goals',
            'glassfolio_accounts',
            'glassfolio_unified_transactions',
            'glassfolio_import_batches',
            'glassfolio_asset_positions',
        ];
        for (const k of EMPTY_KEYS) {
            if (appStorage.getItem(k) === null) {
                appStorage.setItem(k, '[]');
            }
        }

        this.setStatus('unlocked');
        this.resetAutoLockTimer();
    }

    /**
     * Unlocks a Google OAuth 0-Password vault automatically.
     */
    public async unlockOAuthVault(oauthSecret: string): Promise<void> {
        await delay(200);
        const header = this.getVaultHeader();
        if (!header) throw new VaultNotInitializedError();

        try {
            const oauthKek = await deriveOAuthKek(oauthSecret, header.kdf.salt);
            const runtimeDek = await unwrapDek(header.wrappedKeys.password.wrapped, oauthKek, false);
            const encrypted = await EncryptedStorageProvider.open(appStorage.getBacking(), runtimeDek);
            await encrypted.flush();
            appStorage.attachEncrypted(encrypted);

            this.setStatus('unlocked');
            this.resetAutoLockTimer();
        } catch {
            // Backward-compatibility fallback for pre-Epic 20 OAuth vaults (PBKDF2)
            try {
                const { kek: legacyKek } = await deriveMasterKeys(oauthSecret, header.kdf);
                const runtimeDek = await unwrapDek(header.wrappedKeys.password.wrapped, legacyKek, true);
                const encrypted = await EncryptedStorageProvider.open(appStorage.getBacking(), runtimeDek);
                await encrypted.flush();
                appStorage.attachEncrypted(encrypted);

                // Auto-upgrade wrapped key to HKDF oauthKek
                const newOauthKek = await deriveOAuthKek(oauthSecret, header.kdf.salt);
                const newWrapped = await wrapDek(runtimeDek, newOauthKek);
                header.wrappedKeys.password.wrapped = newWrapped;
                if (header.passwordSlot) {
                    header.passwordSlot.wrapped = newWrapped;
                }
                header.authProvider = 'google';
                appStorage.getBacking().setItem(VAULT_HEADER_KEY, JSON.stringify(header));

                this.setStatus('unlocked');
                this.resetAutoLockTimer();
            } catch {
                throw new InvalidVaultCredentialsError();
            }
        }
    }

    /**
     * Voluntarily regenerates the Emergency Recovery Key (e.g. from Settings security tab).
     */
    public async regenerateRecoveryKey(password: string): Promise<Result<{ recoveryKey: string }, ValidationError>> {
        await delay(350);
        const header = this.getVaultHeader();
        if (!header) return err(new ValidationError('Vault is not initialized.'));

        try {
            const derived = await deriveMasterKeys(password, header.kdf);
            const extractableDek = await unwrapDek(header.wrappedKeys.password.wrapped, derived.kek, true);

            // Generate fresh 256-bit recovery key and fresh salt
            const newRecoveryBytes = randomBytes(RECOVERY_KEY_256_BYTES);
            const newRecoverySalt = toBase64(randomBytes(SALT_BYTES));
            const newRecoveryKek = await deriveRecoveryKek(newRecoveryBytes, newRecoverySalt);
            const newWrappedRecovery = await wrapDek(extractableDek, newRecoveryKek);

            const recoveryEntry = {
                alg: 'AES-KW' as const,
                wrapped: newWrappedRecovery,
                createdAt: new Date().toISOString(),
                salt: newRecoverySalt,
            };

            const updatedHeader: VaultHeader = {
                ...header,
                wrappedKeys: {
                    ...header.wrappedKeys,
                    recovery: recoveryEntry,
                },
                recoverySlot: recoveryEntry,
                updatedAt: new Date().toISOString(),
            };

            appStorage.getBacking().setItem(VAULT_HEADER_KEY, JSON.stringify(updatedHeader));

            const formattedKey = formatRecoveryKey(newRecoveryBytes);
            wipe(newRecoveryBytes);
            return ok({ recoveryKey: formattedKey });
        } catch {
            return err(new ValidationError('Invalid master password.'));
        }
    }

    /**
     * Recovers access using the Emergency Recovery Key when password is forgotten,
     * re-wraps the DEK under the new password, and MANDATORILY ROTATES the Recovery Key.
     */
    public async recoverPasswordWithRecoveryKey(
        recoveryKeyInput: string,
        newPassword: string
    ): Promise<Result<{ newRecoveryKey: string }, ValidationError>> {
        await delay(400);
        const header = this.getVaultHeader();
        if (!header) return err(new ValidationError('Vault is not initialized.'));
        if (!header.wrappedKeys.recovery && !header.recoverySlot) {
            return err(new ValidationError('No recovery key slot configured on this vault.'));
        }

        const recoveryBytes = parseRecoveryKey(recoveryKeyInput);
        if (!recoveryBytes) {
            return err(new ValidationError('Invalid recovery key format.'));
        }

        try {
            const recoveryEntry = header.wrappedKeys.recovery || header.recoverySlot!;
            const recoverySalt = recoveryEntry.salt || header.kdf.salt;
            const recoveryKek = await deriveRecoveryKek(recoveryBytes, recoverySalt);
            wipe(recoveryBytes);

            // 1. Unwrap DEK as extractable
            const extractableDek = await unwrapDek(recoveryEntry.wrapped, recoveryKek, true);

            // 2. Derive new password KEK
            const newKdf = createKdfParams(header.kdf.iterations);
            const newDerived = await deriveMasterKeys(newPassword, newKdf);
            const newWrappedPassword = await wrapDek(extractableDek, newDerived.kek);

            // 3. Mandatory rotation of the Recovery Key (256-bit)
            const freshRecoveryBytes = randomBytes(RECOVERY_KEY_256_BYTES);
            const freshRecoverySalt = toBase64(randomBytes(SALT_BYTES));
            const freshRecoveryKek = await deriveRecoveryKek(freshRecoveryBytes, freshRecoverySalt);
            const freshWrappedRecovery = await wrapDek(extractableDek, freshRecoveryKek);

            const passwordSlot = {
                alg: 'AES-KW' as const,
                wrapped: newWrappedPassword,
                createdAt: new Date().toISOString(),
                salt: newKdf.salt,
            };
            const recoverySlot = {
                alg: 'AES-KW' as const,
                wrapped: freshWrappedRecovery,
                createdAt: new Date().toISOString(),
                salt: freshRecoverySalt,
            };

            const updatedHeader: VaultHeader = {
                ...header,
                kdf: newKdf,
                wrappedKeys: {
                    ...header.wrappedKeys,
                    password: passwordSlot,
                    recovery: recoverySlot,
                },
                passwordSlot,
                recoverySlot,
                updatedAt: new Date().toISOString(),
            };

            appStorage.getBacking().setItem(VAULT_HEADER_KEY, JSON.stringify(updatedHeader));

            // 4. Attach runtime EncryptedStorageProvider
            const runtimeDek = await unwrapDek(newWrappedPassword, newDerived.kek, false);
            const encrypted = await EncryptedStorageProvider.open(appStorage.getBacking(), runtimeDek);
            await encrypted.flush();
            appStorage.attachEncrypted(encrypted);

            this.setStatus('unlocked');
            this.resetAutoLockTimer();

            const formattedNewKey = formatRecoveryKey(freshRecoveryBytes);
            wipe(freshRecoveryBytes);
            return ok({ newRecoveryKey: formattedNewKey });
        } catch {
            return err(new ValidationError('Failed to decrypt vault with the provided recovery key.'));
        }
    }

    /**
     * Rotates the DEK entirely: generates a new DEK and re-encrypts all sensitive records.
     */
    public async rotateDek(password: string): Promise<void> {
        await delay(500);

        const header = this.getVaultHeader();
        if (!header) throw new VaultNotInitializedError();

        // 1. Verify credentials and derive current KEK
        const derived = await deriveMasterKeys(password, header.kdf);
        try {
            await unwrapDek(header.wrappedKeys.password.wrapped, derived.kek, false);
        } catch {
            throw new InvalidVaultCredentialsError();
        }

        const currentEncrypted = appStorage.getEncrypted();
        if (!currentEncrypted) throw new Error('Vault must be unlocked to rotate DEK');

        await currentEncrypted.flush();

        // 2. Generate new DEK
        const newExtractableDek = await generateExtractableDek();

        // 3. Read all current plaintext from current provider and re-encrypt in a fresh provider
        const keys = currentEncrypted.keys();
        const snapshot = new Map<string, string>();
        for (const k of keys) {
            const val = currentEncrypted.getItem(k);
            if (val !== null) snapshot.set(k, val);
        }

        // 4. Wrap new DEK with current password KEK
        const newWrappedPassword = await wrapDek(newExtractableDek, derived.kek);

        // 5. Update header
        const updatedHeader: VaultHeader = {
            ...header,
            wrappedKeys: {
                ...header.wrappedKeys,
                password: {
                    alg: 'AES-KW',
                    wrapped: newWrappedPassword,
                    createdAt: new Date().toISOString(),
                },
                recovery: null, // Recovery key must be regenerated after full DEK rotation
            },
            updatedAt: new Date().toISOString(),
            dekCreatedAt: new Date().toISOString(),
        };

        appStorage.getBacking().setItem(VAULT_HEADER_KEY, JSON.stringify(updatedHeader));

        // 6. Dispose old provider and attach new
        currentEncrypted.dispose();
        const newRuntimeDek = await unwrapDek(newWrappedPassword, derived.kek, false);
        const newProvider = await EncryptedStorageProvider.open(appStorage.getBacking(), newRuntimeDek);
        for (const [k, v] of snapshot.entries()) {
            newProvider.setItem(k, v);
        }
        await newProvider.flush();
        appStorage.attachEncrypted(newProvider);
    }

    /**
     * Escape hatch: completely wipes the vault header and all GlassFolio records.
     * Returns to uninitialized state so demo accounts or fresh setup can proceed.
     */
    public async resetVault(): Promise<void> {
        await delay(300);

        this.clearAutoLockTimer();
        const encrypted = appStorage.detachEncrypted();
        if (encrypted) {
            encrypted.dispose();
        }

        const backing = appStorage.getBacking();
        const allKeys = backing.keys();
        for (const key of allKeys) {
            if (isGlassFolioKey(key) || key === VAULT_HEADER_KEY) {
                backing.removeItem(key);
            }
        }

        this.setStatus('uninitialized');
    }

    // ── Auto-Lock Management ──────────────────────────────────────────────────

    public setAutoLockMinutes(minutes: number): void {
        this.autoLockTimeoutMs = Math.max(1, minutes) * 60 * 1000;
        this.resetAutoLockTimer();
    }

    public getAutoLockMinutes(): number {
        return Math.round(this.autoLockTimeoutMs / 60000);
    }

    public setLockOnVisibilityHidden(enabled: boolean): void {
        this.lockOnVisibilityHidden = enabled;
    }

    public resetAutoLockTimer(): void {
        this.clearAutoLockTimer();
        if (this.currentStatus !== 'unlocked' || this.autoLockTimeoutMs <= 0) return;

        this.autoLockTimer = setTimeout(() => {
            console.warn('[vaultService] Inactivity auto-lock triggered.');
            this.lock();
        }, this.autoLockTimeoutMs);
    }

    private clearAutoLockTimer(): void {
        if (this.autoLockTimer) {
            clearTimeout(this.autoLockTimer);
            this.autoLockTimer = null;
        }
    }

    private setupActivityListeners(): void {
        if (this.activityListenerAttached || typeof window === 'undefined') return;
        this.activityListenerAttached = true;

        const onActivity = () => {
            if (this.currentStatus === 'unlocked') {
                this.resetAutoLockTimer();
            }
        };

        window.addEventListener('mousemove', onActivity, { passive: true });
        window.addEventListener('keydown', onActivity, { passive: true });
        window.addEventListener('click', onActivity, { passive: true });
        window.addEventListener('scroll', onActivity, { passive: true });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && this.lockOnVisibilityHidden && this.currentStatus === 'unlocked') {
                console.warn('[vaultService] Visibility auto-lock triggered.');
                this.lock();
            }
        });
    }
}

export const vaultService = new VaultService();
