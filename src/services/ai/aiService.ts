import { AILanguage, ChatMessage, AIExecutionContext, PendingActionProposal } from './types';
import { aiToolRegistry } from './aiToolRegistry';
import { guardrailsService } from './guardrailsService';
import { aiSettingsService } from './aiSettingsService';
import i18n from '../../i18n';
import { AIProvider } from './providers/types';
import { MockProvider } from './providers/mockProvider';
import {
  OllamaProvider,
  OllamaConnectionError,
  OllamaModelNotFoundError,
  OllamaGeneralError,
} from './providers/ollamaProvider';
import { OpenAICompatibleProvider } from './providers/openAICompatibleProvider';
import { AnthropicProvider } from './providers/anthropicProvider';
import { vaultService } from '../security/vaultService';
// Ensure all standard tools are registered
import './tools';

/** Answers follow the interface language; the system prompt (ai:prompt.system) says so explicitly. */
const resolveLanguage = (context: AIExecutionContext): AILanguage =>
  context.language ?? (i18n.language?.startsWith('en') ? 'en' : 'fr');

export class CloudModelNotConfiguredError extends Error {
  public provider: string;

  constructor(provider: string) {
    super(`No model configured for ${provider}`);
    this.name = 'CloudModelNotConfiguredError';
    this.provider = provider;
  }
}

export class CloudApiKeyMissingError extends Error {
  public provider: string;

  constructor(provider: string) {
    super(`API key missing for ${provider}`);
    this.name = 'CloudApiKeyMissingError';
    this.provider = provider;
  }
}

/**
 * AIService - Central Orchestrator for the In-App AI Chat and MCP Capabilities.
 */
class AIService {
  private messages: ChatMessage[] = [];

  constructor() {
    vaultService.subscribeStatus((status) => {
      if (status === 'locked') {
        this.clearMessages();
      }
    });
  }

  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  public clearMessages(): void {
    this.messages = [];
  }

  /**
   * Resolves the active LLM provider instance according to user settings.
   */
  private getActiveProvider(): AIProvider {
    const settings = aiSettingsService.getSettings();

    switch (settings.activeProvider) {
      case 'ollama':
        return new OllamaProvider(
          settings.ollamaEndpoint,
          settings.ollamaModel,
          settings.enableThinking
        );
      case 'openai': {
        const model = settings.cloudModel?.trim();
        if (!model) throw new CloudModelNotConfiguredError('OpenAI');
        if (!settings.apiKey?.trim()) throw new CloudApiKeyMissingError('OpenAI');
        return new OpenAICompatibleProvider(
          settings.apiKey,
          model,
          'https://api.openai.com/v1/chat/completions',
          settings.enableThinking
        );
      }
      case 'groq': {
        const model = settings.cloudModel?.trim();
        if (!model) throw new CloudModelNotConfiguredError('Groq');
        if (!settings.apiKey?.trim()) throw new CloudApiKeyMissingError('Groq');
        return new OpenAICompatibleProvider(
          settings.apiKey,
          model,
          'https://api.groq.com/openai/v1/chat/completions',
          settings.enableThinking
        );
      }
      case 'openrouter': {
        const model = settings.cloudModel?.trim();
        if (!model) throw new CloudModelNotConfiguredError('OpenRouter');
        if (!settings.apiKey?.trim()) throw new CloudApiKeyMissingError('OpenRouter');
        return new OpenAICompatibleProvider(
          settings.apiKey,
          model,
          'https://openrouter.ai/api/v1/chat/completions',
          settings.enableThinking
        );
      }
      case 'anthropic': {
        const model = settings.cloudModel?.trim();
        if (!model) throw new CloudModelNotConfiguredError('Anthropic (Claude)');
        if (!settings.apiKey?.trim()) throw new CloudApiKeyMissingError('Anthropic (Claude)');
        return new AnthropicProvider(
          settings.apiKey,
          model,
          settings.enableThinking
        );
      }
      case 'gemini': {
        const model = settings.cloudModel?.trim();
        if (!model) throw new CloudModelNotConfiguredError('Google Gemini');
        if (!settings.apiKey?.trim()) throw new CloudApiKeyMissingError('Google Gemini');
        return new OpenAICompatibleProvider(
          settings.apiKey,
          model,
          'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
          settings.enableThinking
        );
      }
      case 'mock':
      default:
        return new MockProvider(settings.enableThinking);
    }
  }

  /**
   * Adds a user message to the conversation history immediately and returns it.
   */
  public addUserMessage(content: string): ChatMessage {
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    this.messages.push(userMsg);
    return userMsg;
  }

