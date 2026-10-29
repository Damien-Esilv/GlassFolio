import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deviceVaultKeyStore } from '../../../../src/services/security/deviceVaultKeyStore';

/** Minimal in-memory IndexedDB: enough for open / put / get / delete / clear on one store. */
const makeFakeIndexedDb = (failing: Set<string> = new Set()) => {
    const data = new Map<string, unknown>();
    const request = <T>(op: string, run: () => T) => {
        const r: { result?: T; error?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
        queueMicrotask(() => {
            try {
                if (failing.has(op)) throw new Error(`${op} failed`);
                r.result = run();
                r.onsuccess?.();
            } catch (err) {
                r.error = err;
                r.onerror?.();
            }
        });
        return r;
    };
    const store = {
        put: (value: { userId: string }) => request('put', () => { data.set(value.userId, value); }),
        get: (key: string) => request('get', () => data.get(key)),
        delete: (key: string) => request('delete', () => { data.delete(key); }),
        clear: () => request('clear', () => { data.clear(); }),
    };
    const db = {
        objectStoreNames: { contains: () => false },
        createObjectStore: () => store,
        transaction: () => ({ objectStore: () => store }),
    };
    return {
        data,
        factory: {
            open: () => {
                const r: { result: unknown; error?: unknown; onupgradeneeded?: () => void; onsuccess?: () => void; onerror?: () => void } = { result: db };
                queueMicrotask(() => {
                    if (failing.has('open')) {
                        r.error = new Error('open failed');
                        r.onerror?.();
                        return;
                    }
                    r.onupgradeneeded?.();
                    r.onsuccess?.();
                });
                return r;
            },
        },
    };
};

const newDek = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
const roundTrip = async (dek: CryptoKey, loaded: CryptoKey) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, new TextEncoder().encode('hello'));
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, loaded, sealed));
};

describe('deviceVaultKeyStore', () => {
    afterEach(async () => {
        await deviceVaultKeyStore.clearAll();
        vi.unstubAllGlobals();
    });

    describe('with IndexedDB', () => {
        let fake: ReturnType<typeof makeFakeIndexedDb>;
        beforeEach(() => {
            fake = makeFakeIndexedDb();
            vi.stubGlobal('indexedDB', fake.factory);
        });

        it('stores the DEK wrapped by a non-extractable device key and loads a working non-extractable DEK', async () => {
            const dek = await newDek();
            await deviceVaultKeyStore.saveDeviceWrappedDek('u1', dek);

            const stored = fake.data.get('u1') as { deviceKek: CryptoKey; wrappedDek: ArrayBuffer };
            expect(stored.deviceKek.extractable).toBe(false);
            expect(stored.wrappedDek.byteLength).toBeGreaterThan(32);

            const loaded = await deviceVaultKeyStore.loadDeviceWrappedDek('u1');
            expect(loaded).not.toBeNull();
            expect(loaded!.extractable).toBe(false);
            expect(await roundTrip(dek, loaded!)).toBe('hello');
        });

        it('returns null for an unknown user', async () => {
            expect(await deviceVaultKeyStore.loadDeviceWrappedDek('nobody')).toBeNull();
        });

        it('returns null when the stored entry is unusable', async () => {
            fake.data.set('broken', { userId: 'broken', wrappedDek: new ArrayBuffer(8), deviceKek: await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']) });
            expect(await deviceVaultKeyStore.loadDeviceWrappedDek('broken')).toBeNull();
            fake.data.set('partial', { userId: 'partial' });
            expect(await deviceVaultKeyStore.loadDeviceWrappedDek('partial')).toBeNull();
        });

        it('clears one user or everything', async () => {
            await deviceVaultKeyStore.saveDeviceWrappedDek('u1', await newDek());
            await deviceVaultKeyStore.saveDeviceWrappedDek('u2', await newDek());

            await deviceVaultKeyStore.clearDeviceKey('u1');
            expect(await deviceVaultKeyStore.loadDeviceWrappedDek('u1')).toBeNull();
            expect(await deviceVaultKeyStore.loadDeviceWrappedDek('u2')).not.toBeNull();

            await deviceVaultKeyStore.clearAll();
            expect(fake.data.size).toBe(0);
            expect(await deviceVaultKeyStore.loadDeviceWrappedDek('u2')).toBeNull();
        });

        it('keeps one entry per user and overwrites it on a new save', async () => {
            await deviceVaultKeyStore.saveDeviceWrappedDek('u1', await newDek());
            const second = await newDek();
            await deviceVaultKeyStore.saveDeviceWrappedDek('u1', second);
            expect(fake.data.size).toBe(1);
            expect(await roundTrip(second, (await deviceVaultKeyStore.loadDeviceWrappedDek('u1'))!)).toBe('hello');
        });
    });

    describe('when IndexedDB operations fail', () => {
        const withFailures = (...ops: string[]) => {
            const fake = makeFakeIndexedDb(new Set(ops));
            vi.stubGlobal('indexedDB', fake.factory);
            return fake;
        };

        it.each(['open', 'put'])('keeps the key in memory when %s fails, and still loads it', async (op) => {
            withFailures(op);
            const dek = await newDek();
            await deviceVaultKeyStore.saveDeviceWrappedDek('u1', dek);
            // reading also has to work through the fallback
            expect(await roundTrip(dek, (await deviceVaultKeyStore.loadDeviceWrappedDek('u1'))!)).toBe('hello');
        });

        it('falls back to memory when reading fails', async () => {
            const fake = makeFakeIndexedDb();
            vi.stubGlobal('indexedDB', fake.factory);
            const dek = await newDek();
            await deviceVaultKeyStore.saveDeviceWrappedDek('u1', dek);
            expect(await deviceVaultKeyStore.loadDeviceWrappedDek('u1')).not.toBeNull();
            withFailures('get');
            expect(await deviceVaultKeyStore.loadDeviceWrappedDek('u1')).toBeNull(); // nothing in the memory fallback
        });

        it('never throws when deleting or clearing fails', async () => {
            withFailures('delete', 'clear');
            await expect(deviceVaultKeyStore.clearDeviceKey('u1')).resolves.toBeUndefined();
            await expect(deviceVaultKeyStore.clearAll()).resolves.toBeUndefined();
        });
    });

    describe('without IndexedDB (memory fallback)', () => {
        beforeEach(() => vi.stubGlobal('indexedDB', undefined));

        it('still round-trips within the page and clears', async () => {
            const dek = await newDek();
            await deviceVaultKeyStore.saveDeviceWrappedDek('u9', dek);
            const loaded = await deviceVaultKeyStore.loadDeviceWrappedDek('u9');
            expect(await roundTrip(dek, loaded!)).toBe('hello');

            await deviceVaultKeyStore.clearDeviceKey('u9');
            expect(await deviceVaultKeyStore.loadDeviceWrappedDek('u9')).toBeNull();
        });
    });
});
