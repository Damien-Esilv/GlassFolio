/**
 * Tool-call protocol, approvals and secret redaction of the in-app assistant (TGLA-188).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aiService } from '../../../../src/services/ai/aiService';
import { aiSettingsService } from '../../../../src/services/ai/aiSettingsService';
import { guardrailsService } from '../../../../src/services/ai/guardrailsService';
import { aiToolRegistry } from '../../../../src/services/ai/aiToolRegistry';
import { OpenAICompatibleProvider } from '../../../../src/services/ai/providers/openAICompatibleProvider';
import { AnthropicProvider } from '../../../../src/services/ai/providers/anthropicProvider';
import { recordTransactionTool } from '../../../../src/services/ai/tools/transactionTools';
import type { ChatMessage, LLMResponse } from '../../../../src/services/ai/types';
import '../../../../src/services/ai/tools';

const msg = (partial: Partial<ChatMessage>): ChatMessage => ({ id: `m-${Math.random()}`, role: 'user', content: '', timestamp: '', ...partial });

const jsonResponse = (body: unknown) => ({ ok: true, json: async () => body, text: async () => JSON.stringify(body) });

describe('provider message formats', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('OpenAI-compatible: echoes the tool calls of an assistant turn before their results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'done' } }] }));
    vi.stubGlobal('fetch', fetchMock);

    await new OpenAICompatibleProvider('key', 'model').sendMessage([
      msg({ role: 'user', content: 'portfolio?' }),
      msg({ role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'get_portfolio_summary', arguments: { a: 1 } }] }),
      msg({ role: 'tool', content: '{"total":1}', toolCallId: 'call_1' }),
    ], [], 'system');

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { messages: Array<Record<string, unknown>> };
    expect(sent.messages[2]).toMatchObject({
      role: 'assistant',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_portfolio_summary', arguments: '{"a":1}' } }],
    });
    expect(sent.messages[3]).toMatchObject({ role: 'tool', tool_call_id: 'call_1' });
  });

  it('OpenAI-compatible: malformed tool arguments do not throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: '', tool_calls: [{ id: 'c', function: { name: 'x', arguments: '{oops' } }] } }],
    })));
    const res = await new OpenAICompatibleProvider('key', 'model').sendMessage([msg({ content: 'hi' })], [], 'system');
    expect(res.toolCalls?.[0].arguments).toEqual({});
  });

  it('Anthropic: browser access header, tool_use echoed with its thinking, results in one user turn', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'ok' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const providerContent = [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'tool_use', id: 'tu_1', name: 'a', input: {} },
      { type: 'tool_use', id: 'tu_2', name: 'b', input: {} },
    ];

    await new AnthropicProvider('key', 'claude-opus-5-5').sendMessage([
      msg({ role: 'user', content: 'go' }),
      msg({ role: 'assistant', content: '', toolCalls: [{ id: 'tu_1', name: 'a', arguments: {} }, { id: 'tu_2', name: 'b', arguments: {} }], providerContent }),
      msg({ role: 'tool', content: '1', toolCallId: 'tu_1' }),
      msg({ role: 'tool', content: '2', toolCallId: 'tu_2' }),
      msg({ role: 'assistant', content: '' }),
    ], [], 'system');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const sent = JSON.parse(init.body as string) as { messages: Array<{ role: string; content: unknown }> };
    expect(sent.messages).toHaveLength(3);
    expect(sent.messages[1]).toEqual({ role: 'assistant', content: providerContent });
    expect(sent.messages[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tu_1', content: '1' },
        { type: 'tool_result', tool_use_id: 'tu_2', content: '2' },
      ],
    });
  });
});

describe('assistant turn with several tool calls', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    aiService.clearMessages();
    guardrailsService.clear();
    aiSettingsService.saveSettings({ activeProvider: 'mock', executionMode: 'supervised' });
  });

  const withProvider = (responses: LLMResponse[]) => {
    const sendMessage = vi.fn(async (_messages: ChatMessage[]) => responses.shift() as LLMResponse);
    vi.spyOn(aiService as unknown as { getActiveProvider(): unknown }, 'getActiveProvider').mockReturnValue({ sendMessage });
    return sendMessage;
  };

  it('answers every tool call and shows one card per proposed change', async () => {
    withProvider([{
      content: '',
      toolCalls: [
        { id: 'c1', name: 'record_transaction', arguments: { instrument: 'Apple', symbol: 'AAPL', type: 'Buy', amount: 1, price: 100 } },
        { id: 'c2', name: 'record_transaction', arguments: { instrument: 'Microsoft', symbol: 'MSFT', type: 'Buy', amount: 1, price: 300 } },
      ],
    }]);

    const messages = await aiService.sendMessage('buy both');

    const toolIds = messages.filter(m => m.role === 'tool').map(m => m.toolCallId);
    expect(toolIds).toEqual(['c1', 'c2']);
    const cards = messages.filter(m => m.pendingAction);
    expect(cards.map(m => m.pendingAction?.params.symbol)).toEqual(['AAPL', 'MSFT']);
    // The tool results come right after the invocation, before any card
    const invocation = messages.findIndex(m => m.toolCalls);
    expect(messages[invocation + 1].role).toBe('tool');
    expect(messages[invocation + 2].role).toBe('tool');
  });

  it('never sends a pasted API key to the provider', async () => {
    const sendMessage = withProvider([{ content: 'noted' }]);
    await aiService.sendMessage('my key is sk-abcdefghijklmnopqrstuvwxyz123456');
    const sent = sendMessage.mock.calls[0][0] as ChatMessage[];
    expect(sent.map(m => m.content).join(' ')).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(sent.map(m => m.content).join(' ')).toContain('[REDACTED_API_KEY]');
  });
});

describe('approvals', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    guardrailsService.clear();
    aiService.clearMessages();
    aiSettingsService.saveSettings({ activeProvider: 'mock', executionMode: 'supervised' });
  });

  it('reports a change the tool refused as failed, not as saved', async () => {
    const proposal = guardrailsService.createPendingAction('record_transaction', 'record_transaction',
      { instrument: 'Apple', symbol: 'AAPL', type: 'Buy', amount: -5, price: 100 }, {});

    const result = await aiService.approveAction(proposal.id, { language: 'en' });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/positive/);
    const last = aiService.getMessages().at(-1);
    expect(last?.content).toMatch(/could not be completed/);
  });

  it('runs an approved change once, even on a double click, and cannot reject it midway', async () => {
    const execute = vi.fn(async () => { await new Promise(r => setTimeout(r, 10)); return { success: true }; });
    vi.spyOn(aiToolRegistry, 'getTool').mockReturnValue({ ...recordTransactionTool, execute } as never);
    const proposal = guardrailsService.createPendingAction('record_transaction', 'record_transaction', {}, {});

    const first = guardrailsService.approveAction(proposal.id);
    await expect(guardrailsService.approveAction(proposal.id)).rejects.toThrow(/executing/);
    expect(guardrailsService.rejectAction(proposal.id).status).toBe('pending');
    await first;

    expect(execute).toHaveBeenCalledTimes(1);
    expect(guardrailsService.getPendingAction(proposal.id)?.status).toBe('executed');
  });

  it('declines a card approved after read-only mode was switched on', async () => {
    const proposal = guardrailsService.createPendingAction('record_transaction', 'record_transaction', {}, {});
    aiSettingsService.saveSettings({ executionMode: 'read_only' });

    const result = await aiService.approveAction(proposal.id, { language: 'en' });
    expect(result.status).toBe('rejected');
  });
});

describe('record_transaction validation', () => {
  it.each([
    [{ amount: 0 }, /positive/],
    [{ amount: Number.NaN }, /positive/],
    [{ price: -1 }, /price/],
    [{ date: '30/10/2026' }, /YYYY-MM-DD/],
    [{ date: '2999-01-01' }, /future/],
    [{ account: 'Nowhere' }, /No account/],
  ])('refuses %o', async (override, error) => {
    const result = await recordTransactionTool.execute(
      { instrument: 'Apple', symbol: 'AAPL', type: 'Buy', amount: 1, price: 100, ...override } as never,
      { currency: 'EUR' }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(error);
  });
});
