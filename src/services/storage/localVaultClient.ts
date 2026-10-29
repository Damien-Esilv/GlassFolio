/**
 * Typed client of the local vault API (server/localVault.mjs) — Epic E33.
 *
 * Only used in local deployment mode. `unavailable` means "no vault API here" (static hosting,
 * a dev server without the plugin): the app then keeps using browser storage. `error` means the
 * API exists but failed, in which case the app must not guess and shows a retry screen.
 */

export const LOCAL_VAULT_ENDPOINT = '/api/local-vault';
const BATCH_ENDPOINT = `${LOCAL_VAULT_ENDPOINT}/batch`;
/** Browsers cap the total body of in-flight `keepalive` requests at 64 KiB. */
const KEEPALIVE_CHUNK_BYTES = 60 * 1024;

export interface VaultSnapshot {
    revision: number;
    records: Record<string, string>;
}

export interface VaultBatch {
    clear?: boolean;
    remove?: string[];
    set?: Record<string, string>;
}

export type SnapshotOutcome =
    | { status: 'ok'; snapshot: VaultSnapshot }
    | { status: 'unavailable' }
    | { status: 'error'; message: string };

type FetchLike = typeof fetch;

const isRecordMap = (value: unknown): value is Record<string, string> =>
    value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every(v => typeof v === 'string');

export async function fetchSnapshot(fetchImpl: FetchLike = fetch): Promise<SnapshotOutcome> {
    let response: Response;
    try {
        response = await fetchImpl(LOCAL_VAULT_ENDPOINT, {
            headers: { Accept: 'application/json', 'X-GlassFolio-Local': '1' },
            cache: 'no-store'
        });
    } catch (err) {
        return { status: 'error', message: err instanceof Error ? err.message : 'Network error' };
    }

    if (response.status === 404 || response.status === 405) return { status: 'unavailable' };
    if (!response.ok) return { status: 'error', message: `HTTP ${response.status}` };

    // A SPA fallback answers 200 with HTML for unknown routes: that is "no vault API", not an error.
    if (!(response.headers.get('content-type') ?? '').includes('application/json')) return { status: 'unavailable' };

    try {
        const body = (await response.json()) as { revision?: unknown; records?: unknown };
        if (!isRecordMap(body.records)) return { status: 'error', message: 'Malformed vault snapshot' };
        return { status: 'ok', snapshot: { revision: typeof body.revision === 'number' ? body.revision : 0, records: body.records } };
    } catch {
        return { status: 'error', message: 'Malformed vault snapshot' };
    }
}

const byteLength = (value: string): number => new TextEncoder().encode(value).length;

/** Splits a batch so that each part fits a `keepalive` request; `clear` only goes with the first. */
export function splitBatchForKeepalive(batch: VaultBatch, maxBytes: number = KEEPALIVE_CHUNK_BYTES): VaultBatch[] {
    const parts: VaultBatch[] = [];
    let current: VaultBatch = batch.clear ? { clear: true } : {};
    let size = 0;
    const flushCurrent = (): void => {
        if (current.clear || current.remove?.length || (current.set && Object.keys(current.set).length > 0)) parts.push(current);
        current = {};
        size = 0;
    };

    for (const key of batch.remove ?? []) {
        if (size + byteLength(key) > maxBytes) flushCurrent();
        (current.remove ??= []).push(key);
        size += byteLength(key);
    }
    for (const [key, value] of Object.entries(batch.set ?? {})) {
        const entrySize = byteLength(key) + byteLength(value);
        if (size > 0 && size + entrySize > maxBytes) flushCurrent();
        (current.set ??= {})[key] = value;
        size += entrySize;
    }
    flushCurrent();
    return parts;
}

/** Sends one batch. Resolves true only when the server confirmed the write. */
export async function commitBatch(
    batch: VaultBatch,
    options: { keepalive?: boolean; fetchImpl?: FetchLike } = {},
): Promise<boolean> {
    const fetchImpl = options.fetchImpl ?? fetch;
    try {
        const response = await fetchImpl(BATCH_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-GlassFolio-Local': '1',
            },
            body: JSON.stringify(batch),
            keepalive: options.keepalive === true,
        });
        return response.ok;
    } catch {
        return false;
    }
}
