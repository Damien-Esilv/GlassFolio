import { PendingActionProposal, PendingActionType, AIExecutionContext } from './types';
import { aiToolRegistry } from './aiToolRegistry';

/**
 * GuardrailsService - Manages permissions, read-only mode, and Human-in-the-loop action approvals.
 */
class GuardrailsService {
  private pendingActions: Map<string, PendingActionProposal> = new Map();

  /**
   * Generates a pending action proposal when a tool requires human approval.
   */
  public createPendingAction(
    toolName: string,
    type: PendingActionType,
    params: Record<string, unknown>,
    previewData: Record<string, unknown>
  ): PendingActionProposal {
    const id = `act_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const proposal: PendingActionProposal = {
      id,
      toolName,
      type,
      params,
      previewData,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.pendingActions.set(id, proposal);
    return proposal;
  }

  /**
   * Retrieves a pending action proposal by ID.
   */
  public getPendingAction(id: string): PendingActionProposal | undefined {
    return this.pendingActions.get(id);
  }

  /**
   * Approves and executes a pending action via the tool registry.
   */
  public async approveAction(id: string, context: AIExecutionContext = {}): Promise<PendingActionProposal> {
    const action = this.pendingActions.get(id);
    if (!action) {
      throw new Error(`Pending action '${id}' not found`);
    }

    if (action.status !== 'pending') {
      throw new Error(`Action '${id}' is already ${action.status}`);
    }

    try {
      const tool = aiToolRegistry.getTool(action.toolName);
      if (!tool) {
        throw new Error(`Tool '${action.toolName}' is not registered`);
      }

      // Execute directly bypassing the requirement check since human confirmed
      const result = await tool.execute(action.params, context);
      action.status = 'executed';
      action.result = result;
      return action;
    } catch (err) {
      action.status = 'failed';
      action.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  /**
   * Declines a pending action proposal.
   */
  public rejectAction(id: string): PendingActionProposal {
    const action = this.pendingActions.get(id);
    if (!action) {
      throw new Error(`Pending action '${id}' not found`);
    }

    action.status = 'rejected';
    return action;
  }

  /**
   * Clears pending actions (for tests or session reset).
   */
  public clear(): void {
    this.pendingActions.clear();
  }

  /**
   * Redacts sensitive secrets, recovery keys, and vault envelopes from text before sending to LLM context.
   */
  public redactSensitiveExfiltrations(content: string): string {
    if (!content) return content;

    let sanitized = content;

    // 1. API Keys (OpenAI, Anthropic, Gemini, AWS)
    sanitized = sanitized.replace(/sk-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_API_KEY]');
    sanitized = sanitized.replace(/AIzaSy[a-zA-Z0-9_-]{30,}/g, '[REDACTED_API_KEY]');
    sanitized = sanitized.replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED_API_KEY]');

    // 2. Recovery keys (8 groups of 4 uppercase alphanumeric chars)
    sanitized = sanitized.replace(
      /\b([A-Z0-9]{4}-){7}[A-Z0-9]{4}\b/g,
      '[REDACTED_RECOVERY_KEY]'
    );

    // 3. TOTP secrets / URIs
    sanitized = sanitized.replace(/otpauth:\/\/[^\s"']+/g, '[REDACTED_TOTP_URI]');
    sanitized = sanitized.replace(/secret=[A-Z2-7]{20,}/g, 'secret=[REDACTED_TOTP_SEED]');

    // 4. Encrypted vault envelopes / header payloads
    sanitized = sanitized.replace(/\{"v":1,"alg":"A256GCM"[^}]+\}/g, '[REDACTED_ENCRYPTED_ENVELOPE]');
    sanitized = sanitized.replace(/"wrappedKeys":\{[^}]+\}/g, '"wrappedKeys":[REDACTED_VAULT_KEYS]');
    sanitized = sanitized.replace(/gf_vault_header["']?\s*[:=]\s*\{[^}]+\}/gi, 'gf_vault_header:[REDACTED_VAULT_HEADER]');

    return sanitized;
  }

  /**
   * Asserts that a context or tool output does not leak raw secrets, recovery keys, or vault envelopes.
   * Throws an Error if an exfiltration risk is detected.
   */
  public assertSafeContext(content: string): void {
    if (!content) return;

    if (/sk-[a-zA-Z0-9_-]{20,}/.test(content) || /AIzaSy[a-zA-Z0-9_-]{30,}/.test(content)) {
      throw new Error('Potential API key exfiltration detected in AI context');
    }

    if (/\b([A-Z0-9]{4}-){7}[A-Z0-9]{4}\b/.test(content)) {
      throw new Error('Potential Master Recovery Key exfiltration detected in AI context');
    }

    if (/"wrappedKeys":\{/.test(content) || /gf_vault_header/i.test(content)) {
      throw new Error('Potential Vault Header/DEK exfiltration detected in AI context');
    }
  }
}

export const guardrailsService = new GuardrailsService();