  /**
   * Processes the assistant turn against current messages, handling tools and guardrails.
   */
  public async processAssistantTurn(
    context: AIExecutionContext = { language: 'fr', currency: 'EUR' }
  ): Promise<ChatMessage[]> {
    try {
      const provider = this.getActiveProvider();
      const tools = aiToolRegistry.getAllTools().map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));

      const lng = resolveLanguage(context);
      const systemPrompt = i18n.t('ai:prompt.system', { lng });

      // First call to the LLM
      const initialResponse = await provider.sendMessage(this.messages, tools, systemPrompt, lng);

      // Handle Tool Calls if any
      if (initialResponse.toolCalls && initialResponse.toolCalls.length > 0) {
        // Record the assistant's tool invocation turn to satisfy chat API protocol
        const assistantInvocationMsg: ChatMessage = {
          id: `msg_${Date.now()}_a_invoc`,
          role: 'assistant',
          content: initialResponse.content || '',
          toolCalls: initialResponse.toolCalls,
          timestamp: new Date().toISOString(),
        };
        this.messages.push(assistantInvocationMsg);

        for (const toolCall of initialResponse.toolCalls) {
          const toolDef = aiToolRegistry.getTool(toolCall.name);
          const settings = aiSettingsService.getSettings();

          // Check if tool requires human approval (or if in strict read-only mode)
          if (toolDef?.requiresConfirmation) {
            if (settings.executionMode === 'read_only') {
              const blockedMsg: ChatMessage = {
                id: `msg_${Date.now()}_a`,
                role: 'assistant',
                content: i18n.t('ai:service.readOnlyBlocked', { lng, tool: toolCall.name }),
                timestamp: new Date().toISOString(),
              };
              this.messages.push(blockedMsg);
              return [...this.messages];
            }

            // Create Pending Action for Human-in-the-loop approval
            const proposal = guardrailsService.createPendingAction(
              toolCall.name,
              toolCall.name,
              toolCall.arguments,
              toolCall.arguments
            );

            assistantInvocationMsg.pendingAction = proposal;
            assistantInvocationMsg.content =
              initialResponse.content ||
              `Une confirmation est requise avant d'exécuter l'action financière ci-dessous :`;
            return [...this.messages];
          }

          // Read-only tool execution
          let toolResultStr = '';
          try {
            const result = await aiToolRegistry.executeTool(
              toolCall.name,
              toolCall.arguments,
              context
            );
            toolResultStr = JSON.stringify(result);
          } catch (err) {
            toolResultStr = JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
          }

          const toolMsg: ChatMessage = {
            id: `msg_${Date.now()}_t`,
            role: 'tool',
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            content: toolResultStr,
            timestamp: new Date().toISOString(),
          };
          this.messages.push(toolMsg);
        }

        // Second call to let LLM summarize the tool results
        const finalResponse = await provider.sendMessage(this.messages, tools, systemPrompt, lng);
        const finalAssistantMsg: ChatMessage = {
          id: `msg_${Date.now()}_a`,
          role: 'assistant',
          content: finalResponse.content || 'Voici les informations demandées.',
          timestamp: new Date().toISOString(),
        };
        this.messages.push(finalAssistantMsg);
      } else {
        // Direct textual answer
        const assistantMsg: ChatMessage = {
          id: `msg_${Date.now()}_a`,
          role: 'assistant',
          content: initialResponse.content || 'Je suis à votre écoute.',
          timestamp: new Date().toISOString(),
        };
        this.messages.push(assistantMsg);
      }
    } catch (err) {
      const lng = resolveLanguage(context);
      let errorContent = '';

      if (err instanceof CloudModelNotConfiguredError || (err instanceof Error && err.name === 'CloudModelNotConfiguredError')) {
        const providerName = (err as any).provider || 'Cloud';
        errorContent =
          `### ⚠️ ${i18n.t('ai:errors.cloudModelMissingTitle', { lng, provider: providerName })}\n\n` +
          i18n.t('ai:errors.cloudModelMissingBody', { lng, provider: providerName });
      } else if (err instanceof CloudApiKeyMissingError || (err instanceof Error && err.name === 'CloudApiKeyMissingError')) {
        const providerName = (err as any).provider || 'Cloud';
        errorContent =
          `### ⚠️ ${i18n.t('ai:errors.cloudApiKeyMissingTitle', { lng, provider: providerName })}\n\n` +
          i18n.t('ai:errors.cloudApiKeyMissingBody', { lng, provider: providerName });
      } else if (
        err instanceof Error &&
        (err.message.includes('model') || err.message.includes('Model')) &&
        (err.message.includes('not found') || err.message.includes('does not exist') || err.message.includes('deprecated') || err.message.includes('404'))
      ) {
        errorContent =
          `### ⚠️ ${i18n.t('ai:errors.cloudModelInvalidTitle', { lng })}\n\n` +
          i18n.t('ai:errors.cloudModelInvalidBody', { lng, error: err.message });
      } else if (err instanceof OllamaConnectionError) {
        errorContent =
          `### ⚠️ ${i18n.t('ai:errors.ollamaConnectionFailedTitle', { lng })}\n\n` +
          i18n.t('ai:errors.ollamaConnectionFailedBody', { lng, endpoint: err.endpoint });
      } else if (err instanceof OllamaModelNotFoundError) {
        if (err.availableModels && err.availableModels.length > 0) {
          const listStr = err.availableModels.map((m) => `- \`${m}\``).join('\n');
          errorContent =
            `### ⚠️ ${i18n.t('ai:errors.ollamaModelNotFoundTitle', { lng, model: err.model })}\n\n` +
            i18n.t('ai:errors.ollamaModelNotFoundWithAvailable', {
              lng,
              model: err.model,
              available: listStr,
            });
        } else {
          errorContent =
            `### ⚠️ ${i18n.t('ai:errors.ollamaModelNotFoundTitle', { lng, model: err.model })}\n\n` +
            i18n.t('ai:errors.ollamaModelNotFoundBody', { lng, model: err.model });
        }
      } else if (err instanceof OllamaGeneralError) {
        errorContent =
          `### ⚠️ ${i18n.t('ai:errors.ollamaServerErrorTitle', { lng, status: err.status })}\n\n` +
          i18n.t('ai:errors.ollamaServerResponseBody', { lng, message: err.serverMessage });
      } else {
        errorContent = i18n.t('ai:errors.generalError', {
          lng,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const errorMsg: ChatMessage = {
        id: `msg_${Date.now()}_err`,
        role: 'assistant',
        content: errorContent,
        timestamp: new Date().toISOString(),
      };
      this.messages.push(errorMsg);
    }

    return [...this.messages];
  }

  /**
   * Main conversation turn: sends a message, executes tools if needed, and returns the updated messages.
   */
  public async sendMessage(
    content: string,
    context: AIExecutionContext = { language: 'fr', currency: 'EUR' }
  ): Promise<ChatMessage[]> {
    this.addUserMessage(content);
    return this.processAssistantTurn(context);
  }

  /**
   * Modifies a previous user message, truncates conversation history from that point forward,
   * and regenerates the assistant response with the updated context.
   */
  public async editMessageAndRegenerate(
    messageId: string,
    newContent: string,
    context: AIExecutionContext = { language: 'fr', currency: 'EUR' }
  ): Promise<ChatMessage[]> {
    const targetIdx = this.messages.findIndex((m) => m.id === messageId);
    if (targetIdx !== -1) {
      // Fork history: discard everything from that message onwards
      this.messages = this.messages.slice(0, targetIdx);
    }
    this.addUserMessage(newContent);
    return this.processAssistantTurn(context);
  }

  /**
   * Approves a pending action (Human-in-the-loop) and informs the conversation.
   */
  public async approveAction(actionId: string, context: AIExecutionContext = {}): Promise<PendingActionProposal> {
    const executedProposal = await guardrailsService.approveAction(actionId, context);

    // Update message state in conversation
    for (const msg of this.messages) {
      if (msg.pendingAction?.id === actionId) {
        msg.pendingAction = { ...executedProposal };
      }
    }

    const confirmationMsg: ChatMessage = {
      id: `msg_${Date.now()}_sys`,
      role: 'assistant',
      content: i18n.t('ai:service.actionApproved', { lng: resolveLanguage(context) }),
      timestamp: new Date().toISOString(),
    };
    this.messages.push(confirmationMsg);

    return executedProposal;
  }

  /**
   * Rejects a pending action.
   */
  public rejectAction(actionId: string, context: AIExecutionContext = {}): PendingActionProposal {
    const rejectedProposal = guardrailsService.rejectAction(actionId);

    for (const msg of this.messages) {
      if (msg.pendingAction?.id === actionId) {
        msg.pendingAction = { ...rejectedProposal };
      }
    }

    const rejectionMsg: ChatMessage = {
      id: `msg_${Date.now()}_sys`,
      role: 'assistant',
      content: i18n.t('ai:service.actionRejected', { lng: resolveLanguage(context) }),
      timestamp: new Date().toISOString(),
    };
    this.messages.push(rejectionMsg);

    return rejectedProposal;
  }
}

export const aiService = new AIService();
