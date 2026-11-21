/**
 * Core AI & Model Context Protocol (MCP) TypeScript definitions
 * Used across the In-App AI Assistant, Tool Registry, and External MCP Server.
 */

export interface AIToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
  items?: AIToolParameterProperty;
  properties?: Record<string, AIToolParameterProperty>;
  required?: string[];
  additionalProperties?: boolean | AIToolParameterProperty;
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

export type AttachmentKind = 'csv' | 'xlsx' | 'pdf' | 'image';

export type AttachmentPreprocessMethod =
  | 'xlsx_to_csv'
  | 'pdf_text'
  | 'pdf_pages_to_images'
  | 'image_resized';

export interface AttachmentPreprocessingInfo {
  method: AttachmentPreprocessMethod;
  details?: Record<string, string | number>;
}

export interface ChatAttachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** Locally extracted text (CSV, XLSX->CSV, PDF->text) */
  text?: string;
  /** Raw base64 without data: prefix for images or native PDFs; kept in memory only and purged after the turn */
  base64?: string;
  /** Rendered page images when a scanned PDF was converted locally for a vision model */
  pageImages?: Array<{ base64: string; mimeType: 'image/jpeg' }>;
  /** Present whenever GlassFolio locally pre-processed the file before sending (powers the UI (i) badge) */
  preprocessing?: AttachmentPreprocessingInfo;
  /** True once binary payload has been purged from conversation history after sending */
  purged?: boolean;
}

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
  attachments?: ChatAttachment[];
  toolCalls?: ToolCallRequest[];
  toolCallId?: string;
  toolName?: string;
  pendingAction?: PendingActionProposal;
  thought?: string;
  /** The provider's own content blocks for this turn (Anthropic thinking + tool_use), sent back as is. */
  providerContent?: unknown[];
}

export type AIProviderType = 'mock' | 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'groq' | 'openrouter';

/** supervised: changes wait for approval; read_only: no change; autonomous: changes run without asking (see executionPolicy.ts) */
export type AIExecutionMode = 'supervised' | 'read_only' | 'autonomous';

export interface AISettings {
  activeProvider: AIProviderType;
  executionMode: AIExecutionMode;
  ollamaEndpoint: string;
  ollamaModel: string;
  apiKey: string;
  cloudModel: string;
  enableThinking: boolean;
  providerApiKeys?: Partial<Record<AIProviderType, string>>;
  providerModels?: Partial<Record<AIProviderType, string>>;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCallRequest[];
  thought?: string;
  /** See ChatMessage.providerContent */
  providerContent?: unknown[];
}
