import { describe, it, expect, beforeEach } from 'vitest';
import { secretsService } from '../../../../src/services/security/secretsService';
import { appStorage } from '../../../../src/services/storage/appStorage';

describe('secretsService', () => {
    beforeEach(async () => {
        appStorage.clear();
    });

    it('saves encrypted secret and masks preview', async () => {
        const item = await secretsService.saveSecret(
            'gemini',
            'Primary Gemini Key',
            'AIzaSyB_1234567890abcdef'
        );

        expect(item.id).toBeDefined();
        expect(item.provider).toBe('gemini');
        expect(item.label).toBe('Primary Gemini Key');
        expect(item.value).toBe('AIzaSyB_1234567890abcdef');
        expect(item.preview).toBe('••••••••cdef');

        // Check safe listing (does not include raw value)
        const list = await secretsService.listSecrets();
        expect(list).toHaveLength(1);
        expect((list[0] as unknown as { value?: string }).value).toBeUndefined();
        expect(list[0].preview).toBe('••••••••cdef');
    });

    it('retrieves full secret by id and by provider', async () => {
        const item = await secretsService.saveSecret('openai', 'OpenAI Pro', 'sk-proj-9988776655');

        const fetched = await secretsService.getSecret(item.id);
        expect(fetched?.value).toBe('sk-proj-9988776655');

        const byProvider = await secretsService.getSecretByProvider('openai');
        expect(byProvider).toBe('sk-proj-9988776655');

        const notFound = await secretsService.getSecretByProvider('nonexistent');
        expect(notFound).toBeNull();
    });

    it('deletes secret by id', async () => {
        const item = await secretsService.saveSecret('anthropic', 'Claude Key', 'sk-ant-112233');
        expect(await secretsService.listSecrets()).toHaveLength(1);

        await secretsService.deleteSecret(item.id);
        expect(await secretsService.listSecrets()).toHaveLength(0);
        expect(await secretsService.getSecret(item.id)).toBeNull();
    });

    it('rejects empty secret value', async () => {
        await expect(
            secretsService.saveSecret('gemini', 'Empty', '   ')
        ).rejects.toThrow();
    });
});
