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
export function decideConfirmation(
  tool: Pick<AIToolDefinition, 'name' | 'requiresConfirmation'>,
  mode: AIExecutionMode,
  alwaysConfirm: ReadonlySet<string> = ALWAYS_CONFIRM_TOOLS
): ConfirmationDecision {
  if (!tool.requiresConfirmation) return 'run';
  if (mode === 'read_only') return 'block';
  if (mode === 'autonomous' && !alwaysConfirm.has(tool.name)) return 'run';
  return 'ask';
}

/**
 * The tools that still wait for the user's approval in a mode. Read from the tools themselves and from the rule
 * above, never from a typed list: a tool added tomorrow shows up here as soon as the rule asks for it.
 */
export function toolsThatAsk<T extends Pick<AIToolDefinition, 'name' | 'requiresConfirmation'>>(
  tools: readonly T[],
  mode: AIExecutionMode,
  alwaysConfirm: ReadonlySet<string> = ALWAYS_CONFIRM_TOOLS
): T[] {
  return tools.filter((tool) => decideConfirmation(tool, mode, alwaysConfirm) === 'ask').sort((a, b) => a.name.localeCompare(b.name));
}
