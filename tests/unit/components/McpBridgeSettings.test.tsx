import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { McpBridgeSettings } from '../../../src/components/settings/McpBridgeSettings';
import { MCP_CLIENTS } from '../../../src/config/mcpClients';
import { MCP_SETUP_PROMPT } from '../../../src/config/mcpSetupPrompt';
import { aiSettingsService } from '../../../src/services/ai/aiSettingsService';
import { appStorage } from '../../../src/services/storage/appStorage';
import * as deployment from '../../../src/config/deployment';
import { getMcpBridgeSettings } from '../../../src/services/mcpBridge/mcpBridgeSettings';
import { setMcpBridgeStatus } from '../../../src/services/mcpBridge/mcpBridgeStatus';
import '../../../src/i18n';

const writeText = vi.fn();

beforeEach(() => {
  appStorage.removeItem('gf_mcp_bridge');
  aiSettingsService.saveSettings({ executionMode: 'supervised' });
  setMcpBridgeStatus('off');
  Object.assign(navigator, { clipboard: { writeText } });
  writeText.mockReset();
  vi.spyOn(deployment, 'getDeploymentMode').mockReturnValue('cloud');
});
afterEach(() => vi.restoreAllMocks());

const toggle = (): HTMLElement => screen.getByRole('switch', { name: /Allow AI clients/i });
const enable = (): void => {
  render(<McpBridgeSettings />);
  fireEvent.click(toggle());
};

