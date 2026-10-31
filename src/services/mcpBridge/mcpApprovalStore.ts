import type { PendingActionProposal } from '../ai/types';

export type ApprovalDecision = 'approved' | 'rejected' | 'expired' | 'locked';

/** How long a change waits for the user: a little less than the bridge waits for the tab (120 s). */
export const APPROVAL_TIMEOUT_MS = 100_000;
/** How long a settled card stays visible. */
export const SETTLED_VISIBLE_MS = 4000;

interface Entry {
  proposal: PendingActionProposal;
  resolve: (decision: ApprovalDecision) => void;
  timer: ReturnType<typeof setTimeout>;
  decided: boolean;
}

/**
 * Changes asked by an AI client wait here for the user's approval (human in the loop): the cards of
 * McpBridgeHost read this store, and the executor awaits the decision.
 */
export class McpApprovalStore {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private snapshot: readonly PendingActionProposal[] = [];

  getSnapshot = (): readonly PendingActionProposal[] => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(): void {
    this.snapshot = [...this.entries.values()].map((entry) => entry.proposal);
    this.listeners.forEach((listener) => listener());
  }

  request(proposal: PendingActionProposal, timeoutMs: number = APPROVAL_TIMEOUT_MS): Promise<ApprovalDecision> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.settle(proposal.id, 'expired'), timeoutMs);
      this.entries.set(proposal.id, { proposal: { ...proposal }, resolve, timer, decided: false });
      this.publish();
    });
  }

  /** The user's answer from a card. */
  decide(id: string, decision: 'approved' | 'rejected'): void {
    this.settle(id, decision);
  }

  private settle(id: string, decision: ApprovalDecision): void {
    const entry = this.entries.get(id);
    if (!entry || entry.decided) return;
    entry.decided = true;
    clearTimeout(entry.timer);
    if (decision !== 'approved') entry.proposal = { ...entry.proposal, status: decision === 'rejected' ? 'rejected' : 'failed', error: decision === 'rejected' ? undefined : decision };
    this.publish();
    entry.resolve(decision);
    if (decision !== 'approved') this.dismissLater(id);
  }

  /** Shows the outcome of an approved change, then removes the card. */
  update(proposal: PendingActionProposal): void {
    const entry = this.entries.get(proposal.id);
    if (!entry) return;
    entry.proposal = { ...proposal };
    this.publish();
    this.dismissLater(proposal.id);
  }

  private dismissLater(id: string): void {
    setTimeout(() => this.dismiss(id), SETTLED_VISIBLE_MS);
  }

  dismiss(id: string): void {
    if (this.entries.delete(id)) this.publish();
  }

  /** Forgets every card and timer (sign-out, tests). Waiting requests are refused first. */
  clear(): void {
    this.rejectAll('locked');
    for (const entry of this.entries.values()) clearTimeout(entry.timer);
    this.entries.clear();
    this.publish();
  }

  /** The vault was locked or the bridge stopped: nothing waits any longer. */
  rejectAll(decision: 'locked' | 'expired' = 'locked'): void {
    for (const id of [...this.entries.keys()]) {
      const entry = this.entries.get(id);
      if (entry?.decided) continue;
      this.settle(id, decision);
    }
  }
}

export const mcpApprovalStore = new McpApprovalStore();
