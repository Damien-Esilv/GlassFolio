import { AISettings } from './types';

const STORAGE_KEY = 'glassfolio_ai_settings';

const DEFAULT_SETTINGS: AISettings = {
  activeProvider: 'mock',
  executionMode: 'supervised',
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'llama3.2:latest',
  apiKey: '',
  cloudModel: 'gpt-4o-mini',
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
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore localStorage quotas / private browsing errors
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
}

export const aiSettingsService = new AISettingsService();
