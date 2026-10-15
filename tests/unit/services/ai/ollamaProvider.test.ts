import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OllamaProvider,
  OllamaConnectionError,
  OllamaModelNotFoundError,
  OllamaGeneralError,
} from '../../../../src/services/ai/providers/ollamaProvider';

describe('OllamaProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws OllamaConnectionError when fetch fails (e.g. Ollama is closed)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Failed to fetch'));

    const provider = new OllamaProvider('http://localhost:11434', 'ministral-3:3b');
    await expect(
      provider.sendMessage([{ id: '1', role: 'user', content: 'hello', timestamp: '' }], [], 'System')
    ).rejects.toThrow(OllamaConnectionError);
  });

  it('auto-recovers without think parameter when Ollama reports model does not support thinking', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      // First attempt: HTTP 400 "ministral-3:3b does not support thinking"
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: '"ministral-3:3b" does not support thinking' }), {
          status: 400,
          statusText: 'Bad Request',
          headers: { 'Content-Type': 'application/json' },
        })
      )
      // Second attempt (retry without think): HTTP 200 OK
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: { role: 'assistant', content: 'Hello from Ollama!' } }), {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' },
        })
      );

    const provider = new OllamaProvider('http://localhost:11434', 'ministral-3:3b', true);
    const result = await provider.sendMessage(
      [{ id: '1', role: 'user', content: 'hello', timestamp: '' }],
      [],
      'System'
    );

    expect(result.content).toBe('Hello from Ollama!');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Verify second request did not contain think parameter
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
    expect(secondCallBody.think).toBeUndefined();
  });

  it('queries tags and throws OllamaModelNotFoundError with available models list when model is not found', async () => {
    vi.spyOn(globalThis, 'fetch')
      // Chat call returns 404
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "model 'llama3.2:latest' not found" }), {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'application/json' },
        })
      )
      // Tags call returns installed models
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [{ name: 'ministral-3:3b' }, { name: 'qwen2.5-coder:14b' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const provider = new OllamaProvider('http://localhost:11434', 'llama3.2:latest');

    try {
      await provider.sendMessage([{ id: '1', role: 'user', content: 'hello', timestamp: '' }], [], 'System');
      expect.fail('Should have thrown OllamaModelNotFoundError');
    } catch (err) {
      expect(err).toBeInstanceOf(OllamaModelNotFoundError);
      const notFoundErr = err as OllamaModelNotFoundError;
      expect(notFoundErr.model).toBe('llama3.2:latest');
      expect(notFoundErr.availableModels).toEqual(['ministral-3:3b', 'qwen2.5-coder:14b']);
    }
  });

  it('throws OllamaGeneralError on generic HTTP error with server message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Internal context overflow error' }), {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const provider = new OllamaProvider('http://localhost:11434', 'mistral');
    await expect(
      provider.sendMessage([{ id: '1', role: 'user', content: 'hello', timestamp: '' }], [], 'System')
    ).rejects.toThrow(OllamaGeneralError);
  });
});
