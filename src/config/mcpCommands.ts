import { STANDALONE_BRIDGE_URL } from '../services/mcpBridge/mcpBridgeSettings';
import { MCP_TOKEN_HEADER_NAME } from './mcpClients';

export type McpCommandId = 'start' | 'token' | 'tools' | 'status' | 'rotate' | 'disable';
export type McpBridgeLocation = 'local' | 'online';

export interface McpCommandContext {
  /** The origin of the bridge, without /mcp */
  base: string;
  token: string;
}

export interface McpCommand {
  id: McpCommandId;
  /** Where it applies: a local server owns its bridge, GlassFolio online uses a bridge started by the user. */
  locations: readonly McpBridgeLocation[];
  lines: (context: McpCommandContext) => string[];
}

/** The commands to manage the bridge. Titles and explanations live in ai:mcpBridge.commands.items.<id>. */
export const MCP_COMMANDS: readonly McpCommand[] = [
  { id: 'start', locations: ['online'], lines: () => ['node mcp-server/index.mjs serve'] },
  { id: 'token', locations: ['online'], lines: () => ['node mcp-server/index.mjs token'] },
  { id: 'tools', locations: ['local', 'online'], lines: () => ['node mcp-server/index.mjs --list'] },
  { id: 'status', locations: ['local', 'online'], lines: ({ base, token }) => [`curl -s -H "${MCP_TOKEN_HEADER_NAME}: ${token}" ${base || STANDALONE_BRIDGE_URL}/mcp/bridge/status`] },
  { id: 'rotate', locations: ['online'], lines: () => ['rm ~/.glassfolio/mcp-token', 'node mcp-server/index.mjs token'] },
  { id: 'rotate', locations: ['local'], lines: () => ['rm glassfolio-data/mcp-token'] },
  { id: 'disable', locations: ['local'], lines: () => ['GLASSFOLIO_MCP_BRIDGE=off npm run dev'] },
];

export const commandsFor = (location: McpBridgeLocation): readonly McpCommand[] => MCP_COMMANDS.filter((command) => command.locations.includes(location));
