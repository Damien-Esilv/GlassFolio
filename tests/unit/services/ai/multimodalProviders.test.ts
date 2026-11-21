import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aiService } from '../../../../src/services/ai/aiService';
import { aiSettingsService } from '../../../../src/services/ai/aiSettingsService';
import { clearModelCapabilitiesCache } from '../../../../src/services/ai/modelCapabilities';
import { OpenAICompatibleProvider } from '../../../../src/services/ai/providers/openAICompatibleProvider';
import { AnthropicProvider } from '../../../../src/services/ai/providers/anthropicProvider';
import { OllamaProvider } from '../../../../src/services/ai/providers/ollamaProvider';
import { ModelRejectedAttachmentError } from '../../../../src/services/ai/providers/types';
import type { ChatAttachment, ChatMessage } from '../../../../src/services/ai/types';
import '../../../../src/services/ai/tools';

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const makeMsg = (attachments: ChatAttachment[], content = 'Import this'): ChatMessage => ({
  id: 'm1',
  role: 'user',
  content,
  attachments,
  timestamp: '2026-01-01T00:00:00.000Z',
});

describe('multimodal providers & guardrails', () => {
  beforeEach(() => {
    localStorage.clear();
    clearModelCapabilitiesCache();
    aiService.clearMessages();
    vi.restoreAllMocks();
  });

  it('OpenAI formats images as image_url and PDFs as type=file', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      okJson({ choices: [{ message: { content: 'ok' } }] })
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAICompatibleProvider('k', 'gpt-4o', 'https://api.openai.com/v1/chat/completions', true, {
      pdfMode: 'native_file',
    });
    await provider.sendMessage(
      [
        makeMsg([
          { id: '1', kind: 'image', name: 'shot.png', mimeType: 'image/png', sizeBytes: 10, base64: 'SU1H' },
          { id: '2', kind: 'pdf', name: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 20, base64: 'UERG' },
        ]),
      ],
      [],
      'sys'
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[1].content).toEqual([
      { type: 'text', text: 'Import this' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,SU1H' } },
      { type: 'file', file: { filename: 'doc.pdf', file_data: 'data:application/pdf;base64,UERG' } },
    ]);
    expect(body.plugins).toBeUndefined();
  });

  it('Gemini OpenAI-compat sends PDFs natively via image_url data URI', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      okJson({ choices: [{ message: { content: 'ok' } }] })
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAICompatibleProvider(
      'k',
      'gemini-2.5-flash',
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      true,
      { pdfMode: 'native_image_url' }
    );
    await provider.sendMessage(
      [makeMsg([{ id: '1', kind: 'pdf', name: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 20, base64: 'UERG' }])],
      [],
      'sys'
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[1].content).toEqual([
      { type: 'text', text: 'Import this' },
      { type: 'image_url', image_url: { url: 'data:application/pdf;base64,UERG' } },
    ]);
  });

  it('OpenRouter attaches pdf-text plugin when enabled for file parts', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      okJson({ choices: [{ message: { content: 'ok' } }] })
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAICompatibleProvider(
      'k',
      'meta/model',
      'https://openrouter.ai/api/v1/chat/completions',
      true,
      { pdfMode: 'native_file', useOpenRouterPdfPlugin: true }
    );
    await provider.sendMessage(
      [makeMsg([{ id: '1', kind: 'pdf', name: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 20, base64: 'UERG' }])],
      [],
      'sys'
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'pdf-text' } }]);
  });

  it('Anthropic formats image and PDF document base64 blocks', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      okJson({ content: [{ type: 'text', text: 'ok' }] })
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AnthropicProvider('k', 'claude-sonnet-4-5');
    await provider.sendMessage(
      [
        makeMsg(
          [
            { id: '1', kind: 'image', name: 'shot.png', mimeType: 'image/png', sizeBytes: 10, base64: 'SU1H' },
            { id: '2', kind: 'pdf', name: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 20, base64: 'UERG' },
          ],
          ''
        ),
      ],
      [],
      'sys'
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'SU1H' } },
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'UERG' } },
      ],
    });
  });

  it('Ollama sends raw base64 images array and appends text attachments', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      okJson({ message: { content: 'ok' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OllamaProvider('http://localhost:11434', 'qwen2.5vl:7b');
    await provider.sendMessage(
      [
        makeMsg([
          { id: '1', kind: 'csv', name: 'a.csv', mimeType: 'text/csv', sizeBytes: 5, text: 'Date,Amount\n2025-01-01,10' },
          { id: '2', kind: 'image', name: 'b.png', mimeType: 'image/png', sizeBytes: 10, base64: 'SU1H' },
        ]),
      ],
      [],
      'sys'
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[1].images).toEqual(['SU1H']);
    expect(body.messages[1].content).toContain('<attachment name="a.csv">');
  });

  it('throws ModelRejectedAttachmentError when API rejects multimodal content with HTTP 400', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response('{"error":"Model does not support images"}', { status: 400 })
      )
    );
    const provider = new OpenAICompatibleProvider('k', 'text-model');
    await expect(
      provider.sendMessage(
        [makeMsg([{ id: '1', kind: 'image', name: 'x.png', mimeType: 'image/png', sizeBytes: 10, base64: 'SU1H' }])],
        [],
        'sys'
      )
    ).rejects.toThrow(ModelRejectedAttachmentError);
  });

  it('aiService redacts secrets in CSV attachments, purges binary base64 after turn, and blocks incompatible attachments', async () => {
    aiSettingsService.saveSettings({
      activeProvider: 'openai',
      apiKey: 'test-openai-key',
      cloudModel: 'gpt-4o',
    });

    const fetchMock = vi.fn().mockResolvedValueOnce(
      okJson({ choices: [{ message: { content: 'Processed safely' } }] })
    );
    vi.stubGlobal('fetch', fetchMock);

    const msgs = await aiService.sendMessage(
      'Analyze',
      { language: 'en' },
      [
        {
          id: 'csv1',
          kind: 'csv',
          name: 'secret.csv',
          mimeType: 'text/csv',
          sizeBytes: 50,
          text: 'Date,Remark,Amount\n2025-01-01,sk-abcdefghijklmnopqrstuvwxyz123456,100',
        },
        {
          id: 'img1',
          kind: 'image',
          name: 'shot.png',
          mimeType: 'image/png',
          sizeBytes: 10,
          base64: 'SU1H',
        },
      ]
    );

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const sentText = sentBody.messages[1].content[0].text as string;
    expect(sentText).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(sentText).toContain('[REDACTED_API_KEY]');

    // Binary base64 MUST be purged from history after turn completion
    const storedUserMsg = msgs.find((m) => m.role === 'user');
    const storedImg = storedUserMsg?.attachments?.find((a) => a.id === 'img1');
    expect(storedImg?.base64).toBeUndefined();
    expect(storedImg?.purged).toBe(true);

    // Next turn with Ollama text-only + image attachment is rejected at service level
    aiService.clearMessages();
    clearModelCapabilitiesCache();
    aiSettingsService.saveSettings({ activeProvider: 'ollama', ollamaModel: 'llama3.2:latest' });
    fetchMock.mockResolvedValueOnce(
      okJson({ capabilities: ['completion', 'tools'] })
    );
    const denied = await aiService.sendMessage(
      'Read image',
      { language: 'en' },
      [{ id: 'img2', kind: 'image', name: 'shot.png', mimeType: 'image/png', sizeBytes: 10, base64: 'SU1H' }]
    );
    expect(denied[denied.length - 1].content).toContain('does not support images');
  });

  it('Demo Mode deterministically runs preview_transaction_import for attached CSV/XLSX', async () => {
    aiSettingsService.saveSettings({ activeProvider: 'mock' });
    const msgs = await aiService.sendMessage(
      'Preview this file',
      { language: 'en' },
      [
        {
          id: 'csv2',
          kind: 'csv',
          name: 'demo.csv',
          mimeType: 'text/csv',
          sizeBytes: 60,
          text: 'Date,Type,Symbol,Shares,Price,Amount\n2025-01-05,BUY,AAPL,2,200,400',
        },
      ]
    );
    const last = msgs[msgs.length - 1];
    expect(last.role).toBe('assistant');
    expect(last.content).toContain('Detected Import Preview');
  });
});
