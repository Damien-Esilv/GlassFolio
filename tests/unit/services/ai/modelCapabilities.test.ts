import { describe, it, expect, beforeEach, vi } from 'vitest';
import visionConfig from '../../../../src/config/aiVisionModels.json';
import {
  canAttach,
  clearModelCapabilitiesCache,
  getModelCapabilities,
} from '../../../../src/services/ai/modelCapabilities';
import type { AISettings } from '../../../../src/services/ai/types';

const baseSettings = (overrides: Partial<AISettings> = {}): AISettings => ({
  activeProvider: 'mock',
  executionMode: 'supervised',
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'llama3.2:latest',
  apiKey: 'test-key',
  cloudModel: '',
  enableThinking: true,
  ...overrides,
});

describe('aiVisionModels config & modelCapabilities', () => {
  beforeEach(() => {
    localStorage.clear();
    clearModelCapabilitiesCache();
    vi.restoreAllMocks();
  });

  it('ships a well-formed aiVisionModels.json config', () => {
    expect(Array.isArray(visionConfig.openai.visionPrefixes)).toBe(true);
    expect(visionConfig.openai.maxImageBytes).toBeGreaterThan(0);
    expect(visionConfig.groq.maxImageBytes).toBe(4 * 1024 * 1024);
    expect(visionConfig.groq.maxImages).toBe(5);
    expect(visionConfig.ollamaFallbackVisionPatterns.length).toBeGreaterThan(5);
  });

  it('probes Ollama /api/show capabilities and detects vision vs text-only models', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ capabilities: ['completion', 'tools'] }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ capabilities: ['completion', 'vision', 'tools'] }), { status: 200 })
      );

    const textOnly = await getModelCapabilities(
      baseSettings({ activeProvider: 'ollama', ollamaModel: 'llama3.2:latest' })
    );
    expect(textOnly.vision).toBe(false);
    expect(textOnly.nativePdf).toBe(false);
    expect(textOnly.pdfMode).toBe('local_preprocess');
    expect(textOnly.probed).toBe(true);
    expect(canAttach('image', textOnly)).toEqual({
      ok: false,
      willPreprocess: false,
      reasonKey: 'ai:attachments.errors.noVision',
    });
    expect(canAttach('pdf', textOnly)).toEqual({
      ok: true,
      willPreprocess: true,
      preprocessMethod: 'pdf_text',
    });

    // Second call with same endpoint|model uses cache without another fetch
    const cachedTextOnly = await getModelCapabilities(
      baseSettings({ activeProvider: 'ollama', ollamaModel: 'llama3.2:latest' })
    );
    expect(cachedTextOnly.vision).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const visionModel = await getModelCapabilities(
      baseSettings({ activeProvider: 'ollama', ollamaModel: 'qwen2.5vl:7b' })
    );
    expect(visionModel.vision).toBe(true);
    expect(canAttach('image', visionModel)).toEqual({ ok: true, willPreprocess: false });
  });

  it('falls back to Ollama model name heuristic when /api/show is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const caps = await getModelCapabilities(
      baseSettings({ activeProvider: 'ollama', ollamaModel: 'llama3.2-vision:11b' })
    );
    expect(caps.vision).toBe(true);
    expect(caps.probed).toBe(false);
  });

  it('supports native PDF via image_url on Gemini and document blocks on Anthropic', async () => {
    const gemini = await getModelCapabilities(
      baseSettings({ activeProvider: 'gemini', cloudModel: 'gemini-2.5-flash' })
    );
    expect(gemini.vision).toBe(true);
    expect(gemini.nativePdf).toBe(true);
    expect(gemini.pdfMode).toBe('native_image_url');
    expect(canAttach('pdf', gemini)).toEqual({ ok: true, willPreprocess: false });

    const anthropic = await getModelCapabilities(
      baseSettings({ activeProvider: 'anthropic', cloudModel: 'claude-sonnet-4-5' })
    );
    expect(anthropic.vision).toBe(true);
    expect(anthropic.nativePdf).toBe(true);
    expect(anthropic.pdfMode).toBe('native_document');
  });

  it('enforces OpenAI and Groq vision/PDF rules and 4MB Groq image cap', async () => {
    const gpt4o = await getModelCapabilities(
      baseSettings({ activeProvider: 'openai', cloudModel: 'gpt-4o' })
    );
    expect(gpt4o.vision).toBe(true);
    expect(gpt4o.nativePdf).toBe(true);
    expect(gpt4o.pdfMode).toBe('native_file');

    const o3Mini = await getModelCapabilities(
      baseSettings({ activeProvider: 'openai', cloudModel: 'o3-mini' })
    );
    expect(o3Mini.nativePdf).toBe(false);
    expect(o3Mini.pdfMode).toBe('local_preprocess');

    const groqText = await getModelCapabilities(
      baseSettings({ activeProvider: 'groq', cloudModel: 'llama-3.3-70b-versatile' })
    );
    expect(groqText.vision).toBe(false);
    expect(groqText.pdfMode).toBe('local_preprocess');

    const groqVision = await getModelCapabilities(
      baseSettings({ activeProvider: 'groq', cloudModel: 'meta-llama/llama-4-scout-17b-16e-instruct' })
    );
    expect(groqVision.vision).toBe(true);
    expect(groqVision.maxImageBytes).toBe(4 * 1024 * 1024);
  });

  it('probes OpenRouter /models once and caches modalities', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            { id: 'anthropic/claude-3.5-sonnet', architecture: { input_modalities: ['text', 'image', 'file'] } },
            { id: 'deepseek/deepseek-chat', architecture: { input_modalities: ['text'] } },
          ],
        }),
        { status: 200 }
      )
    );

    const claude = await getModelCapabilities(
      baseSettings({ activeProvider: 'openrouter', cloudModel: 'anthropic/claude-3.5-sonnet' })
    );
    expect(claude.vision).toBe(true);
    expect(claude.openRouterPdfPlugin).toBe(false);

    const deepseek = await getModelCapabilities(
      baseSettings({ activeProvider: 'openrouter', cloudModel: 'deepseek/deepseek-chat' })
    );
    expect(deepseek.vision).toBe(false);
    expect(deepseek.openRouterPdfPlugin).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allows CSV/XLSX and denies images/PDFs in Mock Demo mode', async () => {
    const mockCaps = await getModelCapabilities(baseSettings({ activeProvider: 'mock' }));
    expect(canAttach('csv', mockCaps)).toEqual({ ok: true, willPreprocess: false });
    expect(canAttach('xlsx', mockCaps)).toEqual({
      ok: true,
      willPreprocess: true,
      preprocessMethod: 'xlsx_to_csv',
    });
    expect(canAttach('image', mockCaps)).toMatchObject({ ok: false, reasonKey: 'ai:attachments.errors.demoUnsupported' });
    expect(canAttach('pdf', mockCaps)).toMatchObject({ ok: false, reasonKey: 'ai:attachments.errors.demoUnsupported' });
  });
});
