import { AISettings } from './types';
import { appStorage } from '../storage/appStorage';

export const AI_SETTINGS_STORAGE_KEY = 'glassfolio_ai_settings_v1';
const LEGACY_AI_SETTINGS_STORAGE_KEY = 'glassfolio_ai_settings';

const DEFAULT_SETTINGS: AISettings = {
  activeProvider: 'mock',
  executionMode: 'supervised',
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'llama3.2:latest',
  apiKey: '',
  cloudModel: '',
  enableThinking: true,
  providerApiKeys: {},
  providerModels: {},
};

/**
 * AISettingsService - Stores and manages AI preferences and LLM provider configurations.
 */
class AISettingsService {
  /**
   * Retrieves current AI settings from storage or defaults.
   */
  public getSettings(): AISettings {
    try {
      let raw = appStorage.getItem(AI_SETTINGS_STORAGE_KEY);
      if (!raw) {
        const legacy = appStorage.getItem(LEGACY_AI_SETTINGS_STORAGE_KEY);
        if (legacy) {
          raw = legacy;
          appStorage.setItem(AI_SETTINGS_STORAGE_KEY, legacy);
          appStorage.removeItem(LEGACY_AI_SETTINGS_STORAGE_KEY);
        }
      }
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      const settings: AISettings = { ...DEFAULT_SETTINGS, ...parsed };
      if (!settings.providerApiKeys) settings.providerApiKeys = {};
      if (!settings.providerModels) settings.providerModels = {};
      if (settings.apiKey && settings.activeProvider && !settings.providerApiKeys[settings.activeProvider]) {
        settings.providerApiKeys[settings.activeProvider] = settings.apiKey;
      }
      if (settings.cloudModel && settings.activeProvider && !settings.providerModels[settings.activeProvider]) {
        settings.providerModels[settings.activeProvider] = settings.cloudModel;
      }
      return settings;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Updates and persists AI settings.
   */
  public saveSettings(settings: Partial<AISettings>): AISettings {
    const current = this.getSettings();
    const updated: AISettings = { ...current, ...settings };
    if (updated.activeProvider) {
      updated.providerApiKeys = {
        ...(updated.providerApiKeys || {}),
        [updated.activeProvider]: updated.apiKey,
      };
      updated.providerModels = {
        ...(updated.providerModels || {}),
        [updated.activeProvider]: updated.cloudModel,
      };
    }
    try {
      appStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage quotas / private browsing errors
    }
    return updated;
  }

  /**
   * Tests connection to local Ollama instance and returns available installed models.
   */
  public async testOllamaConnection(
    endpoint: string = DEFAULT_SETTINGS.ollamaEndpoint
  ): Promise<{ ok: boolean; models: string[]; error?: string }> {
    try {
      const cleanUrl = endpoint.replace(/\/+$/, '');
      const response = await fetch(`${cleanUrl}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        return {
          ok: false,
          models: [],
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      const models = Array.isArray(data?.models)
        ? data.models.map((m: { name?: string }) => m.name || '').filter(Boolean)
        : [];

      return {
        ok: true,
        models,
      };
    } catch (err) {
      return {
        ok: false,
        models: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Checks if the specified model is currently loaded in Ollama's active VRAM memory via /api/ps.
   */
  public async checkOllamaModelLoaded(
    endpoint: string = DEFAULT_SETTINGS.ollamaEndpoint,
    modelName: string = DEFAULT_SETTINGS.ollamaModel
  ): Promise<boolean> {
    try {
      const cleanUrl = endpoint.replace(/\/+$/, '');
      const response = await fetch(`${cleanUrl}/api/ps`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) return false;
      const data = await response.json();
      if (Array.isArray(data?.models)) {
        return data.models.some(
          (m: { name?: string; model?: string }) =>
            m.name === modelName ||
            m.model === modelName ||
            m.name?.startsWith(modelName) ||
            modelName.startsWith(m.name || '')
        );
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Tests connection to a Cloud AI provider using the provided API Key and Model.
   */
  public async testCloudConnection(
    provider: string,
    apiKey: string,
    model?: string
  ): Promise<{ ok: boolean; error?: string }> {
    if (!apiKey || !apiKey.trim()) {
      return { ok: false, error: 'API key is required' };
    }

    try {
      let url = '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (provider === 'groq') {
        url = 'https://api.groq.com/openai/v1/models';
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      } else if (provider === 'openai') {
        url = 'https://api.openai.com/v1/models';
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      } else if (provider === 'openrouter') {
        url = 'https://openrouter.ai/api/v1/models';
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      } else if (provider === 'gemini') {
        url = 'https://generativelanguage.googleapis.com/v1beta/models';
        headers['x-goog-api-key'] = apiKey.trim();
      } else if (provider === 'anthropic') {
        url = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = apiKey.trim();
        headers['anthropic-version'] = '2023-06-01';
        headers['dangerously-allow-browser'] = 'true';
      } else {
        return { ok: true };
      }

      const res = await fetch(url, {
        method: provider === 'anthropic' ? 'POST' : 'GET',
        headers,
        body: provider === 'anthropic' ? JSON.stringify({
          model: model || 'claude-3-5-sonnet-20241022',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }]
        }) : undefined,
      });

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          errMsg = errData?.error?.message || errData?.message || errMsg;
        } catch {
          // fallback
        }
        return { ok: false, error: errMsg };
      }

      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const aiSettingsService = new AISettingsService();
