import { AIProvider, LLMToolSchema } from './types';
import { ChatMessage, LLMResponse, ToolCallRequest } from '../types';

export class OllamaProvider implements AIProvider {
  constructor(
    private endpoint: string = 'http://localhost:11434',
    private model: string = 'llama3.2:latest'
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
        content: m.content,
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

    const response = await fetch(`${cleanUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: formattedMessages,
        tools: formattedTools.length > 0 ? formattedTools : undefined,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const msg = data?.message;
    const content = msg?.content || '';

    const toolCalls: ToolCallRequest[] = [];
    if (Array.isArray(msg?.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (tc?.function?.name) {
          toolCalls.push({
            id: tc.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            name: tc.function.name,
            arguments: typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments || {},
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
