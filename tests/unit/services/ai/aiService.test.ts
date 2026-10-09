import { describe, it, expect, beforeEach } from 'vitest';
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
});
