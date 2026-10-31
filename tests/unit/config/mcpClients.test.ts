import { describe, it, expect } from 'vitest';
import { MCP_ENTRY_PLACEHOLDER, buildClientSnippets } from '../../../src/config/mcpClients';

const endpoint = 'http://127.0.0.1:3000/mcp';

describe('AI client snippets', () => {
  it('builds the Claude Code command with the endpoint and the token header', () => {
    const { claudeCode } = buildClientSnippets({ endpoint, token: 'tok123', ownServer: true });
    expect(claudeCode).toBe(`claude mcp add --transport http glassfolio ${endpoint} --header "X-GlassFolio-Token: tok123"`);
  });

  it('builds a URL configuration with the token as a header', () => {
    const json = JSON.parse(buildClientSnippets({ endpoint, token: 'tok123', ownServer: true }).urlJson);
    expect(json.mcpServers.glassfolio).toEqual({ url: endpoint, headers: { 'X-GlassFolio-Token': 'tok123' } });
  });

  it('points a command-based client at the server bridge only when the server owns it', () => {
    const own = JSON.parse(buildClientSnippets({ endpoint, token: 't', ownServer: true }).stdioJson).mcpServers.glassfolio;
    expect(own).toMatchObject({ command: 'node', args: [MCP_ENTRY_PLACEHOLDER], env: { GLASSFOLIO_MCP_URL: endpoint, GLASSFOLIO_MCP_TOKEN: 't' } });
    const standalone = JSON.parse(buildClientSnippets({ endpoint, token: 't', ownServer: false }).stdioJson).mcpServers.glassfolio;
    expect(standalone.env).toBeUndefined();
    expect(standalone.args).toEqual([MCP_ENTRY_PLACEHOLDER]);
  });

  it('builds a Codex TOML table', () => {
    const own = buildClientSnippets({ endpoint, token: 't', ownServer: true }).codex.split('\n');
    expect(own[0]).toBe('[mcp_servers.glassfolio]');
    expect(own).toContain('command = "node"');
    expect(own.some((line) => line.startsWith('env = { GLASSFOLIO_MCP_URL'))).toBe(true);
    expect(buildClientSnippets({ endpoint, token: 't', ownServer: false }).codex).not.toContain('env =');
  });
});
