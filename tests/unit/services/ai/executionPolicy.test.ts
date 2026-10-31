import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALWAYS_CONFIRM_TOOLS, decideConfirmation, toolsThatAsk } from '../../../../src/services/ai/executionPolicy';
import type { AIExecutionMode } from '../../../../src/services/ai/types';

const catalog = JSON.parse(readFileSync(join(process.cwd(), 'mcp-server/tools.json'), 'utf-8')) as { tools: Array<{ name: string; annotations: { readOnlyHint: boolean } }> };
const change = { name: 'record_transaction', requiresConfirmation: true };
const read = { name: 'list_goals', requiresConfirmation: false };
const account = { name: 'lock_vault', requiresConfirmation: true };

describe('confirmation policy of the three execution modes', () => {
  it.each<[AIExecutionMode, string, string]>([
    ['supervised', 'read', 'run'],
    ['supervised', 'change', 'ask'],
    ['supervised', 'account', 'ask'],
    ['read_only', 'read', 'run'],
    ['read_only', 'change', 'block'],
    ['read_only', 'account', 'block'],
    ['autonomous', 'read', 'run'],
    ['autonomous', 'change', 'run'],
    ['autonomous', 'account', 'ask'],
  ])('%s mode, %s tool: %s', (mode, kind, expected) => {
    const tool = { read, change, account }[kind as 'read' | 'change' | 'account'];
    expect(decideConfirmation(tool, mode)).toBe(expected);
  });

  it('keeps asking for the actions on the account in autonomous mode, and only those', () => {
    expect([...ALWAYS_CONFIRM_TOOLS].sort()).toEqual(['export_gdpr_archive', 'lock_vault', 'resend_verification_email', 'rotate_encryption_key']);
    const needApproval = new Set(catalog.tools.filter((tool) => !tool.annotations.readOnlyHint).map((tool) => tool.name));
    ALWAYS_CONFIRM_TOOLS.forEach((name) => expect(needApproval.has(name), `${name} must be a real tool that needs approval`).toBe(true));
    const unlocked = [...needApproval].filter((name) => decideConfirmation({ name, requiresConfirmation: true }, 'autonomous') === 'run');
    expect(unlocked.length).toBeGreaterThan(0);
    expect(unlocked.every((name) => !ALWAYS_CONFIRM_TOOLS.has(name))).toBe(true);
  });

  describe('the list of what still asks', () => {
    const tools = [
      { name: 'lock_vault', requiresConfirmation: true },
      { name: 'record_transaction', requiresConfirmation: true },
      { name: 'list_goals', requiresConfirmation: false },
      { name: 'new_account_action', requiresConfirmation: true },
    ];

    it('is computed from the tools and the rule, in alphabetical order', () => {
      expect(toolsThatAsk(tools, 'autonomous').map((tool) => tool.name)).toEqual(['lock_vault']);
      expect(toolsThatAsk(tools, 'supervised').map((tool) => tool.name)).toEqual(['lock_vault', 'new_account_action', 'record_transaction']);
      expect(toolsThatAsk(tools, 'read_only')).toEqual([]);
    });

    it('updates by itself when the rule starts to cover a new tool', () => {
      const widened = new Set([...ALWAYS_CONFIRM_TOOLS, 'new_account_action']);
      expect(toolsThatAsk(tools, 'autonomous', widened).map((tool) => tool.name)).toEqual(['lock_vault', 'new_account_action']);
      expect(decideConfirmation(tools[3], 'autonomous', widened)).toBe('ask');
      expect(decideConfirmation(tools[3], 'autonomous')).toBe('run');
    });
  });
});
