import { describe, it, expect, vi, beforeEach } from 'vitest';
import { googleDriveVaultKeyService as drive } from '../../../../src/services/security/googleDriveVaultKeyService';

type Call = { method: string; url: string; body?: string; headers?: Record<string, string> };

/** Scriptable Drive: `files` is what the appDataFolder listing returns. */
const stubDrive = (opts: { files?: Array<{ id: string; name: string }>; media?: { status: number; body: string }; listStatus?: number; writeStatus?: number; deleteStatus?: number }) => {
    const calls: Call[] = [];
    globalThis.fetch = vi.fn(async (url: string, init?: { method?: string; body?: string | Uint8Array; headers?: Record<string, string> }) => {
        const u = String(url);
        const method = init?.method ?? 'GET';
        const body = init?.body !== undefined && typeof init.body !== 'string' && ArrayBuffer.isView(init.body)
            ? new TextDecoder().decode(init.body)
            : (init?.body as string | undefined);
        calls.push({ method, url: u, body, headers: init?.headers });
        if (u.includes('spaces=appDataFolder')) {
            return { ok: (opts.listStatus ?? 200) < 400, status: opts.listStatus ?? 200, json: async () => ({ files: opts.files ?? [] }) } as never;
        }
        if (u.includes('alt=media')) {
            const m = opts.media ?? { status: 200, body: '' };
            return { ok: m.status < 400, status: m.status, text: async () => m.body } as never;
        }
        if (method === 'DELETE') return { ok: (opts.deleteStatus ?? 204) < 400, status: opts.deleteStatus ?? 204 } as never;
        return { ok: (opts.writeStatus ?? 200) < 400, status: opts.writeStatus ?? 200, json: async () => ({}) } as never;
    }) as never;
    return calls;
};

const goodFile = (userId = 'u1', bytes = 32) => JSON.stringify({
    version: 1, keyId: 'key-1', userId, createdAt: 'x',
    secretBase64: btoa(String.fromCharCode(...new Uint8Array(bytes).fill(9))),
});

