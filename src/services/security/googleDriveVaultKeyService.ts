/**
 * Google Drive appDataFolder Root Key Management Service (E2EE Split-Trust).
 *
 * Stores and retrieves a 256-bit random root secret in the user's private, hidden
 * Google Drive appDataFolder (spaces=appDataFolder).
 * The Google Drive API never sees financial data, and Supabase never sees this secret.
 */

import { randomBytes, toBase64 } from './crypto';
import { fromBase64, utf8Decode, utf8Encode } from './encoding';

const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const VAULT_KEY_FILENAME = 'glassfolio-vault-key-v1.json';

export interface DriveVaultKeyFile {
    version: 1;
    keyId: string;
    userId: string;
    secretBase64: string;
    createdAt: string;
}

export interface DriveKeyResult {
    driveSecret: Uint8Array;
    keyId: string;
}

export const googleDriveVaultKeyService = {
    /**
     * Retrieves existing drive root secret from appDataFolder, or generates and stores a new one.
     *
     * `replaceForeignKey` is only for an account that has NO vault on the server yet: a key file that
     * names another account is then the leftover of an account that was deleted (or never finished
     * its first sign-in), so nothing can be locked out by replacing it. A file that cannot be read
     * at all is still refused, since it may hold the key of a vault we cannot see.
     */
    async getOrCreateRootSecret(
        accessToken: string,
        userId: string,
        options?: { replaceForeignKey?: boolean }
    ): Promise<DriveKeyResult> {
        let existing: DriveKeyResult | null;
        try {
            existing = await this.readRootSecret(accessToken, userId);
        } catch (err) {
            const isForeign = err instanceof Error && err.message === 'DRIVE_KEY_FILE_USER_MISMATCH';
            if (!(options?.replaceForeignKey && isForeign)) throw err;
            existing = null;
        }
        if (existing) {
            return existing;
        }

        const newSecret = randomBytes(32);
        const keyId = crypto.randomUUID();
        await this.writeRootSecret(accessToken, userId, newSecret, keyId);

        return {
            driveSecret: newSecret,
            keyId,
        };
    },

    /**
     * Reads the root secret from appDataFolder if it exists.
     */
    async readRootSecret(accessToken: string, userId: string): Promise<DriveKeyResult | null> {
        const fileId = await this.findKeyFileId(accessToken);
        if (!fileId) return null;

        const response = await fetch(`${DRIVE_FILES_API}/${fileId}?alt=media`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`DRIVE_READ_FAILED_${response.status}`);
        }

        const raw = await response.text();
        let data: DriveVaultKeyFile | null = null;
        try {
            data = JSON.parse(raw) as DriveVaultKeyFile;
        } catch {
            data = null;
        }
        if (!data || data.version !== 1 || !data.secretBase64 || typeof data.keyId !== 'string') {
            // The file exists but cannot be read (corrupted, newer format): NEVER report it as absent,
            // getOrCreateRootSecret would then overwrite the key and lock the user out of their vault.
            throw new Error('DRIVE_KEY_FILE_UNREADABLE');
        }
        if (typeof data.userId === 'string' && data.userId !== userId) {
            throw new Error('DRIVE_KEY_FILE_USER_MISMATCH');
        }
        let driveSecret: Uint8Array;
        try {
            driveSecret = fromBase64(data.secretBase64);
        } catch {
            throw new Error('DRIVE_KEY_FILE_UNREADABLE');
        }
        if (driveSecret.length !== 32) {
            throw new Error('DRIVE_KEY_FILE_UNREADABLE');
        }
        return { driveSecret, keyId: data.keyId };
    },

    /**
     * Writes or overwrites the root secret file inside spaces=appDataFolder.
     */
    async writeRootSecret(
        accessToken: string,
        userId: string,
        driveSecret: Uint8Array,
        keyId: string
    ): Promise<void> {
        // Check if a file already exists to overwrite/update or create
        const existingFileId = await this.findKeyFileId(accessToken);

        const payload: DriveVaultKeyFile = {
            version: 1,
            keyId,
            userId,
            secretBase64: toBase64(driveSecret),
            createdAt: new Date().toISOString(),
        };

        const boundary = `----GlassFolioMultipart${crypto.randomUUID()}`;
        // `parents` is only writable when creating the file: sending it on a PATCH makes Drive answer
        // 403 (fieldNotWritable), which broke the replacement of an existing key file.
        const metadata = JSON.stringify(
            existingFileId
                ? { name: VAULT_KEY_FILENAME }
                : { name: VAULT_KEY_FILENAME, parents: ['appDataFolder'] }
        );
        const content = JSON.stringify(payload);

        const multipartBody =
            `--${boundary}\r\n` +
            `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
            `${metadata}\r\n` +
            `--${boundary}\r\n` +
            `Content-Type: application/json\r\n\r\n` +
            `${content}\r\n` +
            `--${boundary}--`;

        let url = `${DRIVE_UPLOAD_API}?uploadType=multipart`;
        let method = 'POST';

        if (existingFileId) {
            url = `${DRIVE_UPLOAD_API}/${existingFileId}?uploadType=multipart`;
            method = 'PATCH';
        }

        const response = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: utf8Encode(multipartBody),
        });

        if (!response.ok) {
            throw new Error(`DRIVE_WRITE_FAILED_${response.status}`);
        }
    },

    /**
     * Deletes the key file from Google Drive on account deletion.
     */
    async deleteRootSecret(accessToken: string): Promise<boolean> {
        const fileId = await this.findKeyFileId(accessToken);
        if (!fileId) return false;

        const response = await fetch(`${DRIVE_FILES_API}/${fileId}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        return response.ok;
    },

    /**
     * Finds the ID of the vault key file inside spaces=appDataFolder.
     */
    async findKeyFileId(accessToken: string): Promise<string | null> {
        const query = encodeURIComponent(`name='${VAULT_KEY_FILENAME}' and trashed=false`);
        const url = `${DRIVE_FILES_API}?spaces=appDataFolder&q=${query}&fields=files(id,name)`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            throw new Error(`DRIVE_LIST_FAILED_${response.status}`);
        }

        const data = (await response.json()) as { files?: Array<{ id: string; name: string }> };
        if (Array.isArray(data.files) && data.files.length > 0 && data.files[0]?.id) {
            return data.files[0].id;
        }

        return null;
    },
};
