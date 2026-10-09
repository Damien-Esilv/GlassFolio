import { ChatMessage, AIExecutionContext, PendingActionProposal } from './types';
import { aiToolRegistry } from './aiToolRegistry';
import { guardrailsService } from './guardrailsService';
import { aiSettingsService } from './aiSettingsService';
import { AIProvider } from './providers/types';
import { MockProvider } from './providers/mockProvider';
import { OllamaProvider } from './providers/ollamaProvider';
import { OpenAICompatibleProvider } from './providers/openAICompatibleProvider';
import { AnthropicProvider } from './providers/anthropicProvider';
// Ensure all standard tools are registered
import './tools';

const SYSTEM_PROMPT = `Tu es l'assistant financier personnel et privé de GlassFolio.
Tu réponds en français clair, précis et synthétique aux questions financières de l'utilisateur.
Tu disposes d'outils pour consulter le portefeuille, l'allocation d'actifs, les positions, les transactions et la fiscalité.
RÈGLE D'OR : Pour toute opération modifiant le portefeuille (enregistrement d'une transaction, création d'un objectif), appelle l'outil correspondant. L'utilisateur devra obligatoirement valider l'opération via une interface interactive.
Ne donne jamais de conseil d'investissement spéculatif sans rappeler le caractère informatif de tes réponses.`;

/**
 * AIService - Central Orchestrator for the In-App AI Chat and MCP Capabilities.
 */
class AIService {
  private messages: ChatMessage[] = [];

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
        return new OllamaProvider(settings.ollamaEndpoint, settings.ollamaModel);
      case 'openai':
        return new OpenAICompatibleProvider(
          settings.apiKey,
          settings.cloudModel || 'gpt-4o-mini',
          'https://api.openai.com/v1/chat/completions'
        );
      case 'groq':
        return new OpenAICompatibleProvider(
          settings.apiKey,
          settings.cloudModel || 'llama-3.3-70b-versatile',
          'https://api.groq.com/openai/v1/chat/completions'
        );
      case 'openrouter':
        return new OpenAICompatibleProvider(
          settings.apiKey,
          settings.cloudModel || 'anthropic/claude-3.5-sonnet',
          'https://openrouter.ai/api/v1/chat/completions'
        );
      case 'anthropic':
        return new AnthropicProvider(
          settings.apiKey,
          settings.cloudModel || 'claude-3-5-sonnet-20241022'
        );
      case 'mock':
      default:
        return new MockProvider();
    }
  }

  /**
   * Main conversation turn: sends a message, executes tools if needed, and returns the updated messages.
   */
  public async sendMessage(
    content: string,
    context: AIExecutionContext = { language: 'fr', currency: 'EUR' }
  ): Promise<ChatMessage[]> {
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    this.messages.push(userMsg);

    const provider = this.getActiveProvider();
    const tools = aiToolRegistry.getAllTools().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    try {
      // First call to the LLM
      const initialResponse = await provider.sendMessage(this.messages, tools, SYSTEM_PROMPT);

      // Handle Tool Calls if any
      if (initialResponse.toolCalls && initialResponse.toolCalls.length > 0) {
        for (const toolCall of initialResponse.toolCalls) {
          const toolDef = aiToolRegistry.getTool(toolCall.name);
          const settings = aiSettingsService.getSettings();

          // Check if tool requires human approval (or if in strict read-only mode)
          if (toolDef?.requiresConfirmation) {
            if (settings.executionMode === 'read_only') {
              const blockedMsg: ChatMessage = {
                id: `msg_${Date.now()}_a`,
                role: 'assistant',
                content: `Le mode "Lecture Seule Stricte" est activé. L'action **${toolCall.name}** a été bloquée conformément à vos réglages de sécurité.`,
                timestamp: new Date().toISOString(),
              };
              this.messages.push(blockedMsg);
              return this.messages;
            }

            // Create Pending Action for Human-in-the-loop approval
            const proposal = guardrailsService.createPendingAction(
              toolCall.name,
              toolCall.name,
              toolCall.arguments,
              toolCall.arguments
            );

            const assistantMsg: ChatMessage = {
              id: `msg_${Date.now()}_a`,
              role: 'assistant',
              content:
                initialResponse.content ||
                `Une confirmation est requise avant d'exécuter l'action financière ci-dessous :`,
              timestamp: new Date().toISOString(),
              pendingAction: proposal,
            };
            this.messages.push(assistantMsg);
            return this.messages;
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
        const finalResponse = await provider.sendMessage(this.messages, tools, SYSTEM_PROMPT);
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
      const errorMsg: ChatMessage = {
        id: `msg_${Date.now()}_err`,
        role: 'assistant',
        content: `Une erreur est survenue lors de l'échange avec l'assistant : ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date().toISOString(),
      };
      this.messages.push(errorMsg);
    }

    return this.messages;
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
      content: `✅ L'opération a été validée et enregistrée avec succès dans votre portefeuille.`,
      timestamp: new Date().toISOString(),
    };
    this.messages.push(confirmationMsg);

    return executedProposal;
  }

  /**
   * Rejects a pending action.
   */
  public rejectAction(actionId: string): PendingActionProposal {
    const rejectedProposal = guardrailsService.rejectAction(actionId);

    for (const msg of this.messages) {
      if (msg.pendingAction?.id === actionId) {
        msg.pendingAction = { ...rejectedProposal };
      }
    }

    const rejectionMsg: ChatMessage = {
      id: `msg_${Date.now()}_sys`,
      role: 'assistant',
      content: `❌ L'opération a été refusée et annulée. Aucune modification n'a été effectuée.`,
      timestamp: new Date().toISOString(),
    };
    this.messages.push(rejectionMsg);

    return rejectedProposal;
  }
}

export const aiService = new AIService();
