import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aiSettingsService } from '../../../../src/services/ai/aiSettingsService';

describe('aiSettingsService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('settings persistence', () => {
    it('retrieves default settings when nothing is stored', () => {
      const settings = aiSettingsService.getSettings();
      expect(settings.activeProvider).toBeDefined();
      expect(settings.ollamaEndpoint).toBe('http://localhost:11434');
    });

    it('saves and retrieves partial settings', () => {
      aiSettingsService.saveSettings({ ollamaModel: 'mistral:3b' });
      const updated = aiSettingsService.getSettings();
      expect(updated.ollamaModel).toBe('mistral:3b');
    });
  });

  describe('checkOllamaModelLoaded (/api/ps)', () => {
    it('returns true when target model is active in VRAM', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [
              { name: 'mistral:3b', model: 'mistral:3b', size: 1900000000, expires_at: '2026-10-19T18:00:00Z' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const isLoaded = await aiSettingsService.checkOllamaModelLoaded('http://localhost:11434', 'mistral:3b');
      expect(isLoaded).toBe(true);
    });

    it('returns true when model name matches by prefix or alias', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [
              { name: 'mistral:3b-instruct-q4_0', model: 'mistral:3b-instruct-q4_0' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const isLoaded = await aiSettingsService.checkOllamaModelLoaded('http://localhost:11434', 'mistral:3b');
      expect(isLoaded).toBe(true);
    });

    it('returns false when model is not active in VRAM', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [
              { name: 'llama3:8b', model: 'llama3:8b' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const isLoaded = await aiSettingsService.checkOllamaModelLoaded('http://localhost:11434', 'mistral:3b');
      expect(isLoaded).toBe(false);
    });

    it('returns false when /api/ps returns HTTP error or network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error / connection refused'));

      const isLoaded = await aiSettingsService.checkOllamaModelLoaded('http://localhost:11434', 'mistral:3b');
      expect(isLoaded).toBe(false);
    });
  });

  describe('BYOK Provider Isolation & Cloud Connection (Finding #7)', () => {
    it('scopes API keys per provider in providerApiKeys and synchronizes them', () => {
      aiSettingsService.saveSettings({
        activeProvider: 'openai',
        apiKey: 'sk-proj-openai-key',
        cloudModel: 'gpt-4o',
      });

      const s1 = aiSettingsService.getSettings();
      expect(s1.providerApiKeys?.openai).toBe('sk-proj-openai-key');
      expect(s1.providerModels?.openai).toBe('gpt-4o');

      aiSettingsService.saveSettings({
        activeProvider: 'anthropic',
        apiKey: 'sk-ant-claude-key',
        cloudModel: 'claude-3-5-sonnet-20241022',
      });

      const s2 = aiSettingsService.getSettings();
      expect(s2.providerApiKeys?.anthropic).toBe('sk-ant-claude-key');
      expect(s2.providerApiKeys?.openai).toBe('sk-proj-openai-key');
    });

    it('sends Gemini API key via x-goog-api-key header and not URL query parameter', async () => {
      let requestUrl = '';
      let requestHeaders: Record<string, string> = {};

      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (input, init) => {
        requestUrl = String(input);
        requestHeaders = (init?.headers || {}) as Record<string, string>;
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      });

      const res = await aiSettingsService.testCloudConnection('gemini', 'test-gemini-key');
      expect(res.ok).toBe(true);
      expect(requestUrl).not.toContain('key=test-gemini-key');
      expect(requestHeaders['x-goog-api-key']).toBe('test-gemini-key');
    });
  });
});
