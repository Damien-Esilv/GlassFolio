import type { AIExecutionMode, AIToolDefinition } from './types';

/**
 * Tools that keep asking for the user's approval even in autonomous mode: they act on the account itself
 * (the vault key, the exported archive, the verification email), not on the financial data. Autonomous mode
 * removes the confirmation of changes to the data only. To widen or narrow it, edit this list.
 */
export const ALWAYS_CONFIRM_TOOLS: ReadonlySet<string> = new Set([
  'lock_vault',
  'rotate_encryption_key',
  'export_gdpr_archive',
  'resend_verification_email',
]);

/** What to do with a tool call: run it now, wait for the user's approval, or refuse it. */
export type ConfirmationDecision = 'run' | 'ask' | 'block';

/**
 * The single rule shared by the in-app assistant and by AI clients on the MCP bridge:
 * - a tool that changes nothing always runs;
 * - read-only mode refuses every change;
 * - supervised mode asks the user first;
 * - autonomous mode runs the change at once, except for the tools of ALWAYS_CONFIRM_TOOLS.
 */
export function decideConfirmation(tool: Pick<AIToolDefinition, 'name' | 'requiresConfirmation'>, mode: AIExecutionMode): ConfirmationDecision {
  if (!tool.requiresConfirmation) return 'run';
  if (mode === 'read_only') return 'block';
  if (mode === 'autonomous' && !ALWAYS_CONFIRM_TOOLS.has(tool.name)) return 'run';
  return 'ask';
}
