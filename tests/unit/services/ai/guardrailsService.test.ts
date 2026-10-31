import { describe, it, expect, beforeEach } from 'vitest';
import { guardrailsService } from '../../../../src/services/ai/guardrailsService';
import { aiToolRegistry } from '../../../../src/services/ai/aiToolRegistry';

describe('guardrailsService', () => {
  beforeEach(() => {
    guardrailsService.clear();
    aiToolRegistry.clear();
  });

  it('creates a pending action proposal with status "pending"', () => {
    const proposal = guardrailsService.createPendingAction(
      'record_transaction',
      'record_transaction',
      { amount: 10, symbol: 'AAPL' },
      { amount: 10, symbol: 'AAPL' }
    );

    expect(proposal.id).toBeDefined();
    expect(proposal.status).toBe('pending');
    expect(proposal.toolName).toBe('record_transaction');
    expect(guardrailsService.getPendingAction(proposal.id)).toEqual(proposal);
  });

  it('approves and executes a pending action when confirmed by user', async () => {
    let executedParams: unknown = null;

    aiToolRegistry.registerTool({
      name: 'record_transaction',
      description: 'Records a txn',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: true,
      execute: async (params) => {
        executedParams = params;
        return { success: true, id: 'tx-123' };
      },
    });

    const proposal = guardrailsService.createPendingAction(
      'record_transaction',
      'record_transaction',
      { amount: 5, symbol: 'BTC' },
      { amount: 5, symbol: 'BTC' }
    );

    const executed = await guardrailsService.approveAction(proposal.id);

    expect(executed.status).toBe('executed');
    expect(executed.result).toEqual({ success: true, id: 'tx-123' });
    expect(executedParams).toEqual({ amount: 5, symbol: 'BTC' });
  });

  it('rejects an action without executing the tool', () => {
    const proposal = guardrailsService.createPendingAction(
      'record_transaction',
      'record_transaction',
      { amount: 5, symbol: 'BTC' },
      {}
    );

    const rejected = guardrailsService.rejectAction(proposal.id);
    expect(rejected.status).toBe('rejected');
  });

  it('prevents approving an already approved or rejected action', async () => {
    aiToolRegistry.registerTool({
      name: 'dummy',
      description: 'dummy',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ ok: true }),
    });

    const proposal = guardrailsService.createPendingAction('dummy', 'dummy', {}, {});
    await guardrailsService.approveAction(proposal.id);

    await expect(guardrailsService.approveAction(proposal.id)).rejects.toThrow(
      `Action '${proposal.id}' is already executed`
    );
  });

  it('redacts and blocks OpenAI, Gemini, AWS, Groq, and CoinGecko API keys', () => {
    const groqKey = `gsk_${'a'.repeat(24)}`;
    const coinGeckoKey = `CG-${'b'.repeat(24)}`;
    const awsKey = `AKIA${'C'.repeat(16)}`;

    expect(guardrailsService.redactSensitiveExfiltrations(`Key: ${groqKey}`)).toBe('Key: [REDACTED_API_KEY]');
    expect(guardrailsService.redactSensitiveExfiltrations(`Key: ${coinGeckoKey}`)).toBe('Key: [REDACTED_API_KEY]');
    expect(guardrailsService.redactSensitiveExfiltrations(`Key: ${awsKey}`)).toBe('Key: [REDACTED_API_KEY]');

    expect(() => guardrailsService.assertSafeContext(groqKey)).toThrow(/API key exfiltration/i);
    expect(() => guardrailsService.assertSafeContext(coinGeckoKey)).toThrow(/API key exfiltration/i);
    expect(() => guardrailsService.assertSafeContext(awsKey)).toThrow(/API key exfiltration/i);
  });
});
