import { AIProvider, LLMToolSchema, ModelRejectedAttachmentError } from './types';
import { formatTextAttachments, isAttachmentRejectionError } from './attachmentFormatting';
import { ChatMessage, LLMResponse, ToolCallRequest } from '../types';

export interface OpenAICompatibleOptions {
  pdfMode?: 'native_file' | 'native_image_url' | 'none';
  useOpenRouterPdfPlugin?: boolean;
}

/** Models sometimes return malformed JSON arguments: an empty object lets the tool report it. */
const parseToolArguments = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string' || raw.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

export class OpenAICompatibleProvider implements AIProvider {
  constructor(
    private apiKey: string,
    private model: string,
    private endpoint: string = 'https://api.openai.com/v1/chat/completions',
    private enableThinking: boolean = true,
    private options: OpenAICompatibleOptions = {}
  ) {}

  public async sendMessage(
    messages: ChatMessage[],
    tools: LLMToolSchema[],
    systemPrompt: string
  ): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('API key is required for cloud LLM provider');
    }

    const pdfMode = this.options.pdfMode ?? 'native_file';
    let hasNativeFilePart = false;

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

        if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
          const combinedText = `${m.content || ''}${formatTextAttachments(m.attachments)}`.trim();
          const binaryParts: Array<Record<string, unknown>> = [];

          for (const att of m.attachments) {
            if (att.kind === 'image' && att.base64) {
              binaryParts.push({
                type: 'image_url',
                image_url: { url: `data:${att.mimeType};base64,${att.base64}` },
              });
            } else if (att.kind === 'pdf' && att.base64) {
              if (pdfMode === 'native_image_url') {
                binaryParts.push({
                  type: 'image_url',
                  image_url: { url: `data:application/pdf;base64,${att.base64}` },
                });
              } else if (pdfMode === 'native_file') {
                hasNativeFilePart = true;
                binaryParts.push({
                  type: 'file',
                  file: {
                    filename: att.name,
                    file_data: `data:application/pdf;base64,${att.base64}`,
                  },
                });
              }
            } else if (att.pageImages && att.pageImages.length > 0) {
              for (const pageImg of att.pageImages) {
                binaryParts.push({
                  type: 'image_url',
                  image_url: { url: `data:${pageImg.mimeType};base64,${pageImg.base64}` },
                });
              }
            }
          }

          if (binaryParts.length > 0) {
            const parts: Array<Record<string, unknown>> = [];
            if (combinedText) {
              parts.push({ type: 'text', text: combinedText });
            }
            parts.push(...binaryParts);
            return { role: 'user', content: parts };
          }

          return { role: 'user', content: combinedText };
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

    const requestBody: Record<string, unknown> = {
      model: this.model,
      messages: formattedMessages,
      tools: formattedTools.length > 0 ? formattedTools : undefined,
    };

    if (this.options.useOpenRouterPdfPlugin && hasNativeFilePart) {
      requestBody.plugins = [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }];
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errBody = await response.text();
      if (isAttachmentRejectionError(response.status, errBody)) {
        throw new ModelRejectedAttachmentError(response.status, errBody || response.statusText);
      }
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
