/**
 * Core AI & Model Context Protocol (MCP) TypeScript definitions
 * Used across the In-App AI Assistant, Tool Registry, and External MCP Server.
 */

export interface AIToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
}

export interface AIToolParametersSchema {
  type: 'object';
  properties: Record<string, AIToolParameterProperty>;
  required?: string[];
}

/** Language the assistant answers in: always the language of the interface. */
export type AILanguage = 'en' | 'fr';

export interface AIExecutionContext {
  userId?: string;
  language?: AILanguage;
  currency?: string;
}

export interface AIToolDefinition<TParams = Record<string, unknown>, TResult = unknown> {
  name: string;
  description: string;
  parameters: AIToolParametersSchema;
  /**
   * If true, this action cannot be executed automatically:
   * it requires explicit user approval (Human-in-the-loop) via an AIActionApprovalCard.
   */
  requiresConfirmation?: boolean;
  execute: (params: TParams, context?: AIExecutionContext) => Promise<TResult>;
}

export type PendingActionType = 'record_transaction' | 'create_goal' | string;

export interface PendingActionProposal {
  id: string;
  toolName: string;
  type: PendingActionType;
  params: Record<string, unknown>;
  previewData: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  createdAt: string;
  result?: unknown;
  error?: string;
}

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  toolCalls?: ToolCallRequest[];
  toolCallId?: string;
  toolName?: string;
  pendingAction?: PendingActionProposal;
  thought?: string;
}

export type AIProviderType = 'mock' | 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'groq' | 'openrouter';

export type AIExecutionMode = 'supervised' | 'read_only';

export interface AISettings {
  activeProvider: AIProviderType;
  executionMode: AIExecutionMode;
  ollamaEndpoint: string;
  ollamaModel: string;
  apiKey: string;
  cloudModel: string;
  enableThinking: boolean;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCallRequest[];
  thought?: string;
}
