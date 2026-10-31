import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { McpBridgeSettings } from '../../../src/components/settings/McpBridgeSettings';
import { appStorage } from '../../../src/services/storage/appStorage';
import * as deployment from '../../../src/config/deployment';
import { getMcpBridgeSettings } from '../../../src/services/mcpBridge/mcpBridgeSettings';
import { setMcpBridgeStatus } from '../../../src/services/mcpBridge/mcpBridgeStatus';
import '../../../src/i18n';

const writeText = vi.fn();

beforeEach(() => {
  appStorage.removeItem('gf_mcp_bridge');
  setMcpBridgeStatus('off');
  Object.assign(navigator, { clipboard: { writeText } });
  writeText.mockReset();
  vi.spyOn(deployment, 'getDeploymentMode').mockReturnValue('cloud');
});
afterEach(() => vi.restoreAllMocks());

const toggle = (): HTMLElement => screen.getByRole('switch', { name: /Allow AI clients/i });

describe('<McpBridgeSettings /> online', () => {
  it('is off by default and shows nothing to connect', () => {
    render(<McpBridgeSettings />);
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('mcp-status').textContent).toBe('Off');
    expect(screen.queryByText(/claude mcp add/)).toBeNull();
  });

  it('turns on, asks for the bridge address and token, and prepares the snippets', () => {
    render(<McpBridgeSettings />);
    fireEvent.click(toggle());
    expect(getMcpBridgeSettings().enabled).toBe(true);
    expect((screen.getByLabelText('Bridge address') as HTMLInputElement).placeholder).toBe('http://127.0.0.1:47831');
    expect(screen.getByText(/node mcp-server\/index.mjs serve/)).toBeTruthy();
    expect(screen.getByText(/claude mcp add --transport http glassfolio http:\/\/127.0.0.1:47831\/mcp/)).toBeTruthy();
  });

  it('refuses an address that is not on this computer, and keeps a good one', () => {
    render(<McpBridgeSettings />);
    fireEvent.click(toggle());
    const input = screen.getByLabelText('Bridge address');
    fireEvent.change(input, { target: { value: 'https://evil.example' } });
    expect(screen.getByText(/Use an address such as/)).toBeTruthy();
    expect(getMcpBridgeSettings().url).toBe('');
    fireEvent.change(input, { target: { value: 'http://localhost:5555' } });
    expect(getMcpBridgeSettings().url).toBe('http://localhost:5555');
    expect(screen.getAllByText(/http:\/\/localhost:5555\/mcp/).length).toBeGreaterThan(0);
  });

  it('hides the token on screen, copies the real one, and shows it on request', () => {
    render(<McpBridgeSettings />);
    fireEvent.click(toggle());
    fireEvent.change(screen.getByLabelText('Bridge token'), { target: { value: 'secrettoken123' } });
    expect(getMcpBridgeSettings().token).toBe('secrettoken123');
    expect(screen.queryByText(/secrettoken123/)).toBeNull();
    expect(screen.getAllByText(/••••••••/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: /Copy/ })[0]);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('X-GlassFolio-Token: secrettoken123'));
    fireEvent.click(screen.getByRole('button', { name: /Show the token/ }));
    expect(screen.getAllByText(/secrettoken123/).length).toBeGreaterThan(0);
  });

  it('shows the state of the connection', () => {
    render(<McpBridgeSettings />);
    act(() => setMcpBridgeStatus('connected'));
    expect(screen.getByTestId('mcp-status').textContent).toBe('Connected');
    act(() => setMcpBridgeStatus('unauthorized'));
    expect(screen.getByTestId('mcp-status').textContent).toBe('Token refused');
  });
});

describe('<McpBridgeSettings /> on the server of the app', () => {
  it('shows the address of that server and no field to fill', () => {
    vi.spyOn(deployment, 'getDeploymentMode').mockReturnValue('local');
    render(<McpBridgeSettings />);
    fireEvent.click(toggle());
    expect(screen.queryByLabelText('Bridge address')).toBeNull();
    expect(screen.queryByLabelText('Bridge token')).toBeNull();
    expect(screen.getByText(`${window.location.origin}/mcp`)).toBeTruthy();
  });
});
