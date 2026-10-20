import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockProvider } from '../../../../src/services/ai/providers/mockProvider';
import { OpenAICompatibleProvider } from '../../../../src/services/ai/providers/openAICompatibleProvider';
import { AnthropicProvider } from '../../../../src/services/ai/providers/anthropicProvider';

describe('AI Providers Thinking Consistency', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('MockProvider', () => {
    it('includes collapsible <think> reasoning in conversational responses when enableThinking is true', async () => {
      const provider = new MockProvider(true);
      const res = await provider.sendMessage(
        [{ id: '1', role: 'user', content: 'Bonjour', timestamp: '' }],
        [],
        'System'
      );

      expect(res.content).toContain('<think>');
      expect(res.content).toContain('</think>');
      expect(res.content).toContain('Je suis votre assistant financier privé GlassFolio');
    });

    it('omits <think> reasoning in conversational responses when enableThinking is false', async () => {
      const provider = new MockProvider(false);
      const res = await provider.sendMessage(
        [{ id: '1', role: 'user', content: 'Bonjour', timestamp: '' }],
        [],
        'System'
      );

      expect(res.content).not.toContain('<think>');
      expect(res.content).toContain('Je suis votre assistant financier privé GlassFolio');
    });

    it('includes <think> reasoning in action proposal turns when enableThinking is true', async () => {
      const provider = new MockProvider(true);
      const res = await provider.sendMessage(
        [{ id: '1', role: 'user', content: 'achète 10 actions apple', timestamp: '' }],
        [],
        'System'
      );

      expect(res.content).toContain('<think>');
      expect(res.content).toContain('Human-in-the-Loop');
      expect(res.toolCalls?.[0]?.name).toBe('record_transaction');
    });
  });

  describe('OpenAICompatibleProvider', () => {
    it('extracts reasoning_content into <think> block when enableThinking is true', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Voici les calculs de plus-value.',
                  reasoning_content: 'Étape 1 : récupération des PRU. Étape 2 : calcul du gain net.',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const provider = new OpenAICompatibleProvider('sk-test', 'deepseek-r1', 'https://api.test.com', true);
      const res = await provider.sendMessage(
        [{ id: '1', role: 'user', content: 'calculs', timestamp: '' }],
        [],
        'System'
      );

      expect(res.content).toContain('<think>');
      expect(res.content).toContain('Étape 1 : récupération des PRU');
      expect(res.content).toContain('Voici les calculs de plus-value.');
    });

    it('strips <think> block when enableThinking is false', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: '<think>Reasoning to be hidden</think>Final clean content',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const provider = new OpenAICompatibleProvider('sk-test', 'deepseek-r1', 'https://api.test.com', false);
      const res = await provider.sendMessage(
        [{ id: '1', role: 'user', content: 'calculs', timestamp: '' }],
        [],
        'System'
      );

      expect(res.content).not.toContain('<think>');
      expect(res.content).toBe('Final clean content');
    });
  });

  describe('AnthropicProvider', () => {
    it('extracts thinking block into <think> block when enableThinking is true', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [
              {
                type: 'thinking',
                thinking: 'Extended thinking from Claude 3.7...',
              },
              {
                type: 'text',
                text: 'Voici votre analyse patrimoniale.',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const provider = new AnthropicProvider('ant-key', 'claude-3-7-sonnet', true);
      const res = await provider.sendMessage(
        [{ id: '1', role: 'user', content: 'analyse', timestamp: '' }],
        [],
        'System'
      );

      expect(res.content).toContain('<think>');
      expect(res.content).toContain('Extended thinking from Claude 3.7...');
      expect(res.content).toContain('Voici votre analyse patrimoniale.');
    });

    it('strips <think> block when enableThinking is false', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [
              {
                type: 'text',
                text: '<think>Secret thoughts</think>Public analysis result.',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const provider = new AnthropicProvider('ant-key', 'claude-3-7-sonnet', false);
      const res = await provider.sendMessage(
        [{ id: '1', role: 'user', content: 'analyse', timestamp: '' }],
        [],
        'System'
      );

      expect(res.content).not.toContain('<think>');
      expect(res.content).toBe('Public analysis result.');
    });
  });
});
