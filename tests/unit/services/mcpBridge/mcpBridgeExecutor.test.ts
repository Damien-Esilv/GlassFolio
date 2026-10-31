import { describe, expect, it, vi } from 'vitest';
import { createMcpBridgeExecutor, type McpExecutorDeps } from '../../../../src/services/mcpBridge/mcpBridgeExecutor';
import type { AIToolDefinition, PendingActionProposal } from '../../../../src/services/ai/types';
import type { ApprovalDecision } from '../../../../src/services/mcpBridge/mcpApprovalStore';
import { guardrailsService } from '../../../../src/services/ai/guardrailsService';

const tool = (name: string, requiresConfirmation = false): AIToolDefinition => ({ name, description: name, parameters: { type: 'object', properties: {} }, requiresConfirmation, execute: async () => null });
const proposal = (status: PendingActionProposal['status'] = 'pending', extra: Partial<PendingActionProposal> = {}): PendingActionProposal => ({
  id: 'act_1', toolName: 'record_transaction', type: 'record_transaction', params: {}, previewData: {}, status, createdAt: '2026-10-31T10:00:00.000Z', ...extra,
});

const setup = (overrides: Partial<McpExecutorDeps> = {}) => {
  const tools = new Map([['get_portfolio_summary', tool('get_portfolio_summary')], ['record_transaction', tool('record_transaction', true)]]);
  const deps: McpExecutorDeps = {
    getTool: (name) => tools.get(name),
    executeTool: vi.fn(async () => ({ totalValue: 42 })),
    createPendingAction: vi.fn(() => proposal()),
    approveAction: vi.fn(async () => proposal('executed', { result: { success: true, id: 'tx1' } })),
    rejectAction: vi.fn(() => proposal('rejected')),
    getPendingAction: vi.fn(() => proposal('failed', { error: 'late failure' })),
    requestApproval: vi.fn(async (): Promise<ApprovalDecision> => 'approved'),
    onSettled: vi.fn(),
    redact: (text) => text,
    isVaultUnlocked: () => true,
    isReadOnly: () => false,
    context: () => ({ language: 'en', currency: 'EUR' }),
    ...overrides,
  };
  return { deps, execute: createMcpBridgeExecutor(deps) };
};
const call = (name: string, args: Record<string, unknown> = {}) => ({ name, arguments: args });

