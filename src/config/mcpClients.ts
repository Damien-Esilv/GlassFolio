/**
 * AI clients that can be connected to the MCP bridge (TGLA-199). The list lives in mcpClients.json, so adding a
 * client is a data change: tests/unit/config/mcpClients.test.ts checks every entry. The Settings tab shows one
 * client at a time, and the documentation page renders the same snippets.
 */
import clientsFile from './mcpClients.json';

export const MCP_TOKEN_HEADER_NAME = 'X-GlassFolio-Token';
/** The entry point of a copy of the repository: the user replaces the folder. */
export const MCP_ENTRY_PLACEHOLDER = '/absolute/path/to/GlassFolio/mcp-server/index.mjs';

export type McpTransport = 'http' | 'stdio';
export type McpSnippetFormat = 'command' | 'json' | 'toml';

export interface McpClientSnippet {
  transport: McpTransport;
  format: McpSnippetFormat;
  template: string;
  /** Used instead of `template` when the bridge belongs to the server of the app (local mode). */
  templateOwnServer?: string;
}

export interface McpClient {
  id: string;
  name: string;
  where: string;
  snippets: readonly McpClientSnippet[];
}

export const MCP_CLIENTS: readonly McpClient[] = clientsFile.clients as McpClient[];
export const DEFAULT_MCP_CLIENT_ID: string = MCP_CLIENTS[0].id;

export const getMcpClient = (id: string | undefined): McpClient => MCP_CLIENTS.find((client) => client.id === id) ?? MCP_CLIENTS[0];

export interface SnippetValues {
  /** The MCP endpoint, for example http://127.0.0.1:47831/mcp */
  endpoint: string;
  token: string;
  /** The bridge belongs to the server that serves the app, not to a program started by the client. */
  ownServer: boolean;
}

export function renderSnippet(snippet: McpClientSnippet, { endpoint, token, ownServer }: SnippetValues): string {
  const template = ownServer && snippet.templateOwnServer ? snippet.templateOwnServer : snippet.template;
  return template.split('{{endpoint}}').join(endpoint).split('{{token}}').join(token).split('{{entry}}').join(MCP_ENTRY_PLACEHOLDER);
}

/** The first snippet of a transport, or the first one the client has. */
export const pickSnippet = (client: McpClient, transport: McpTransport | undefined): McpClientSnippet =>
  client.snippets.find((snippet) => snippet.transport === transport) ?? client.snippets[0];

/** Commands to run in a terminal, from the folder of a copy of the repository. */
export const MCP_SERVE_COMMANDS: readonly string[] = ['node mcp-server/index.mjs serve', 'node mcp-server/index.mjs token'];
