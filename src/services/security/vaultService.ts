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
import { requireLocalPersistence } from '../storage/storageFactory';
import { SyncedBackingStorageProvider } from '../storage/SyncedBackingStorageProvider';
import {
    createKdfParams,
    deriveDriveVaultKek,
    deriveMasterKeys,
    deriveOAuthKek,
    derivePasskeyKek,
    deriveRecoveryKek,
    formatRecoveryKey,
    generateExtractableDek,
    parseRecoveryKey,
    PBKDF2_ITERATIONS,
    randomBytes,
    RECOVERY_KEY_BYTES,
    RECOVERY_KEY_256_BYTES,
    SALT_BYTES,
    unwrapDek,
    wipe,
    wrapDek,
} from './crypto';
import { toBase64 } from './encoding';
import { deviceVaultKeyStore } from './deviceVaultKeyStore';
import { isSensitiveKey, isVaultScopedKey, VAULT_HEADER_KEY } from '../storage/storageKeys';
import { Result, ok, err, ValidationError } from '../../types/result';
import {
    GoogleDriveWrappedKeyEntry,
    InvalidVaultCredentialsError,
    PasskeySlotInfo,
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
                if (typeof header.kdf.iterations === 'number' && header.kdf.iterations < PBKDF2_ITERATIONS) {
                    throw new VaultHeaderCorruptedError();
                }
                return header;
            }
        } catch (err) {
            if (err instanceof VaultHeaderCorruptedError) throw err;
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
        const encrypted = await EncryptedStorageProvider.open(appStorage.getBacking(), runtimeDek, { adoptLegacyPlaintext: true });
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
                'glassfolio_institutes',
                'glassfolio_unified_transactions',
                'glassfolio_import_batches',
                'glassfolio_asset_positions',
                'glassfolio_achievements',
                'glassfolio_quests',
                'glassfolio_pinned_badges',
                'glassfolio_asset_groups',
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
        masterPassword?: string,
        meta: { rpId?: string; transports?: string[] } = {}
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

        // Each slot has its own salt so it survives password changes (which renew kdf.salt).
        const slotSalt = toBase64(randomBytes(SALT_BYTES));
        const passkeyKek = await derivePasskeyKek(prfSecret, slotSalt);
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
                salt: slotSalt,
                ...(meta.rpId ? { rpId: meta.rpId } : {}),
                ...(meta.transports?.length ? { transports: meta.transports } : {}),
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

    /** Passkeys able to unlock the vault. Read from the plaintext header, so available while locked. */
    public listPasskeySlots(): PasskeySlotInfo[] {
        try {
            return (this.getVaultHeader()?.wrappedKeys?.passkeys || []).map(p => ({
                credentialId: p.credentialId,
                label: p.label,
                ...(p.rpId ? { rpId: p.rpId } : {}),
                ...(p.transports?.length ? { transports: p.transports } : {}),
            }));
        } catch {
            return [];
        }
    }

    /**
     * Records the relying party / transports of a slot created before they were stored.
     * Header metadata only (no key material), so it works while the vault is locked.
     */
    public updatePasskeySlotMeta(credentialId: string, meta: { rpId?: string; transports?: string[] }): void {
        const header = this.getVaultHeader();
        if (!header?.wrappedKeys?.passkeys?.some(p => p.credentialId === credentialId)) return;
        const passkeys = header.wrappedKeys.passkeys.map(p => p.credentialId === credentialId
            ? {
                ...p,
                ...(meta.rpId ? { rpId: meta.rpId } : {}),
                ...(meta.transports?.length ? { transports: meta.transports } : {}),
            }
            : p);
        appStorage.getBacking().setItem(VAULT_HEADER_KEY, JSON.stringify({
            ...header,
            wrappedKeys: { ...header.wrappedKeys, passkeys },
        }));
    }

    /**
     * Checks if a passkey PRF keyslot is registered in the vault header.
     */
    public hasPasskeySlot(credentialId?: string): boolean {
        try {
            const header = this.getVaultHeader();
            const passkeys = header?.wrappedKeys?.passkeys;
            if (!passkeys || passkeys.length === 0) return false;
            if (credentialId) {
                return passkeys.some(p => p.credentialId === credentialId);
            }
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Removes a passkey PRF keyslot from the vault header.
     */
    public removePasskeyPrf(credentialId: string): void {
        try {
            const header = this.getVaultHeader();
            if (!header || !header.wrappedKeys?.passkeys) return;
            const updatedPasskeys = header.wrappedKeys.passkeys.filter(p => p.credentialId !== credentialId);
            const updatedHeader: VaultHeader = {
                ...header,
                wrappedKeys: {
                    ...header.wrappedKeys,
                    passkeys: updatedPasskeys,
                },
                updatedAt: new Date().toISOString(),
            };
            appStorage.getBacking().setItem(VAULT_HEADER_KEY, JSON.stringify(updatedHeader));
        } catch {
            // no-op if header missing or corrupted
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
        void deviceVaultKeyStore.clearAll().catch(() => undefined);
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
        const newKdf = createKdfParams(Math.max(PBKDF2_ITERATIONS, header.kdf.iterations));
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
     * Initializes an E2EE Split-Trust vault for Google OAuth users (0-Password flow).
     * The root key is stored in the user's hidden Google Drive appDataFolder, and an emergency
     * 256-bit recovery key is returned (shown once to the user).
     */
    public async setupGoogleDriveVault(
        driveSecret: Uint8Array,
        keyId: string,
        userId: string
    ): Promise<VaultSetupResult> {
        await delay(250);
        if (this.isInitialized()) {
            throw new VaultAlreadyInitializedError();
        }

        const dek = await generateExtractableDek();
        const kdf = createKdfParams();
        const driveSalt = toBase64(randomBytes(SALT_BYTES));
        const driveKek = await deriveDriveVaultKek(driveSecret, driveSalt);
        const wrappedDriveDek = await wrapDek(dek, driveKek);

        // Generate 256-bit emergency recovery key
        const recoveryBytes = randomBytes(RECOVERY_KEY_256_BYTES);
        const recoverySalt = toBase64(randomBytes(SALT_BYTES));
        const recoveryKek = await deriveRecoveryKek(recoveryBytes, recoverySalt);
        const wrappedRecoveryDek = await wrapDek(dek, recoveryKek);

        const nowIso = new Date().toISOString();
        const driveEntry: GoogleDriveWrappedKeyEntry = {
            alg: 'AES-KW',
            keyId,
            wrapped: wrappedDriveDek,
            salt: driveSalt,
            createdAt: nowIso,
        };
        const recoveryEntry = {
            alg: 'AES-KW' as const,
            wrapped: wrappedRecoveryDek,
            salt: recoverySalt,
            createdAt: nowIso,
        };

        const header: VaultHeader = {
            version: 1,
            kdf,
            dekAlgorithm: 'AES-256-GCM',
            wrappedKeys: {
                password: null,
                recovery: recoveryEntry,
                passkeys: [],
                googleDrive: driveEntry,
            },
            passwordSlot: null,
            recoverySlot: recoveryEntry,
            createdAt: nowIso,
            updatedAt: nowIso,
            dekCreatedAt: nowIso,
            isDemo: false,
            authProvider: 'google',
            totpEnabled: false,
        };

        appStorage.getBacking().setItem(VAULT_HEADER_KEY, JSON.stringify(header));

        const runtimeDek = await unwrapDek(wrappedDriveDek, driveKek, false);
        const encrypted = await EncryptedStorageProvider.open(appStorage.getBacking(), runtimeDek, { adoptLegacyPlaintext: false });
        await encrypted.flush();
        appStorage.attachEncrypted(encrypted);

        // Cache device key for instant page reloads
        await deviceVaultKeyStore.saveDeviceWrappedDek(userId, dek);

        const EMPTY_KEYS = [
            'glassfolio_transactions',
            'glassfolio_positions',
            'glassfolio_alerts',
            'glassfolio_alert_rules',
            'glassfolio_goals',
            'glassfolio_accounts',
            'glassfolio_institutes',
            'glassfolio_unified_transactions',
            'glassfolio_import_batches',
            'glassfolio_asset_positions',
            'glassfolio_achievements',
            'glassfolio_quests',
            'glassfolio_pinned_badges',
            'glassfolio_asset_groups',
        ];
        for (const k of EMPTY_KEYS) {
            if (appStorage.getItem(k) === null) {
                appStorage.setItem(k, '[]');
            }
        }

        const recoveryKeyFormatted = formatRecoveryKey(recoveryBytes);
        wipe(recoveryBytes);

        this.setStatus('unlocked');
        this.resetAutoLockTimer();

        return {
            recoveryKey: recoveryKeyFormatted,
            authKey: new Uint8Array(32),
        };
    }

    /**
     * Unlocks a Google Drive Split-Trust vault.
     */
    public async unlockGoogleDriveVault(driveSecret: Uint8Array, userId?: string): Promise<VaultUnlockResult> {
        await delay(200);
        const header = this.getVaultHeader();
        if (!header) throw new VaultNotInitializedError();

        const driveEntry = header.wrappedKeys.googleDrive;
        if (!driveEntry) {
            throw new InvalidVaultCredentialsError();
        }

        try {
            const driveKek = await deriveDriveVaultKek(driveSecret, driveEntry.salt);
            if (userId) {
                const extractableDek = await unwrapDek(driveEntry.wrapped, driveKek, true);
                await deviceVaultKeyStore.saveDeviceWrappedDek(userId, extractableDek);
            }
            const runtimeDek = await unwrapDek(driveEntry.wrapped, driveKek, false);
            const encrypted = await EncryptedStorageProvider.open(appStorage.getBacking(), runtimeDek, { adoptLegacyPlaintext: false });
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
     * Unlocks the vault using the local device key stored in IndexedDB (extractable: false).
     */
    public async unlockWithDeviceKey(userId: string): Promise<boolean> {
        if (!this.isInitialized() || this.isUnlocked()) return false;
        try {
            const runtimeDek = await deviceVaultKeyStore.loadDeviceWrappedDek(userId);
            if (!runtimeDek) return false;

            const encrypted = await EncryptedStorageProvider.open(appStorage.getBacking(), runtimeDek, { adoptLegacyPlaintext: false });
            await encrypted.flush();
            appStorage.attachEncrypted(encrypted);

            this.setStatus('unlocked');
            this.resetAutoLockTimer();
            return true;
        } catch {
            return false;
        }
    }

    /** True when the vault header carries a Google Drive split-trust slot (no password, no identity key). */
    public isGoogleDriveVault(): boolean {
        try {
            const header = this.getVaultHeader();
            return Boolean(header && header.authProvider === 'google' && header.wrappedKeys.googleDrive);
        } catch {
            return false;
        }
    }

    /**
     * Checks if the current vault is a legacy identity-derived Google vault that needs migration.
     */
    public isLegacyIdentityGoogleVault(): boolean {
        try {
            const header = this.getVaultHeader();
            return Boolean(
                header &&
                header.authProvider === 'google' &&
                !header.wrappedKeys.googleDrive &&
                header.wrappedKeys.password !== null
            );
        } catch {
            return false;
        }
    }

    /**
     * Migrates a legacy identity-wrapped Google vault to Google Drive appDataFolder E2EE:
     * - Unwraps old DEK one last time in memory using legacy secret
     * - Rotates DEK (generates fresh 256-bit DEK)
     * - Re-encrypts all sensitive records under the new DEK
     * - Generates 256-bit emergency recovery key
     * - Overwrites vault_headers with wrappedKeys.googleDrive and wrappedKeys.recovery (password: null)
     */
    public async migrateLegacyGoogleVault(
        legacyOAuthSecret: string,
        driveSecret: Uint8Array,
        keyId: string,
        userId: string
    ): Promise<VaultSetupResult> {
        await delay(300);
        const header = this.getVaultHeader();
        if (!header || !header.wrappedKeys.password) {
            throw new VaultNotInitializedError();
        }

        // 1. Unwrap old DEK in memory
        let oldDek: CryptoKey;
        try {
            const oauthKek = await deriveOAuthKek(legacyOAuthSecret, header.kdf.salt);
            oldDek = await unwrapDek(header.wrappedKeys.password.wrapped, oauthKek, true);
        } catch {
            const { kek: legacyKek } = await deriveMasterKeys(legacyOAuthSecret, header.kdf);
            oldDek = await unwrapDek(header.wrappedKeys.password.wrapped, legacyKek, true);
        }

        // 2. Open temporary encrypted provider to decrypt existing records in memory
        const tempProvider = await EncryptedStorageProvider.open(appStorage.getBacking(), oldDek, { adoptLegacyPlaintext: false });
        const decryptedRecords = new Map<string, string>();
        for (const key of appStorage.getBacking().keys()) {
            if (isSensitiveKey(key)) {
                const val = tempProvider.getItem(key);
                if (val !== null) decryptedRecords.set(key, val);
            }
        }

        // 3. Generate BRAND NEW DEK (DEK Rotation!)
        const newDek = await generateExtractableDek();

        // 4. Wrap new DEK under new Drive KEK
        const driveSalt = toBase64(randomBytes(SALT_BYTES));
        const driveKek = await deriveDriveVaultKek(driveSecret, driveSalt);
        const wrappedDriveDek = await wrapDek(newDek, driveKek);

        // 5. Wrap new DEK under fresh 256-bit Recovery Key
        const recoveryBytes = randomBytes(RECOVERY_KEY_256_BYTES);
        const recoverySalt = toBase64(randomBytes(SALT_BYTES));
        const recoveryKek = await deriveRecoveryKek(recoveryBytes, recoverySalt);
        const wrappedRecoveryDek = await wrapDek(newDek, recoveryKek);

        const nowIso = new Date().toISOString();
        const driveEntry: GoogleDriveWrappedKeyEntry = {
            alg: 'AES-KW',
            keyId,
            wrapped: wrappedDriveDek,
            salt: driveSalt,
            createdAt: nowIso,
        };
        const recoveryEntry = {
            alg: 'AES-KW' as const,
            wrapped: wrappedRecoveryDek,
            salt: recoverySalt,
            createdAt: nowIso,
        };

        const updatedHeader: VaultHeader = {
            ...header,
            wrappedKeys: {
                password: null,
                recovery: recoveryEntry,
                passkeys: [],
                googleDrive: driveEntry,
            },
            passwordSlot: null,
            recoverySlot: recoveryEntry,
            authProvider: 'google',
            updatedAt: nowIso,
            dekCreatedAt: nowIso,
        };

        appStorage.getBacking().setItem(VAULT_HEADER_KEY, JSON.stringify(updatedHeader));

        // 6. Open fresh EncryptedStorageProvider with newDek and re-encrypt all records
        const newRuntimeDek = await unwrapDek(wrappedDriveDek, driveKek, false);
        const newEncrypted = await EncryptedStorageProvider.open(appStorage.getBacking(), newRuntimeDek, { adoptLegacyPlaintext: false });

        for (const [key, value] of decryptedRecords.entries()) {
            newEncrypted.setItem(key, value);
        }
        await newEncrypted.flush();
        appStorage.attachEncrypted(newEncrypted);

        // 7. Save to device store
        await deviceVaultKeyStore.saveDeviceWrappedDek(userId, newDek);

        const recoveryKeyFormatted = formatRecoveryKey(recoveryBytes);
        wipe(recoveryBytes);

        this.setStatus('unlocked');
        this.resetAutoLockTimer();

        return {
            recoveryKey: recoveryKeyFormatted,
            authKey: new Uint8Array(32),
        };
    }

    /**
     * Legacy backward-compatibility method (for unit tests / mock setups).
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
        const encrypted = await EncryptedStorageProvider.open(appStorage.getBacking(), runtimeDek, { adoptLegacyPlaintext: false });
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
            'glassfolio_achievements',
            'glassfolio_quests',
            'glassfolio_pinned_badges',
            'glassfolio_asset_groups',
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
     * Legacy backward-compatibility method (for existing unit tests).
     */
    public async unlockOAuthVault(oauthSecret: string): Promise<void> {
        await delay(200);
        const header = this.getVaultHeader();
        if (!header || !header.wrappedKeys.password) throw new VaultNotInitializedError();

        try {
            const oauthKek = await deriveOAuthKek(oauthSecret, header.kdf.salt);
            const runtimeDek = await unwrapDek(header.wrappedKeys.password.wrapped, oauthKek, false);
            const encrypted = await EncryptedStorageProvider.open(appStorage.getBacking(), runtimeDek, { adoptLegacyPlaintext: false });
            await encrypted.flush();
            appStorage.attachEncrypted(encrypted);

            this.setStatus('unlocked');
            this.resetAutoLockTimer();
        } catch {
            // Backward-compatibility fallback for pre-Epic 20 OAuth vaults (PBKDF2)
            try {
                const { kek: legacyKek } = await deriveMasterKeys(oauthSecret, header.kdf);
                const runtimeDek = await unwrapDek(header.wrappedKeys.password.wrapped, legacyKek, true);
                const encrypted = await EncryptedStorageProvider.open(appStorage.getBacking(), runtimeDek, { adoptLegacyPlaintext: false });
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
        // `recovery: null` means it was revoked (e.g. by a DEK rotation): never fall back to the
        // legacy alias, which would still wrap the previous key.
        const recoveryEntry = header.wrappedKeys.recovery === undefined ? header.recoverySlot : header.wrappedKeys.recovery;
        if (!recoveryEntry) {
            return err(new ValidationError('No recovery key slot configured on this vault.'));
        }

        const recoveryBytes = parseRecoveryKey(recoveryKeyInput);
        if (!recoveryBytes) {
            return err(new ValidationError('Invalid recovery key format.'));
        }

        try {
            const recoverySalt = recoveryEntry.salt || header.kdf.salt;
            const recoveryKek = await deriveRecoveryKek(recoveryBytes, recoverySalt);
            wipe(recoveryBytes);

            // 1. Unwrap DEK as extractable
            const extractableDek = await unwrapDek(recoveryEntry.wrapped, recoveryKek, true);

            // 2. Derive new password KEK
            const newKdf = createKdfParams(Math.max(PBKDF2_ITERATIONS, header.kdf.iterations));
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

        // 5. Update header. Every other slot still wraps the previous DEK: the recovery key must be
        //    regenerated and passkeys re-enrolled.
        const passwordEntry = {
            alg: 'AES-KW' as const,
            wrapped: newWrappedPassword,
            createdAt: new Date().toISOString(),
            salt: header.kdf.salt,
        };
        const updatedHeader: VaultHeader = {
            ...header,
            wrappedKeys: {
                ...header.wrappedKeys,
                password: passwordEntry,
                recovery: null,
                passkeys: [],
            },
            passwordSlot: passwordEntry,
            recoverySlot: null,
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
     * Escape hatch: wipes this device's vault header and encrypted records.
     * Returns to uninitialized state so demo accounts or fresh setup can proceed.
     * In cloud mode the server-side vault is left untouched.
     */
    public async resetVault(): Promise<void> {
        await delay(300);

        this.clearAutoLockTimer();
        const encrypted = appStorage.detachEncrypted();
        if (encrypted) {
            encrypted.dispose();
        }

        const backing = appStorage.getBacking();
        if (backing instanceof SyncedBackingStorageProvider) {
            backing.removeVaultKeys(isVaultScopedKey);
        } else {
            backing.keys().filter(isVaultScopedKey).forEach(key => backing.removeItem(key));
        }
        // Local mode: the server volume must confirm the deletion before the vault counts as reset.
        await requireLocalPersistence();

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