describe('tool calls of an AI client, in the app', () => {
  it('refuses everything while the vault is locked, and runs nothing', async () => {
    const { deps, execute } = setup({ isVaultUnlocked: () => false });
    const outcome = await execute(call('get_portfolio_summary'));
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/locked/);
    expect(deps.executeTool).not.toHaveBeenCalled();
  });

  it('refuses a tool the app does not have', async () => {
    const { execute } = setup();
    expect(await execute(call('drop_database'))).toEqual({ ok: false, error: 'Unknown tool: drop_database' });
  });

  it('runs a read-only tool at once, with the language of the app, and returns its result as JSON text', async () => {
    const { deps, execute } = setup();
    const outcome = await execute(call('get_portfolio_summary', { currency: 'USD' }));
    expect(deps.executeTool).toHaveBeenCalledWith('get_portfolio_summary', { currency: 'USD' }, { language: 'en', currency: 'EUR' });
    expect(outcome).toEqual({ ok: true, result: '{"totalValue":42}' });
    expect(deps.requestApproval).not.toHaveBeenCalled();
  });

  it('reports a tool that throws as an error', async () => {
    const { execute } = setup({ executeTool: vi.fn(async () => { throw new Error('no data'); }) });
    expect(await execute(call('get_portfolio_summary'))).toEqual({ ok: false, error: 'no data' });
  });

  it('removes secrets from what leaves the app, results and errors alike', async () => {
    const redact = (text: string) => guardrailsService.redactSensitiveExfiltrations(text);
    const key = `sk-${'a'.repeat(24)}`;
    const leak = setup({ redact, executeTool: vi.fn(async () => ({ apiKey: key, recovery: 'ABCD-1234-ABCD-1234-ABCD-1234-ABCD-1234-ABCD-1234-ABCD-1234-ABCD-1234-ABCD-1234' })) });
    const outcome = await leak.execute(call('get_portfolio_summary'));
    expect(outcome.result).toContain('[REDACTED_API_KEY]');
    expect(outcome.result).toContain('[REDACTED_RECOVERY_KEY]');
    expect(outcome.result).not.toContain(key);
    const failing = setup({ redact, executeTool: vi.fn(async () => { throw new Error(`bad key ${key}`); }) });
    expect((await failing.execute(call('get_portfolio_summary'))).error).not.toContain(key);
  });

  describe('a tool that changes data', () => {
    it('waits for the user, then runs only after approval, and shows the outcome', async () => {
      const { deps, execute } = setup();
      const outcome = await execute(call('record_transaction', { symbol: 'AAPL' }));
      expect(deps.createPendingAction).toHaveBeenCalledWith('record_transaction', 'record_transaction', { symbol: 'AAPL' }, { symbol: 'AAPL' });
      expect(deps.requestApproval).toHaveBeenCalled();
      expect(deps.executeTool).not.toHaveBeenCalled();
      expect(deps.approveAction).toHaveBeenCalledWith('act_1', { language: 'en', currency: 'EUR' });
      expect(deps.onSettled).toHaveBeenCalled();
      expect(outcome).toEqual({ ok: true, result: '{"success":true,"id":"tx1"}' });
    });

    it('changes nothing when the user declines', async () => {
      const { deps, execute } = setup({ requestApproval: vi.fn(async (): Promise<ApprovalDecision> => 'rejected') });
      const outcome = await execute(call('record_transaction'));
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toMatch(/declined/);
      expect(deps.approveAction).not.toHaveBeenCalled();
      expect(deps.rejectAction).toHaveBeenCalledWith('act_1');
    });

    it('changes nothing when the user does not answer in time', async () => {
      const { deps, execute } = setup({ requestApproval: vi.fn(async (): Promise<ApprovalDecision> => 'expired') });
      const outcome = await execute(call('record_transaction'));
      expect(outcome.error).toMatch(/did not answer in time/);
      expect(deps.approveAction).not.toHaveBeenCalled();
    });

    it('changes nothing when the vault is locked while it waits', async () => {
      const { deps, execute } = setup({ requestApproval: vi.fn(async (): Promise<ApprovalDecision> => 'locked') });
      expect((await execute(call('record_transaction'))).error).toMatch(/locked/);
      expect(deps.approveAction).not.toHaveBeenCalled();
    });

    it('is blocked in read-only mode before anything is proposed, and when read-only is switched on while waiting', async () => {
      const blocked = setup({ isReadOnly: () => true });
      expect((await blocked.execute(call('record_transaction'))).error).toMatch(/read-only/);
      expect(blocked.deps.createPendingAction).not.toHaveBeenCalled();
      let readOnly = false;
      const late = setup({ isReadOnly: () => readOnly, requestApproval: vi.fn(async (): Promise<ApprovalDecision> => { readOnly = true; return 'approved'; }) });
      expect((await late.execute(call('record_transaction'))).error).toMatch(/read-only/);
      expect(late.deps.approveAction).not.toHaveBeenCalled();
    });

    it('reports a change that the tool refused or that failed, never as made', async () => {
      const refused = setup({ approveAction: vi.fn(async () => proposal('failed', { error: 'Insufficient quantity' })) });
      expect(await refused.execute(call('record_transaction'))).toEqual({ ok: false, error: 'Insufficient quantity' });
      const thrown = setup({ approveAction: vi.fn(async () => { throw new Error('storage error'); }) });
      const outcome = await thrown.execute(call('record_transaction'));
      expect(outcome).toEqual({ ok: false, error: 'storage error' });
      expect(thrown.deps.onSettled).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    });
  });
});
