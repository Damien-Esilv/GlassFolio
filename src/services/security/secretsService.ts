/**
 * Secrets & API Key Vault Service (TGLA-043).
 *
 * Encrypted storage for external API credentials (Gemini, OpenAI, Anthropic, market providers).
 * Persisted in encrypted appStorage (`glassfolio_security_secrets`).
 * Values are masked in listings and audited on creation/deletion.
 */

import { appStorage } from '../storage/appStorage';
import { auditLogService } from './auditLogService';

const SECRETS_STORAGE_KEY = 'glassfolio_security_secrets';

export interface SecretItem {
    id: string;
    provider: 'gemini' | 'openai' | 'anthropic' | 'alphavantage' | 'etherscan' | 'coingecko' | 'custom';
    label: string;
    value: string;
    preview: string;
    createdAt: string;
    updatedAt: string;
    lastUsedAt?: string;
}

export type SafeSecretItem = Omit<SecretItem, 'value'>;

const maskSecret = (val: string): string => {
    const trimmed = val.trim();
    if (trimmed.length <= 4) return '••••••••';
    const visible = trimmed.slice(-4);
    return `••••••••${visible}`;
};

export const secretsService = {
    async listSecrets(): Promise<SafeSecretItem[]> {
        const raw = appStorage.getItem(SECRETS_STORAGE_KEY);
        if (!raw) return [];
        try {
            const items: SecretItem[] = JSON.parse(raw);
            return items.map(({ value: _value, ...rest }) => rest);
        } catch {
            return [];
        }
    },

    async getSecret(id: string): Promise<SecretItem | null> {
        const raw = appStorage.getItem(SECRETS_STORAGE_KEY);
        if (!raw) return null;
        try {
            const items: SecretItem[] = JSON.parse(raw);
            return items.find(item => item.id === id) || null;
        } catch {
            return null;
        }
    },

    async getSecretByProvider(provider: string): Promise<string | null> {
        const raw = appStorage.getItem(SECRETS_STORAGE_KEY);
        if (!raw) return null;
        try {
            const items: SecretItem[] = JSON.parse(raw);
            const found = items.find(item => item.provider === provider);
            return found ? found.value : null;
        } catch {
            return null;
        }
    },

    async saveSecret(
        provider: SecretItem['provider'],
        label: string,
        value: string
    ): Promise<SecretItem> {
        const cleanValue = value.trim();
        if (!cleanValue) {
            throw new Error('Secret value cannot be empty.');
        }

        const raw = appStorage.getItem(SECRETS_STORAGE_KEY);
        let items: SecretItem[] = [];
        if (raw) {
            try {
                items = JSON.parse(raw);
            } catch {
                items = [];
            }
        }

        const existingIdx = items.findIndex(item => item.provider === provider);
        const now = new Date().toISOString();

        let savedItem: SecretItem;
        if (existingIdx >= 0) {
            savedItem = {
                ...items[existingIdx],
                label: label.trim() || items[existingIdx].label,
                value: cleanValue,
                preview: maskSecret(cleanValue),
                updatedAt: now,
            };
            items[existingIdx] = savedItem;
        } else {
            savedItem = {
                id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                provider,
                label: label.trim() || provider.toUpperCase(),
                value: cleanValue,
                preview: maskSecret(cleanValue),
                createdAt: now,
                updatedAt: now,
            };
            items.push(savedItem);
        }

        appStorage.setItem(SECRETS_STORAGE_KEY, JSON.stringify(items));
        await auditLogService.record('secret_created', `Secret created/updated for ${provider} (${label})`);
        return savedItem;
    },

    async deleteSecret(id: string): Promise<void> {
        const raw = appStorage.getItem(SECRETS_STORAGE_KEY);
        if (!raw) return;
        try {
            const items: SecretItem[] = JSON.parse(raw);
            const target = items.find(i => i.id === id);
            const updated = items.filter(item => item.id !== id);
            appStorage.setItem(SECRETS_STORAGE_KEY, JSON.stringify(updated));

            if (target) {
                await auditLogService.record('secret_deleted', `Deleted secret for ${target.provider}`);
            }
        } catch (err) {
            console.error('Failed to delete secret', err);
        }
    },

    async clear(): Promise<void> {
        appStorage.removeItem(SECRETS_STORAGE_KEY);
    },
};
