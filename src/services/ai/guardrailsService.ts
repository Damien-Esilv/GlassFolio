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
}

export const guardrailsService = new GuardrailsService();
