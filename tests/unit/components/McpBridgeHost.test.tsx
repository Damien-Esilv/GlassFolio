import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PendingActionProposal } from '../../../src/services/ai/types';

const state = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  unlocked: true,
  listeners: new Set<(status: string) => void>(),
  clients: [] as Array<{ options: any; start: any; stop: any }>,
}));

vi.mock('../../../src/context/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../../../src/services/security/vaultService', () => ({
  vaultService: {
    isUnlocked: () => state.unlocked,
    subscribeStatus: (listener: (status: string) => void) => {
      state.listeners.add(listener);
      listener(state.unlocked ? 'unlocked' : 'locked');
      return () => state.listeners.delete(listener);
    },
  },
}));
vi.mock('../../../src/services/mcpBridge/mcpBridgeClient', () => ({
  McpBridgeClient: class {
    start = vi.fn();
    stop = vi.fn();
    constructor(public options: any) {
      state.clients.push(this as any);
    }
  },
}));

import { McpBridgeHost } from '../../../src/components/mcp/McpBridgeHost';
import { appStorage } from '../../../src/services/storage/appStorage';
import * as deployment from '../../../src/config/deployment';
import { getMcpBridgeSettings, saveMcpBridgeSettings } from '../../../src/services/mcpBridge/mcpBridgeSettings';
import { getMcpBridgeStatus } from '../../../src/services/mcpBridge/mcpBridgeStatus';
import { mcpApprovalStore } from '../../../src/services/mcpBridge/mcpApprovalStore';
import '../../../src/i18n';

const lockVault = (): void => {
  state.unlocked = false;
  act(() => state.listeners.forEach((listener) => listener('locked')));
};
const unlockVault = (): void => {
  state.unlocked = true;
  act(() => state.listeners.forEach((listener) => listener('unlocked')));
};

beforeEach(() => {
  appStorage.removeItem('gf_mcp_bridge');
  state.user = { id: 'u1' };
  state.unlocked = true;
  state.clients.length = 0;
  vi.spyOn(deployment, 'getDeploymentMode').mockReturnValue('cloud');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mcpApprovalStore.clear();
});

describe('<McpBridgeHost />', () => {
  it('connects nothing while AI clients are not allowed', () => {
    render(<McpBridgeHost />);
    expect(state.clients).toHaveLength(0);
    expect(getMcpBridgeStatus()).toBe('off');
  });

  it('connects to the standalone bridge with the token once allowed, signed in and unlocked', async () => {
    saveMcpBridgeSettings({ enabled: true, token: 'tok' });
    render(<McpBridgeHost />);
    await waitFor(() => expect(state.clients).toHaveLength(1));
    expect(state.clients[0].options).toMatchObject({ baseUrl: 'http://127.0.0.1:47831', token: 'tok' });
    expect(state.clients[0].start).toHaveBeenCalled();
  });

  it('disconnects when the vault is locked, and reconnects when it is unlocked again', async () => {
    saveMcpBridgeSettings({ enabled: true, token: 'tok' });
    render(<McpBridgeHost />);
    await waitFor(() => expect(state.clients).toHaveLength(1));
    lockVault();
    await waitFor(() => expect(state.clients[0].stop).toHaveBeenCalled());
    expect(getMcpBridgeStatus()).toBe('locked');
    unlockVault();
    await waitFor(() => expect(state.clients).toHaveLength(2));
  });

  it('does not connect without a signed-in user', () => {
    state.user = null;
    saveMcpBridgeSettings({ enabled: true, token: 'tok' });
    render(<McpBridgeHost />);
    expect(state.clients).toHaveLength(0);
    expect(getMcpBridgeStatus()).toBe('locked');
  });

  it('asks for the token when there is none to find', async () => {
    saveMcpBridgeSettings({ enabled: true });
    render(<McpBridgeHost />);
    await waitFor(() => expect(getMcpBridgeStatus()).toBe('needsToken'));
    expect(state.clients).toHaveLength(0);
  });

  it('takes the token from the server of the app in local mode', async () => {
    vi.spyOn(deployment, 'getDeploymentMode').mockReturnValue('local');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ token: 'servertoken' }) })));
    saveMcpBridgeSettings({ enabled: true });
    render(<McpBridgeHost />);
    await waitFor(() => expect(state.clients).toHaveLength(1));
    expect(state.clients[0].options).toMatchObject({ baseUrl: '', token: 'servertoken' });
    expect(getMcpBridgeSettings().token).toBe('servertoken');
  });

  it('says so when the server of the app has no bridge', async () => {
    vi.spyOn(deployment, 'getDeploymentMode').mockReturnValue('local');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    saveMcpBridgeSettings({ enabled: true });
    render(<McpBridgeHost />);
    await waitFor(() => expect(getMcpBridgeStatus()).toBe('unreachable'));
  });

  it('stops the client when it unmounts', async () => {
    saveMcpBridgeSettings({ enabled: true, token: 'tok' });
    const { unmount } = render(<McpBridgeHost />);
    await waitFor(() => expect(state.clients).toHaveLength(1));
    unmount();
    expect(state.clients[0].stop).toHaveBeenCalled();
  });

  it('shows a change asked by an AI client and lets the user approve it', async () => {
    const proposal: PendingActionProposal = { id: 'a1', toolName: 'record_transaction', type: 'record_transaction', params: {}, previewData: { symbol: 'AAPL' }, status: 'pending', createdAt: '2026-10-31T10:00:00.000Z' };
    render(<McpBridgeHost />);
    let decision!: Promise<string>;
    act(() => {
      decision = mcpApprovalStore.request(proposal);
    });
    expect(await screen.findByText('An AI client asks to change your data')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Approve & Execute/ }));
    expect(await decision).toBe('approved');
  });

  it('lets the user decline it', async () => {
    const proposal: PendingActionProposal = { id: 'a2', toolName: 'create_goal', type: 'create_goal', params: {}, previewData: {}, status: 'pending', createdAt: '2026-10-31T10:00:00.000Z' };
    render(<McpBridgeHost />);
    let decision!: Promise<string>;
    act(() => {
      decision = mcpApprovalStore.request(proposal);
    });
    fireEvent.click(await screen.findByRole('button', { name: /Decline/ }));
    expect(await decision).toBe('rejected');
  });
});
