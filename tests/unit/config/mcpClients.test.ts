import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MCP_CLIENT_ID,
  MCP_CLIENTS,
  MCP_ENTRY_PLACEHOLDER,
  getMcpClient,
  pickSnippet,
  renderSnippet,
  type McpClient,
} from '../../../src/config/mcpClients';

const values = { endpoint: 'http://127.0.0.1:3000/mcp', token: 'tok123', ownServer: true };
const standalone = { ...values, ownServer: false };

describe('the AI client catalog (mcpClients.json)', () => {
  it('has the clients the project documents, each with a name, a place and snippets', () => {
    expect(MCP_CLIENTS.map((client) => client.id)).toEqual(expect.arrayContaining(['antigravity', 'cursor', 'claude-code', 'claude-desktop', 'codex']));
    expect(new Set(MCP_CLIENTS.map((client) => client.id)).size).toBe(MCP_CLIENTS.length);
    MCP_CLIENTS.forEach((client) => {
      expect(client.id, client.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(client.name.length).toBeGreaterThan(1);
      expect(client.where.length).toBeGreaterThan(3);
      expect(client.snippets.length).toBeGreaterThan(0);
      expect(new Set(client.snippets.map((snippet) => snippet.transport)).size, `${client.id} transports`).toBe(client.snippets.length);
    });
  });

  it('wires every snippet to the bridge with the right placeholders', () => {
    MCP_CLIENTS.forEach((client) =>
      client.snippets.forEach((snippet) => {
        const label = `${client.id} ${snippet.transport}`;
        expect(['http', 'stdio']).toContain(snippet.transport);
        expect(['command', 'json', 'toml']).toContain(snippet.format);
        if (snippet.transport === 'http') {
          expect(snippet.template, label).toContain('{{endpoint}}');
          expect(snippet.template, label).toContain('{{token}}');
        } else {
          expect(snippet.template, label).toContain('{{entry}}');
          // A command that reaches the bridge of the server needs its address and its token
          if (snippet.templateOwnServer) {
            ['{{endpoint}}', '{{token}}', '{{entry}}'].forEach((placeholder) => expect(snippet.templateOwnServer, label).toContain(placeholder));
          }
        }
      })
    );
  });

  it('renders valid files, with nothing left to fill in', () => {
    MCP_CLIENTS.forEach((client) =>
      client.snippets.forEach((snippet) =>
        [values, standalone].forEach((input) => {
          const text = renderSnippet(snippet, input);
          expect(text, `${client.id} ${snippet.transport}`).not.toMatch(/\{\{\w+\}\}/);
          if (snippet.format === 'json') {
            const server = JSON.parse(text).mcpServers.glassfolio;
            if (snippet.transport === 'http') {
              expect(server.url).toBe(input.endpoint);
              expect(server.headers['X-GlassFolio-Token']).toBe(input.token);
            } else {
              expect(server).toMatchObject({ command: 'node', args: [MCP_ENTRY_PLACEHOLDER] });
              // The bridge of the server is reached through the environment; a standalone one hosts itself
              expect(Boolean(server.env)).toBe(input.ownServer);
              if (input.ownServer) expect(server.env).toEqual({ GLASSFOLIO_MCP_URL: input.endpoint, GLASSFOLIO_MCP_TOKEN: input.token });
            }
          }
          if (snippet.format === 'toml') expect(text.split('\n')[0]).toBe('[mcp_servers.glassfolio]');
          if (snippet.format === 'command') expect(text).toMatch(/^claude mcp add /);
        })
      )
    );
  });

  it('gives Claude Code the exact command, and Cursor both a URL and a command', () => {
    const claude = getMcpClient('claude-code');
    expect(renderSnippet(pickSnippet(claude, 'http'), values)).toBe('claude mcp add --transport http glassfolio http://127.0.0.1:3000/mcp --header "X-GlassFolio-Token: tok123"');
    expect(getMcpClient('cursor').snippets.map((snippet) => snippet.transport)).toEqual(['http', 'stdio']);
  });

  it('falls back to the first client for an unknown id, and to the first snippet for a missing transport', () => {
    expect(getMcpClient('nope').id).toBe(DEFAULT_MCP_CLIENT_ID);
    expect(getMcpClient(undefined).id).toBe(MCP_CLIENTS[0].id);
    const antigravity = getMcpClient('antigravity');
    expect(pickSnippet(antigravity, 'http')).toBe(antigravity.snippets[0]);
  });

  it('takes a new client without any code: an entry of the file is enough', () => {
    const added: McpClient = {
      id: 'my-client',
      name: 'My client',
      where: '~/.my-client/mcp.json',
      snippets: [{ transport: 'http', format: 'json', template: '{ "servers": { "glassfolio": { "url": "{{endpoint}}", "token": "{{token}}" } } }' }],
    };
    expect(JSON.parse(renderSnippet(added.snippets[0], values)).servers.glassfolio).toEqual({ url: values.endpoint, token: values.token });
  });
});
