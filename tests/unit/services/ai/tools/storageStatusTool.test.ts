import { describe, it, expect, vi, afterEach } from 'vitest';
import { getStorageStatusTool } from '../../../../../src/services/ai/tools/securityTools';
import { aiToolRegistry } from '../../../../../src/services/ai/aiToolRegistry';
import '../../../../../src/services/ai/tools';
import { getLocalVaultProvider } from '../../../../../src/services/storage/storageFactory';

describe('get_storage_status AI/MCP tool (E33 — TGLA-140)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it('is registered, read-only and needs no confirmation', () => {
        expect(aiToolRegistry.getTool('get_storage_status')).toBeDefined();
        expect(getStorageStatusTool.requiresConfirmation).toBe(false);
    });

    it('reports browser storage when no local data server is connected', async () => {
        vi.spyOn(getLocalVaultProvider()!, 'getStatus').mockReturnValue({
            mode: 'browser', pending: 0, lastSavedAt: null, lastError: null, legacyBrowserVaultIgnored: false, activeVaultId: 'default', profiles: [],
        });
        await expect(getStorageStatusTool.execute({})).resolves.toEqual({
            deploymentMode: 'local',
            storageLocation: 'browser',
            pendingChanges: 0,
            lastSavedAt: null,
            saveError: false,
            legacyBrowserVaultIgnored: false,
            quotaExceeded: false,
            quotaReason: null,
            quotaUsageBytes: null,
            quotaLimitBytes: null,
            quotaRecordCount: null,
            quotaMaxRecords: null,
            activeVaultId: null,
            localVaultCount: null,
        });
    });

    it('reports the local server and never leaks the raw error text', async () => {
        vi.spyOn(getLocalVaultProvider()!, 'getStatus').mockReturnValue({
            mode: 'server',
            pending: 2,
            lastSavedAt: '2026-10-26T10:00:00.000Z',
            lastError: 'HTTP 500 secret detail',
            legacyBrowserVaultIgnored: true,
            activeVaultId: 'vault-2',
            profiles: [
                { id: 'default', name: 'Personal', initialized: true },
                { id: 'vault-2', name: 'Holding', initialized: true },
            ],
        });
        const result = await getStorageStatusTool.execute({});
        expect(result).toMatchObject({
            storageLocation: 'local_server',
            pendingChanges: 2,
            lastSavedAt: '2026-10-26T10:00:00.000Z',
            saveError: true,
            legacyBrowserVaultIgnored: true,
            activeVaultId: 'vault-2',
            localVaultCount: 2,
        });
        expect(JSON.stringify(result)).not.toContain('secret detail');
    });

    it('reports cloud storage in cloud mode', async () => {
        vi.stubEnv('VITE_DEPLOYMENT_MODE', 'cloud');
        await expect(getStorageStatusTool.execute({})).resolves.toMatchObject({ deploymentMode: 'cloud', storageLocation: 'cloud' });
    });
});
