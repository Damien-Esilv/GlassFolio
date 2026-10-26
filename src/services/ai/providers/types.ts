import { AILanguage, ChatMessage, LLMResponse, AIToolParametersSchema } from '../types';

export interface LLMToolSchema {
  name: string;
  description: string;
  parameters: AIToolParametersSchema;
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
