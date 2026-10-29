/**
 * Local Device Vault Key Store (IndexedDB non-extractable CryptoKey).
 *
 * Enables seamless page reloads and session resumes on the trusted local browser
 * without prompting the user or re-querying Google Drive on every page reload.
 *
 * Uses IndexedDB to store non-extractable CryptoKeys that cannot be read by JavaScript
 * string dumps or exported to a server.
 */

const DB_NAME = 'glassfolio_device_keys';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

interface StoredDeviceEntry {
    userId: string;
    wrappedDek: ArrayBuffer;
    deviceKek: CryptoKey;
    updatedAt: string;
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB unavailable'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

const memoryFallback = new Map<string, StoredDeviceEntry>();

export const deviceVaultKeyStore = {
    /**
     * Wraps the current in-memory DEK with a local, non-extractable AES-KW device key
     * and persists it in IndexedDB for the given user.
     */
    async saveDeviceWrappedDek(userId: string, dek: CryptoKey): Promise<void> {
        try {
            const s = crypto.subtle;
            // Generate a non-extractable AES-KW wrapping key stored directly inside IndexedDB
            const deviceKek = await s.generateKey(
                { name: 'AES-KW', length: 256 },
                false, // non-extractable!
                ['wrapKey', 'unwrapKey']
            );

            const wrappedDek = await s.wrapKey('raw', dek, deviceKek, 'AES-KW');

            const entry: StoredDeviceEntry = {
                userId,
                wrappedDek,
                deviceKek,
                updatedAt: new Date().toISOString(),
            };

            try {
                const db = await openDb();
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);

                await new Promise<void>((resolve, reject) => {
                    const req = store.put(entry);
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            } catch {
                memoryFallback.set(userId, entry);
            }
        } catch {
            // Non-critical local optimization
        }
    },

    /**
     * Unwraps and returns the DEK from IndexedDB for the given user.
     */
    async loadDeviceWrappedDek(userId: string): Promise<CryptoKey | null> {
        try {
            let entry: StoredDeviceEntry | undefined;

            try {
                const db = await openDb();
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);

                entry = await new Promise<StoredDeviceEntry | undefined>((resolve, reject) => {
                    const req = store.get(userId);
                    req.onsuccess = () => resolve(req.result as StoredDeviceEntry | undefined);
                    req.onerror = () => reject(req.error);
                });
            } catch {
                entry = undefined;
            }
            // A save that could not reach IndexedDB lives in memory: also use it when IndexedDB has nothing.
            entry ??= memoryFallback.get(userId);

            if (!entry || !entry.deviceKek || !entry.wrappedDek) {
                return null;
            }

            const s = crypto.subtle;
            const dek = await s.unwrapKey(
                'raw',
                entry.wrappedDek,
                entry.deviceKek,
                'AES-KW',
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );

            return dek;
        } catch {
            return null;
        }
    },

    /**
     * Clears the device key for a user (on manual lock or sign-out).
     */
    async clearDeviceKey(userId: string): Promise<void> {
        memoryFallback.delete(userId);
        try {
            const db = await openDb();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            await new Promise<void>((resolve, reject) => {
                const req = store.delete(userId);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch {
            // Ignore
        }
    },

    /**
     * Clears all device keys in IndexedDB.
     */
    async clearAll(): Promise<void> {
        memoryFallback.clear();
        try {
            const db = await openDb();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            await new Promise<void>((resolve, reject) => {
                const req = store.clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch {
            // Ignore
        }
    },
};
