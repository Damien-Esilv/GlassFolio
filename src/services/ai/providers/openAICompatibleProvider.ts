import { AIProvider, LLMToolSchema } from './types';
import { ChatMessage, LLMResponse, ToolCallRequest } from '../types';

/** Models sometimes return malformed JSON arguments: an empty object lets the tool report it. */
const parseToolArguments = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string' || raw.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

export class OpenAICompatibleProvider implements AIProvider {
  constructor(
    private apiKey: string,
    private model: string,
    private endpoint: string = 'https://api.openai.com/v1/chat/completions',
    private enableThinking: boolean = true
  ) {}

  public async sendMessage(
    messages: ChatMessage[],
    tools: LLMToolSchema[],
    systemPrompt: string
  ): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('API key is required for cloud LLM provider');
    }

    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'tool',
            content: m.content,
            tool_call_id: m.toolCallId || 'call_default',
          };
        }
        // The tool results that follow must answer calls the API sees: echo them back
        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
          return {
            role: 'assistant',
            content: m.content || null,
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) },
            })),
          };
        }
        return {
          role: m.role,
          content: m.content,
        };
      }),
    ];

    const formattedTools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: formattedMessages,
        tools: formattedTools.length > 0 ? formattedTools : undefined,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Provider HTTP ${response.status}: ${errBody || response.statusText}`);
    }

    const data = await response.json();
    const choice = data?.choices?.[0];
    const msg = choice?.message;
    let content = msg?.content || '';

    // Handle DeepSeek-R1 / Groq / OpenRouter / OpenAI reasoning content
    const reasoning = msg?.reasoning_content || msg?.reasoning || msg?.thinking;
    if (reasoning && typeof reasoning === 'string') {
      if (this.enableThinking && !content.includes('<think>')) {
        content = `<think>\n${reasoning.trim()}\n</think>\n\n${content}`;
      }
    } else if (!this.enableThinking) {
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    }

    const toolCalls: ToolCallRequest[] = [];
    if (Array.isArray(msg?.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (tc?.function?.name) {
          toolCalls.push({
            id: tc.id || `call_${Date.now()}`,
            name: tc.function.name,
            arguments: parseToolArguments(tc.function.arguments),
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