describe('<McpBridgeSettings /> online', () => {
  it('is off by default and shows nothing to set up', () => {
    render(<McpBridgeSettings />);
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('mcp-status').textContent).toBe('Off');
    expect(screen.queryByText('Let your AI set itself up')).toBeNull();
    expect(screen.queryByLabelText('Your AI client')).toBeNull();
  });

  it('shows the two things to paste, each with its own copy button', () => {
    enable();
    fireEvent.change(screen.getByLabelText('Bridge token'), { target: { value: 'secrettoken123' } });
    expect(screen.getByText('Address and token')).toBeTruthy();
    expect(screen.getByText('http://127.0.0.1:47831/mcp')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy the address' }));
    expect(writeText).toHaveBeenLastCalledWith('http://127.0.0.1:47831/mcp');
    fireEvent.click(screen.getByRole('button', { name: 'Copy the token' }));
    expect(writeText).toHaveBeenLastCalledWith('secrettoken123');
  });

  it('gives one universal prompt that is copied as it is', () => {
    enable();
    expect(screen.getByRole('heading', { name: 'Let your AI set itself up' })).toBeTruthy();
    expect(screen.getByText(/Configure and connect the GlassFolio MCP server to your AI client/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy the prompt' }));
    expect(writeText).toHaveBeenLastCalledWith(MCP_SETUP_PROMPT);
    expect(screen.getByRole('button', { name: 'Prompt copied' })).toBeTruthy();
  });

  it('lists the clients in a selector and shows only the chosen one', () => {
    enable();
    const select = screen.getByLabelText('Your AI client') as HTMLSelectElement;
    expect([...select.options].map((option) => option.text)).toEqual(MCP_CLIENTS.map((client) => client.name));
    expect(select.value).toBe(MCP_CLIENTS[0].id);
    // The first client is shown, none of the others
    expect(screen.getByText(/Where: Agent panel/)).toBeTruthy();
    expect(screen.queryByText(/claude mcp add/)).toBeNull();
    expect(screen.queryByText(/\.cursor\/mcp\.json/)).toBeNull();

    fireEvent.change(select, { target: { value: 'claude-code' } });
    expect(getMcpBridgeSettings().client).toBe('claude-code');
    expect(screen.getByText(/claude mcp add --transport http glassfolio http:\/\/127.0.0.1:47831\/mcp/)).toBeTruthy();
    expect(screen.queryByText(/Where: Agent panel/)).toBeNull();
    expect(screen.queryByText(/mcp_config\.json/)).toBeNull();
  });

  it('lets the user switch between the URL and the command of a client that has both', () => {
    enable();
    fireEvent.change(screen.getByLabelText('Your AI client'), { target: { value: 'cursor' } });
    const group = screen.getByRole('group', { name: 'Connection type' });
    expect(within(group).getByRole('button', { name: 'URL (HTTP)' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/"url": "http:\/\/127.0.0.1:47831\/mcp"/)).toBeTruthy();
    fireEvent.click(within(group).getByRole('button', { name: 'Command (stdio)' }));
    expect(screen.getByText(/"command": "node"/)).toBeTruthy();
    expect(screen.queryByText(/"url":/)).toBeNull();
    // A client with a single way to connect has no switch
    fireEvent.change(screen.getByLabelText('Your AI client'), { target: { value: 'codex' } });
    expect(screen.queryByRole('group', { name: 'Connection type' })).toBeNull();
  });

  it('hides the token inside the snippets until it is shown, and copies the real one', () => {
    enable();
    fireEvent.change(screen.getByLabelText('Bridge token'), { target: { value: 'secrettoken123' } });
    fireEvent.change(screen.getByLabelText('Your AI client'), { target: { value: 'claude-code' } });
    expect(screen.queryByText(/secrettoken123/)).toBeNull();
    expect(screen.getAllByText(/••••••••/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Copy: Claude Code/ }));
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('X-GlassFolio-Token: secrettoken123'));
    fireEvent.click(screen.getByRole('button', { name: 'Show the token' }));
    expect(screen.getAllByText(/secrettoken123/).length).toBeGreaterThan(0);
  });

  it('explains in a small "i" why the token is needed', () => {
    enable();
    expect(screen.queryByRole('note')).toBeNull();
    const info = screen.getByRole('button', { name: 'Why is the token needed?' });
    fireEvent.click(info);
    expect(info.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('note').textContent).toMatch(/shared secret/);
    expect(screen.getByRole('note').textContent).toMatch(/for your security/);
    fireEvent.click(info);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('keeps the commands to manage the bridge in view, each one copyable', () => {
    enable();
    expect(screen.getByRole('heading', { name: 'Commands to manage the bridge' })).toBeTruthy();
    ['Start the bridge', 'Show the token', 'List the tools', 'Check the connection', 'Revoke access (new token)'].forEach((title) => {
      expect(screen.getAllByText(title).length, title).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy: Show the token' }));
    expect(writeText).toHaveBeenLastCalledWith('node mcp-server/index.mjs token');
  });

  it('refuses an address that is not on this computer, and keeps a good one', () => {
    enable();
    const input = screen.getByLabelText('Bridge address');
    fireEvent.change(input, { target: { value: 'https://evil.example' } });
    expect(screen.getByText(/Use an address such as/)).toBeTruthy();
    expect(getMcpBridgeSettings().url).toBe('');
    fireEvent.change(input, { target: { value: 'http://localhost:5555' } });
    expect(getMcpBridgeSettings().url).toBe('http://localhost:5555');
    expect(screen.getByText('http://localhost:5555/mcp')).toBeTruthy();
  });

  it('shows the state of the connection', () => {
    render(<McpBridgeSettings />);
    act(() => setMcpBridgeStatus('connected'));
    expect(screen.getByTestId('mcp-status').textContent).toBe('Connected');
    act(() => setMcpBridgeStatus('unauthorized'));
    expect(screen.getByTestId('mcp-status').textContent).toBe('Token refused');
  });

  it('says so when AI clients may change the data without asking', () => {
    aiSettingsService.saveSettings({ executionMode: 'autonomous' });
    enable();
    expect(screen.getByText(/Autonomous mode is on: AI clients change your data without asking you/)).toBeTruthy();
  });
});

describe('<McpBridgeSettings /> on the server of the app', () => {
  it('shows the address of that server, with no field to fill and no bridge to start', () => {
    vi.spyOn(deployment, 'getDeploymentMode').mockReturnValue('local');
    enable();
    expect(screen.queryByLabelText('Bridge address')).toBeNull();
    expect(screen.queryByLabelText('Bridge token')).toBeNull();
    expect(screen.getByText(`${window.location.origin}/mcp`)).toBeTruthy();
    expect(screen.queryByText('Start the bridge on this computer')).toBeNull();
    expect(screen.getAllByText('Switch the bridge off on the server').length).toBeGreaterThan(0);
    expect(screen.queryByText('Start the bridge')).toBeNull();
  });
});
