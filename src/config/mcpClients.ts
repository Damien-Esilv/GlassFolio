/**
 * How to connect an AI client to the MCP bridge (TGLA-198). Pure builders: the Settings tab shows their
 * output, and tests/unit/config/mcpClients.test.ts checks the shapes. The client reaches the bridge
 * either by URL (Streamable HTTP) or by starting `mcp-server/index.mjs` (stdio).
 */
export const MCP_TOKEN_HEADER_NAME = 'X-GlassFolio-Token';
/** The entry point of a copy of the repository: the user replaces the folder. */
export const MCP_ENTRY_PLACEHOLDER = '/absolute/path/to/GlassFolio/mcp-server/index.mjs';
export const MCP_SERVE_COMMANDS: readonly string[] = ['node mcp-server/index.mjs serve', 'node mcp-server/index.mjs token'];

export interface ClientSnippetInput {
  /** The MCP endpoint, for example http://127.0.0.1:47831/mcp */
  endpoint: string;
  token: string;
  /** The bridge belongs to the server that serves the app, not to a program started by the client. */
  ownServer: boolean;
}

export interface ClientSnippets {
  claudeCode: string;
  urlJson: string;
  stdioJson: string;
  codex: string;
}

export function buildClientSnippets({ endpoint, token, ownServer }: ClientSnippetInput): ClientSnippets {
  // A client that starts the command needs the address of a server bridge; a standalone one hosts its own
  const env = ownServer ? { GLASSFOLIO_MCP_URL: endpoint, GLASSFOLIO_MCP_TOKEN: token } : undefined;
  return {
    claudeCode: `claude mcp add --transport http glassfolio ${endpoint} --header "${MCP_TOKEN_HEADER_NAME}: ${token}"`,
    urlJson: JSON.stringify({ mcpServers: { glassfolio: { url: endpoint, headers: { [MCP_TOKEN_HEADER_NAME]: token } } } }, null, 2),
    stdioJson: JSON.stringify({ mcpServers: { glassfolio: { command: 'node', args: [MCP_ENTRY_PLACEHOLDER], ...(env ? { env } : {}) } } }, null, 2),
    codex: [
      '[mcp_servers.glassfolio]',
      'command = "node"',
      `args = ["${MCP_ENTRY_PLACEHOLDER}"]`,
      ...(env ? [`env = { GLASSFOLIO_MCP_URL = "${endpoint}", GLASSFOLIO_MCP_TOKEN = "${token}" }`] : []),
    ].join('\n'),
  };
}
