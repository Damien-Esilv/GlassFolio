import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpApprovalStore, SETTLED_VISIBLE_MS } from '../../../../src/services/mcpBridge/mcpApprovalStore';
import type { PendingActionProposal } from '../../../../src/services/ai/types';

const proposal = (id = 'a1'): PendingActionProposal => ({ id, toolName: 'record_transaction', type: 'record_transaction', params: {}, previewData: {}, status: 'pending', createdAt: '2026-10-31T10:00:00.000Z' });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('changes waiting for the approval of the user', () => {
  it('shows a request and tells the listeners', () => {
    const store = new McpApprovalStore();
    const listener = vi.fn();
    store.subscribe(listener);
    void store.request(proposal());
    expect(store.getSnapshot().map((p) => p.id)).toEqual(['a1']);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('resolves "approved" and keeps the card until the outcome is shown, then removes it', async () => {
    const store = new McpApprovalStore();
    const decision = store.request(proposal());
    store.decide('a1', 'approved');
    expect(await decision).toBe('approved');
    expect(store.getSnapshot()).toHaveLength(1);
    store.update({ ...proposal(), status: 'executed' });
    expect(store.getSnapshot()[0].status).toBe('executed');
    vi.advanceTimersByTime(SETTLED_VISIBLE_MS + 10);
    expect(store.getSnapshot()).toHaveLength(0);
  });

  it('resolves "rejected", marks the card, then removes it', async () => {
    const store = new McpApprovalStore();
    const decision = store.request(proposal());
    store.decide('a1', 'rejected');
    expect(await decision).toBe('rejected');
    expect(store.getSnapshot()[0].status).toBe('rejected');
    vi.advanceTimersByTime(SETTLED_VISIBLE_MS + 10);
    expect(store.getSnapshot()).toHaveLength(0);
  });

  it('expires when the user does not answer', async () => {
    const store = new McpApprovalStore();
    const decision = store.request(proposal(), 1000);
    vi.advanceTimersByTime(1001);
    expect(await decision).toBe('expired');
    expect(store.getSnapshot()[0].status).toBe('failed');
  });

  it('refuses everything that waits when the vault is locked', async () => {
    const store = new McpApprovalStore();
    const first = store.request(proposal('a1'));
    const second = store.request(proposal('a2'));
    store.rejectAll('locked');
    expect(await Promise.all([first, second])).toEqual(['locked', 'locked']);
  });

  it('keeps the first answer, and ignores an answer to an unknown request', async () => {
    const store = new McpApprovalStore();
    const decision = store.request(proposal());
    store.decide('a1', 'rejected');
    store.decide('a1', 'approved');
    store.decide('nope', 'approved');
    expect(await decision).toBe('rejected');
    expect(store.getSnapshot()[0].status).toBe('rejected');
  });
});

describe('clearing the store', () => {
  it('refuses what waits and removes every card', async () => {
    const store = new McpApprovalStore();
    const waiting = store.request(proposal());
    store.clear();
    expect(await waiting).toBe('locked');
    expect(store.getSnapshot()).toHaveLength(0);
  });
});