describe('googleDriveVaultKeyService', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('reads an existing key and sends the bearer token only to googleapis', async () => {
        const calls = stubDrive({ files: [{ id: 'f1', name: 'k' }], media: { status: 200, body: goodFile() } });
        const key = await drive.readRootSecret('tok', 'u1');
        expect(key?.keyId).toBe('key-1');
        expect(key?.driveSecret).toHaveLength(32);
        expect(calls.every((c) => c.url.startsWith('https://www.googleapis.com/'))).toBe(true);
        expect(calls.every((c) => c.headers?.Authorization === 'Bearer tok')).toBe(true);
        expect(calls[0].url).toContain('spaces=appDataFolder');
    });

    it('reports an absent key (no file, or file gone) as null, and server errors as errors', async () => {
        stubDrive({ files: [] });
        expect(await drive.readRootSecret('tok', 'u1')).toBeNull();
        stubDrive({ files: [{ id: 'f1', name: 'k' }], media: { status: 404, body: '' } });
        expect(await drive.readRootSecret('tok', 'u1')).toBeNull();
        stubDrive({ files: [{ id: 'f1', name: 'k' }], media: { status: 500, body: '' } });
        await expect(drive.readRootSecret('tok', 'u1')).rejects.toThrow('DRIVE_READ_FAILED_500');
        stubDrive({ listStatus: 403 });
        await expect(drive.readRootSecret('tok', 'u1')).rejects.toThrow('DRIVE_LIST_FAILED');
    });

    it('treats a wrong-size, wrong-version or foreign key file as an error, never as absent', async () => {
        stubDrive({ files: [{ id: 'f1', name: 'k' }], media: { status: 200, body: goodFile('u1', 16) } });
        await expect(drive.readRootSecret('tok', 'u1')).rejects.toThrow('DRIVE_KEY_FILE_UNREADABLE');
        stubDrive({ files: [{ id: 'f1', name: 'k' }], media: { status: 200, body: JSON.stringify({ version: 2, keyId: 'k', secretBase64: 'AAAA' }) } });
        await expect(drive.readRootSecret('tok', 'u1')).rejects.toThrow('DRIVE_KEY_FILE_UNREADABLE');
        stubDrive({ files: [{ id: 'f1', name: 'k' }], media: { status: 200, body: goodFile('other-user') } });
        await expect(drive.readRootSecret('tok', 'u1')).rejects.toThrow('DRIVE_KEY_FILE_USER_MISMATCH');
        stubDrive({ files: [{ id: 'f1', name: 'k' }], media: { status: 200, body: JSON.stringify({ version: 1, keyId: 'k', secretBase64: '%%%not-base64%%%' }) } });
        await expect(drive.readRootSecret('tok', 'u1')).rejects.toThrow('DRIVE_KEY_FILE_UNREADABLE');
    });

    it('creates the key in appDataFolder when none exists (POST), and returns the same secret it stored', async () => {
        const calls = stubDrive({ files: [] });
        const created = await drive.getOrCreateRootSecret('tok', 'u1');
        const write = calls.find((c) => c.method === 'POST')!;
        expect(write.url).toContain('/upload/drive/v3/files?uploadType=multipart');
        expect(write.body).toContain('"parents":["appDataFolder"]');
        expect(write.body).toContain('"userId":"u1"');
        expect(created.driveSecret).toHaveLength(32);
        expect(write.body).toContain(btoa(String.fromCharCode(...created.driveSecret)));
    });

    it('updates the existing file with PATCH when asked to write', async () => {
        const calls = stubDrive({ files: [{ id: 'f9', name: 'k' }] });
        await drive.writeRootSecret('tok', 'u1', new Uint8Array(32), 'key-2');
        expect(calls.some((c) => c.method === 'PATCH' && c.url.includes('/files/f9?uploadType=multipart'))).toBe(true);
    });

    it('surfaces a failed write', async () => {
        stubDrive({ files: [], writeStatus: 403 });
        await expect(drive.getOrCreateRootSecret('tok', 'u1')).rejects.toThrow('DRIVE_WRITE_FAILED_403');
    });

    it('refuses a key file of another account by default', async () => {
        const calls = stubDrive({ files: [{ id: 'f1', name: 'k' }], media: { status: 200, body: goodFile('deleted-user') } });
        await expect(drive.getOrCreateRootSecret('tok', 'u1')).rejects.toThrow('DRIVE_KEY_FILE_USER_MISMATCH');
        expect(calls.some((c) => c.method === 'POST' || c.method === 'PATCH')).toBe(false);
    });

    it('replaces the key file of a deleted account (PATCH) when the account has no vault yet', async () => {
        const calls = stubDrive({ files: [{ id: 'f1', name: 'k' }], media: { status: 200, body: goodFile('deleted-user') } });
        const key = await drive.getOrCreateRootSecret('tok', 'u1', { replaceForeignKey: true });
        const write = calls.find((c) => c.method === 'PATCH')!;
        expect(write.url).toContain('/files/f1?uploadType=multipart');
        // Drive rejects `parents` on an update (403 fieldNotWritable)
        expect(write.body).not.toContain('parents');
        expect(write.body).toContain('"userId":"u1"');
        expect(write.body).toContain(btoa(String.fromCharCode(...key.driveSecret)));
        expect(key.keyId).not.toBe('key-1');
    });

    it('still refuses an unreadable key file, even when replacing foreign ones is allowed', async () => {
        const calls = stubDrive({ files: [{ id: 'f1', name: 'k' }], media: { status: 200, body: goodFile('u1', 16) } });
        await expect(drive.getOrCreateRootSecret('tok', 'u1', { replaceForeignKey: true })).rejects.toThrow('DRIVE_KEY_FILE_UNREADABLE');
        expect(calls.some((c) => c.method === 'POST' || c.method === 'PATCH')).toBe(false);
    });

    it('returns an existing key from getOrCreate without writing', async () => {
        const calls = stubDrive({ files: [{ id: 'f1', name: 'k' }], media: { status: 200, body: goodFile() } });
        const key = await drive.getOrCreateRootSecret('tok', 'u1');
        expect(key.keyId).toBe('key-1');
        expect(calls.some((c) => c.method === 'POST' || c.method === 'PATCH')).toBe(false);
    });

    it('deletes the key file, or reports there was none', async () => {
        const none = stubDrive({ files: [] });
        expect(await drive.deleteRootSecret('tok')).toBe(false);
        expect(none.some((c) => c.method === 'DELETE')).toBe(false);

        const calls = stubDrive({ files: [{ id: 'f1', name: 'k' }] });
        expect(await drive.deleteRootSecret('tok')).toBe(true);
        expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/files/f1'))).toBe(true);
    });
});
