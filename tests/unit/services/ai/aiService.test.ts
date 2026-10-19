import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aiService } from '../../../../src/services/ai/aiService';
import { aiSettingsService } from '../../../../src/services/ai/aiSettingsService';
import '../../../../src/services/ai/tools';

describe('aiService', () => {
  beforeEach(() => {
    aiService.clearMessages();
    aiSettingsService.saveSettings({
      activeProvider: 'mock',
      executionMode: 'supervised',
    });
  });

  it('starts with an empty message list and can clear messages', () => {
    expect(aiService.getMessages()).toEqual([]);
  });

  it('handles read-only queries by executing tools and providing synthesis', async () => {
    const messages = await aiService.sendMessage('Fais-moi un résumé de mon patrimoine');

    expect(messages.length).toBeGreaterThanOrEqual(2);
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.content).toContain('Synthèse de votre Portefeuille');
  });

  it('intercepts mutation requests and generates a pending action proposal for human approval', async () => {
    const messages = await aiService.sendMessage('Enregistre un ordre d’achat de 10 actions Apple');

    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.pendingAction).toBeDefined();
    expect(lastMsg.pendingAction?.toolName).toBe('record_transaction');
    expect(lastMsg.pendingAction?.status).toBe('pending');
  });

  it('allows user to approve pending action, executing the tool', async () => {
    const messages = await aiService.sendMessage('Enregistre un achat pour des actions Apple');
    const lastMsg = messages[messages.length - 1];
    const proposalId = lastMsg.pendingAction!.id;

    await aiService.approveAction(proposalId);

    const updatedMessages = aiService.getMessages();
    const finalMsg = updatedMessages[updatedMessages.length - 1];
    expect(finalMsg.content).toContain('validée et enregistrée avec succès');
  });

  it('blocks mutation requests when executionMode is strict read_only', async () => {
    aiSettingsService.saveSettings({ executionMode: 'read_only' });

    const messages = await aiService.sendMessage('Enregistre un achat de 10 actions Apple');
    const lastMsg = messages[messages.length - 1];

    expect(lastMsg.pendingAction).toBeUndefined();
    expect(lastMsg.content).toContain('Lecture Seule Stricte');
  });

  it('allows editing a previous message, forks history and regenerates the response', async () => {
    // 1. Initial conversation turn
    const turn1 = await aiService.sendMessage('Question 1 initiale');
    const initialUserMsg = turn1.find((m) => m.role === 'user')!;
    expect(turn1.length).toBeGreaterThanOrEqual(2);

    // 2. Second turn
    const turn2 = await aiService.sendMessage('Question 2 secondaire');
    expect(turn2.length).toBeGreaterThanOrEqual(4);

    // 3. Edit Question 1: conversation must prune Question 2 and its answers
    const forked = await aiService.editMessageAndRegenerate(initialUserMsg.id, 'Question 1 modifiée');
    
    // Should now contain only the edited user message and its new assistant reply
    expect(forked.length).toBe(2);
    expect(forked[0].role).toBe('user');
    expect(forked[0].content).toBe('Question 1 modifiée');
    expect(forked[1].role).toBe('assistant');
  });

  it('formats Ollama connection error with actionable advice when Ollama is unreachable', async () => {
    aiSettingsService.saveSettings({ activeProvider: 'ollama' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Failed to fetch'));

    const messages = await aiService.sendMessage('hello');
    const lastMsg = messages[messages.length - 1];

    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.content).toContain('Connexion à Ollama impossible');
    expect(lastMsg.content).toContain('ollama serve');
  });

  it('formats Ollama model not found error with available models', async () => {
    aiSettingsService.saveSettings({ activeProvider: 'ollama', ollamaModel: 'uninstalled:latest' });
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "model 'uninstalled:latest' not found" }), {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [{ name: 'ministral-3:3b' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const messages = await aiService.sendMessage('hello');
    const lastMsg = messages[messages.length - 1];

    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.content).toContain('Modèle Ollama');
    expect(lastMsg.content).toContain('ministral-3:3b');
    expect(lastMsg.content).toContain('ollama pull');
  });

  it('routes requests to Google Gemini provider with user specified custom model', async () => {
    aiSettingsService.saveSettings({
      activeProvider: 'gemini',
      apiKey: 'test-gemini-key',
      cloudModel: 'gemini-1.5-pro',
    });

    const mockResponse = {
      choices: [
        {
          message: {
            content: 'Bonjour depuis Google Gemini!',
          },
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const messages = await aiService.sendMessage('Bonjour Gemini');
    const lastMsg = messages[messages.length - 1];

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-gemini-key',
        }),
        body: expect.stringContaining('"model":"gemini-1.5-pro"'),
      })
    );
    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.content).toBe('Bonjour depuis Google Gemini!');
  });

  it('displays actionable error when cloudModel is not configured (empty) without forcing defaults', async () => {
    aiSettingsService.saveSettings({
      activeProvider: 'gemini',
      apiKey: 'test-gemini-key',
      cloudModel: '',
    });

    const messages = await aiService.sendMessage('Bonjour Gemini');
    const lastMsg = messages[messages.length - 1];

    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.content).toContain('Modèle d\'IA non configuré');
    expect(lastMsg.content).toContain('Google Gemini');
    expect(lastMsg.content).toContain('Réglages > IA & MCP');
  });

  it('displays actionable error when API key is missing for cloud provider', async () => {
    aiSettingsService.saveSettings({
      activeProvider: 'openai',
      apiKey: '',
      cloudModel: 'custom-model',
    });

    const messages = await aiService.sendMessage('Hello OpenAI');
    const lastMsg = messages[messages.length - 1];

    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.content).toContain('Clé API non renseignée');
    expect(lastMsg.content).toContain('OpenAI');
  });

  it('displays actionable guidance when cloud API reports model is not found or deprecated', async () => {
    aiSettingsService.saveSettings({
      activeProvider: 'gemini',
      apiKey: 'test-gemini-key',
      cloudModel: 'deprecated-model',
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "The model 'deprecated-model' does not exist or is deprecated" } }), {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const messages = await aiService.sendMessage('Hello Gemini');
    const lastMsg = messages[messages.length - 1];

    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.content).toContain('Modèle d\'IA introuvable ou non supporté');
  });
});

