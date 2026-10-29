import { AIProvider, LLMToolSchema } from './types';
import { ChatMessage, LLMResponse, ToolCallRequest } from '../types';

export class OllamaConnectionError extends Error {
  constructor(public endpoint: string, originalMessage?: string) {
    super(`OLLAMA_CONNECTION_ERROR:${endpoint}:${originalMessage || ''}`);
    this.name = 'OllamaConnectionError';
  }
}

export class OllamaModelNotFoundError extends Error {
  constructor(public model: string, public endpoint: string, public availableModels: string[] = []) {
    super(`OLLAMA_MODEL_NOT_FOUND:${model}`);
    this.name = 'OllamaModelNotFoundError';
  }
}

export class OllamaGeneralError extends Error {
  constructor(public status: number, public serverMessage: string) {
    super(`OLLAMA_HTTP_ERROR:${status}:${serverMessage}`);
    this.name = 'OllamaGeneralError';
  }
}

export class OllamaProvider implements AIProvider {
  constructor(
    private endpoint: string = 'http://localhost:11434',
    private model: string = 'llama3.2:latest',
    private enableThinking: boolean = true
  ) {}

  public async sendMessage(
    messages: ChatMessage[],
    tools: LLMToolSchema[],
    systemPrompt: string
  ): Promise<LLMResponse> {
    const cleanUrl = this.endpoint.replace(/\/+$/, '');

    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role === 'tool' ? 'tool' : m.role,
        content: m.content || '',
        ...(m.toolCalls && m.toolCalls.length > 0
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: tc.arguments,
                },
              })),
            }
          : {}),
      })),
    ];

    const formattedTools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const payload: Record<string, unknown> = {
      model: this.model,
      messages: formattedMessages,
      tools: formattedTools.length > 0 ? formattedTools : undefined,
      stream: false,
    };

    if (typeof this.enableThinking === 'boolean') {
      payload.think = this.enableThinking;
    }

    let response: Response;
    try {
      response = await fetch(`${cleanUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (netErr) {
      throw new OllamaConnectionError(
        this.endpoint,
        netErr instanceof Error ? netErr.message : String(netErr)
      );
    }

    if (!response.ok) {
      const errText = await response.text();
      let errMsg = errText;
      try {
        const json = JSON.parse(errText);
        if (json.error) errMsg = json.error;
      } catch {
        // Ignore JSON parse failure and fallback to raw text
      }

      // If the model does not support the 'think' option, automatically retry without it
      if (payload.think && errMsg.toLowerCase().includes('does not support thinking')) {
        delete payload.think;
        try {
          response = await fetch(`${cleanUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } catch (retryNetErr) {
          throw new OllamaConnectionError(
            this.endpoint,
            retryNetErr instanceof Error ? retryNetErr.message : String(retryNetErr)
          );
        }

        if (!response.ok) {
          const retryErrText = await response.text();
          let retryErrMsg = retryErrText;
          try {
            const rJson = JSON.parse(retryErrText);
            if (rJson.error) retryErrMsg = rJson.error;
          } catch {
            // Ignore JSON parse failure and fallback to raw text
          }
          throw new OllamaGeneralError(response.status, retryErrMsg);
        }
      } else if (response.status === 404 || errMsg.toLowerCase().includes('not found')) {
        // Query tags to get available models for a helpful error message
        let availableModels: string[] = [];
        try {
          const tagsRes = await fetch(`${cleanUrl}/api/tags`);
          if (tagsRes.ok) {
            const tagsData = await tagsRes.json();
            if (Array.isArray(tagsData?.models)) {
              availableModels = tagsData.models
                .map((m: { name?: string; model?: string }) => m.name || m.model || '')
                .filter(Boolean);
            }
          }
        } catch {
          // Ignore network failure when fetching model tags list
        }
        throw new OllamaModelNotFoundError(this.model, this.endpoint, availableModels);
      } else {
        throw new OllamaGeneralError(response.status, errMsg);
      }
    }

    const data = await response.json();
    const msg = data?.message;
    let content = msg?.content || '';

    // Handle Ollama thinking field if present
    if (msg?.thinking && typeof msg.thinking === 'string') {
      if (this.enableThinking) {
        content = `<think>\n${msg.thinking.trim()}\n</think>\n\n${content}`;
      }
    } else if (!this.enableThinking) {
      // Strip <think> tags if user disabled thinking mode
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    }

    const toolCalls: ToolCallRequest[] = [];
    if (Array.isArray(msg?.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (tc?.function?.name) {
          let parsedArgs: Record<string, unknown> = {};
          if (typeof tc.function.arguments === 'string') {
            try {
              parsedArgs = JSON.parse(tc.function.arguments);
            } catch {
              parsedArgs = {};
            }
          } else if (tc.function.arguments && typeof tc.function.arguments === 'object') {
            parsedArgs = tc.function.arguments as Record<string, unknown>;
          }

          toolCalls.push({
            id: tc.id || `call_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
            name: tc.function.name,
            arguments: parsedArgs,
          });
        }
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}
