import type { AIExecutionContext, AIToolDefinition, PendingActionProposal } from '../ai/types';
import type { BridgeCall, BridgeOutcome } from './mcpBridgeClient';
import type { ApprovalDecision } from './mcpApprovalStore';

/** Everything the executor needs from the app, so that it can be tested without the app. */
export interface McpExecutorDeps {
  getTool: (name: string) => AIToolDefinition | undefined;
  executeTool: (name: string, args: Record<string, unknown>, context: AIExecutionContext) => Promise<unknown>;
  createPendingAction: (toolName: string, type: string, params: Record<string, unknown>, preview: Record<string, unknown>) => PendingActionProposal;
  approveAction: (id: string, context: AIExecutionContext) => Promise<PendingActionProposal>;
  rejectAction: (id: string) => PendingActionProposal;
  getPendingAction: (id: string) => PendingActionProposal | undefined;
  requestApproval: (proposal: PendingActionProposal) => Promise<ApprovalDecision>;
  onSettled?: (proposal: PendingActionProposal) => void;
  redact: (text: string) => string;
  isVaultUnlocked: () => boolean;
  isReadOnly: () => boolean;
  context: () => AIExecutionContext;
}

// These messages go to the AI client, so they are written for it, in English.
const LOCKED = 'GlassFolio is locked. Ask the user to unlock their vault, then try again.';
const READ_ONLY = 'Blocked: GlassFolio is in read-only mode, so this change was not made. The user can change this in Settings > AI & MCP.';
const DECLINED = 'The user declined this change in GlassFolio. Nothing was changed.';
const EXPIRED = 'The user did not answer in time. Nothing was changed. Ask them to try again and approve the change in GlassFolio.';

/**
 * Runs the tool calls of an AI client in the app, with the same rules as the in-app assistant: a tool that
 * changes data waits for the user's approval, read-only mode blocks it, and secrets are redacted from what
 * leaves the app.
 */
export function createMcpBridgeExecutor(deps: McpExecutorDeps) {
  const ok = (value: unknown): BridgeOutcome => ({ ok: true, result: deps.redact(typeof value === 'string' ? value : (JSON.stringify(value ?? null) ?? 'null')) });
  const fail = (message: string): BridgeOutcome => ({ ok: false, error: deps.redact(message) });
  const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

  return async function execute(call: BridgeCall): Promise<BridgeOutcome> {
    if (!deps.isVaultUnlocked()) return fail(LOCKED);
    const tool = deps.getTool(call.name);
    if (!tool) return fail(`Unknown tool: ${call.name}`);
    const context = deps.context();

    if (!tool.requiresConfirmation) {
      try {
        return ok(await deps.executeTool(call.name, call.arguments, context));
      } catch (error) {
        return fail(describe(error));
      }
    }

    if (deps.isReadOnly()) return fail(READ_ONLY);
    const proposal = deps.createPendingAction(call.name, call.name, call.arguments, call.arguments);
    const decision = await deps.requestApproval(proposal);
    if (decision === 'locked') return fail(LOCKED);
    if (decision !== 'approved') {
      deps.rejectAction(proposal.id);
      return fail(decision === 'rejected' ? DECLINED : EXPIRED);
    }
    if (deps.isReadOnly()) {
      // Read-only was switched on while the card was shown
      deps.rejectAction(proposal.id);
      return fail(READ_ONLY);
    }
    try {
      const done = await deps.approveAction(proposal.id, context);
      deps.onSettled?.(done);
      return done.status === 'failed' ? fail(done.error ?? 'The change was refused.') : ok(done.result);
    } catch (error) {
      const known = deps.getPendingAction(proposal.id);
      if (known) deps.onSettled?.(known);
      return fail(describe(error));
    }
  };
}
