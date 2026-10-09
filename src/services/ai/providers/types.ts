import { ChatMessage, LLMResponse, AIToolParametersSchema } from '../types';

export interface LLMToolSchema {
  name: string;
  description: string;
  parameters: AIToolParametersSchema;
}

export interface AIProvider {
  sendMessage: (
    messages: ChatMessage[],
    tools: LLMToolSchema[],
    systemPrompt: string
  ) => Promise<LLMResponse>;
}
