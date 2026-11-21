import { AIProvider, LLMToolSchema, ModelRejectedAttachmentError } from './types';
import { formatTextAttachments, isAttachmentRejectionError } from './attachmentFormatting';
import { ChatMessage, LLMResponse, ToolCallRequest } from '../types';

export class AnthropicProvider implements AIProvider {
  constructor(
    private apiKey: string,
    private model: string,
    private enableThinking: boolean = true
  ) {}

  public async sendMessage(
    messages: ChatMessage[],
    tools: LLMToolSchema[],
    systemPrompt: string
  ): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    // Messages API shape: an assistant turn echoes its tool_use blocks (with the thinking blocks
    // that came with them, unchanged), and every tool_result of that turn goes back in ONE user turn.
    type Block = Record<string, unknown>;
    const formattedMessages: Array<{ role: 'user' | 'assistant'; content: string | Block[] }> = [];
    for (const m of messages) {
      if (m.role === 'tool') {
        const result: Block = { type: 'tool_result', tool_use_id: m.toolCallId || 'call_default', content: m.content };
        const previous = formattedMessages[formattedMessages.length - 1];
        if (previous?.role === 'user' && Array.isArray(previous.content)
          && previous.content.every((b) => b.type === 'tool_result')) {
          previous.content.push(result);
        } else {
          formattedMessages.push({ role: 'user', content: [result] });
        }
      } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        const blocks: Block[] = Array.isArray(m.providerContent)
          ? (m.providerContent as Block[])
          : [
            ...(m.content.trim() ? [{ type: 'text', text: m.content }] : []),
            ...m.toolCalls.map((tc) => ({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments ?? {} })),
          ];
        formattedMessages.push({ role: 'assistant', content: blocks });
      } else if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
        const blocks: Block[] = [];
        for (const att of m.attachments) {
          if (att.kind === 'image' && att.base64) {
            blocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: att.mimeType,
                data: att.base64,
              },
            });
          } else if (att.kind === 'pdf' && att.base64) {
            blocks.push({
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: att.base64,
              },
            });
          } else if (att.pageImages && att.pageImages.length > 0) {
            for (const pageImg of att.pageImages) {
              blocks.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: pageImg.mimeType,
                  data: pageImg.base64,
                },
              });
            }
          }
        }
        const combinedText = `${m.content || ''}${formatTextAttachments(m.attachments)}`.trim();
        if (combinedText) {
          blocks.push({ type: 'text', text: combinedText });
        }
        if (blocks.length > 0) {
          formattedMessages.push({ role: 'user', content: blocks });
        }
      } else if ((m.role === 'user' || m.role === 'assistant') && m.content.trim()) {
        // The API refuses empty text blocks (e.g. an invocation record shown as a card only)
        formattedMessages.push({ role: m.role, content: m.content });
      }
    }

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
        // Required for a request sent straight from the browser (CORS)
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model,
        // Room for the thinking current models do before answering (a low cap cut answers short)
        max_tokens: 16000,
        system: systemPrompt,
        messages: formattedMessages,
        tools: formattedTools.length > 0 ? formattedTools : undefined,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (isAttachmentRejectionError(response.status, errText)) {
        throw new ModelRejectedAttachmentError(response.status, errText || response.statusText);
      }
      throw new Error(`Anthropic error HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    let textContent = '';
    let thinkingContent = '';
    const toolCalls: ToolCallRequest[] = [];

    if (Array.isArray(data?.content)) {
      for (const block of data.content) {
        if (block.type === 'text') {
          textContent += block.text || '';
        } else if (block.type === 'thinking') {
          thinkingContent += block.thinking || '';
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id || `call_${Date.now()}`,
            name: block.name,
            arguments: block.input || {},
          });
        }
      }
    }

    if (this.enableThinking && thinkingContent.trim()) {
      textContent = `<think>\n${thinkingContent.trim()}\n</think>\n\n${textContent}`;
    } else if (!this.enableThinking) {
      textContent = textContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      // Thinking blocks must come back unchanged with the tool_use they preceded
      ...(toolCalls.length > 0 && Array.isArray(data?.content) ? { providerContent: data.content as unknown[] } : {}),
    };
  }
}
