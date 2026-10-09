import { AIProvider, LLMToolSchema } from './types';
import { ChatMessage, LLMResponse, ToolCallRequest } from '../types';

export class AnthropicProvider implements AIProvider {
  constructor(
    private apiKey: string,
    private model: string = 'claude-3-5-sonnet-20241022'
  ) {}

  public async sendMessage(
    messages: ChatMessage[],
    tools: LLMToolSchema[],
    systemPrompt: string
  ): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    const formattedMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    if (formattedMessages.length === 0) {
      formattedMessages.push({ role: 'user', content: 'Hello' });
    }

    const formattedTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'dangerously-allow-browser': 'true',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1500,
        system: systemPrompt,
        messages: formattedMessages,
        tools: formattedTools.length > 0 ? formattedTools : undefined,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic error HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    let textContent = '';
    const toolCalls: ToolCallRequest[] = [];

    if (Array.isArray(data?.content)) {
      for (const block of data.content) {
        if (block.type === 'text') {
          textContent += block.text || '';
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id || `call_${Date.now()}`,
            name: block.name,
            arguments: block.input || {},
          });
        }
      }
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}
