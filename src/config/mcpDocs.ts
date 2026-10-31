/**
 * Data behind the MCP documentation page (/docs). The tool list is read from mcp-server/tools.json, the
 * catalog that the MCP bridge serves and that tests/unit/mcp/catalog.test.ts keeps equal to the tools of
 * the app, so the page cannot drift from what an AI client sees. Texts live in locales/{en,fr}/docs.json.
 */
import catalog from '../../mcp-server/tools.json';
import { GITHUB_REPO_URL } from './project';
import { STANDALONE_BRIDGE_URL } from '../services/mcpBridge/mcpBridgeSettings';

export interface McpToolDoc {
  name: string;
  description: string;
  /** The tool changes data: it waits for the user's approval in the app. */
  needsApproval: boolean;
}

export const MCP_TOOLS: readonly McpToolDoc[] = catalog.tools.map((tool) => ({
  name: tool.name,
  description: tool.description,
  needsApproval: !tool.annotations.readOnlyHint,
}));

export const MCP_TOOL_NAMES: readonly string[] = MCP_TOOLS.map((tool) => tool.name);

/** Where the standalone bridge listens, and where the server of a local GlassFolio exposes its own. */
export const MCP_STANDALONE_ENDPOINT = `${STANDALONE_BRIDGE_URL}/mcp`;

export const MCP_CHECK_COMMANDS: readonly string[] = [
  `git clone ${GITHUB_REPO_URL}.git`,
  'cd GlassFolio',
  'node mcp-server/index.mjs --list',
];
