import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aiService } from '../../../../src/services/ai/aiService';
import { aiSettingsService } from '../../../../src/services/ai/aiSettingsService';
import { MockProvider } from '../../../../src/services/ai/providers/mockProvider';
import i18n from '../../../../src/i18n';
import '../../../../src/services/ai/tools';

/** The assistant always answers in the language of the interface (AI_CODING_STANDARDS §4). */
describe('AI answers in the interface language', () => {
  beforeEach(() => {
    aiService.clearMessages();
    aiSettingsService.saveSettings({ activeProvider: 'mock', executionMode: 'supervised' });
  });

  it('demo assistant introduces itself in English for an English interface', async () => {
    const res = await new MockProvider(false).sendMessage(
      [{ id: '1', role: 'user', content: 'Hello', timestamp: '' }],
      [],
      '',
      'en'
    );
    expect(res.content).toContain('I am GlassFolio, your private financial assistant');
    expect(res.content).not.toMatch(/Je suis|Quelques exemples/);
  });

  it('thinking steps follow the interface language too', async () => {
    const res = await new MockProvider(true).sendMessage(
      [{ id: '1', role: 'user', content: 'Record a buy of 10 Apple shares', timestamp: '' }],
      [],
      '',
      'en'
    );
    expect(res.content).toContain('<think>');
    expect(res.content).toContain('Analysing the requested order');
    expect(res.content).toContain('please approve the operation below');
  });

  it('tool results are summarised in English with English number formatting', async () => {
    const messages = await aiService.sendMessage('What is my current asset allocation?', { language: 'en', currency: 'EUR' });
    const last = messages[messages.length - 1];
    expect(last.content).toContain('Your asset allocation');
    expect(last.content).not.toContain('Répartition');
    expect(last.content).not.toMatch(/\d \d{3}/); // no French narrow no-break space thousands separator
  });

  it('keeps answering in French for a French interface', async () => {
    const messages = await aiService.sendMessage('Fais-moi un résumé de mon patrimoine', { language: 'fr', currency: 'EUR' });
    expect(messages[messages.length - 1].content).toContain('Synthèse de votre Portefeuille');
  });

  it('sends the LLM a system prompt in the interface language', async () => {
    const spy = vi.spyOn(MockProvider.prototype, 'sendMessage');
    await aiService.sendMessage('Hello', { language: 'en', currency: 'EUR' });
    const [, , systemPrompt, language] = spy.mock.calls[0];
    expect(language).toBe('en');
    expect(systemPrompt).toBe(i18n.t('ai:prompt.system', { lng: 'en' }));
    expect(systemPrompt).toContain('Always answer in English');
    spy.mockRestore();
  });

  it('confirms an approved or declined action in the interface language', async () => {
    const messages = await aiService.sendMessage('Record a buy of 10 Apple shares', { language: 'en', currency: 'EUR' });
    const proposal = messages.find((m) => m.pendingAction)?.pendingAction;
    expect(proposal).toBeDefined();
    aiService.rejectAction(proposal!.id, { language: 'en' });
    const last = aiService.getMessages()[aiService.getMessages().length - 1];
    expect(last.content).toBe(i18n.t('ai:service.actionRejected', { lng: 'en' }));
    expect(last.content).toContain('declined');
  });
});
