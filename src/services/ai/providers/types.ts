import { AILanguage, ChatMessage, LLMResponse, AIToolParametersSchema } from '../types';

export interface LLMToolSchema {
  name: string;
  description: string;
  parameters: AIToolParametersSchema;
}

export class ModelRejectedAttachmentError extends Error {
  constructor(
    public readonly status: number,
    public readonly providerMessage: string
  ) {
    super(`MODEL_REJECTED_ATTACHMENT:${status}:${providerMessage}`);
    this.name = 'ModelRejectedAttachmentError';
  }
}

export interface AIProvider {
  sendMessage: (
    messages: ChatMessage[],
    tools: LLMToolSchema[],
    systemPrompt: string,
    /** Interface language; LLM providers get it through the localized system prompt. */
    language?: AILanguage
  ) => Promise<LLMResponse>;
}
