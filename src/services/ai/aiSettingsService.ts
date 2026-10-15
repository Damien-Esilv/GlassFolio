import { AISettings } from './types';
import { appStorage } from '../storage/appStorage';

const STORAGE_KEY = 'glassfolio_ai_settings';

const DEFAULT_SETTINGS: AISettings = {
  activeProvider: 'mock',
  executionMode: 'supervised',
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'llama3.2:latest',
  apiKey: '',
  cloudModel: 'gpt-4o-mini',
  enableThinking: true,
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
      const raw = appStorage.getItem(STORAGE_KEY);
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
      appStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
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
}

export const aiSettingsService = new AISettingsService();
