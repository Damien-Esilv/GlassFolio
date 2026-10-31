/**
 * Wires the MCP bridge (mcp-server/bridge.mjs) into the local servers (Docker image and `npm run dev`).
 *
 * The bridge lets an MCP client (Claude Code, Codex, Cursor, Antigravity...) call the tools of the GlassFolio
 * tab that is open and unlocked: the tools run in the browser, on the decrypted data, so this server never
 * reads the vault. The tab gets the shared token from the same origin; the client gets it from Settings.
 * `GLASSFOLIO_MCP_BRIDGE=off` removes the endpoints.
 */

import { readFileSync } from 'node:fs';
import { createMcpBridge, loadOrCreateToken } from '../mcp-server/bridge.mjs';

const readPackageFile = (name) => JSON.parse(readFileSync(new URL(`../mcp-server/${name}`, import.meta.url), 'utf8'));

/** @returns the bridge, or null when it is switched off or cannot start (the server runs without it) */
export function createLocalMcpBridge({ dataDir, headers = {}, allowedHosts = [] }) {
  if ((process.env.GLASSFOLIO_MCP_BRIDGE || '').trim().toLowerCase() === 'off') return null;
  try {
    return createMcpBridge({
      token: loadOrCreateToken(dataDir),
      tools: readPackageFile('tools.json').tools,
      version: readPackageFile('package.json').version,
      allowedHosts,
      headers,
      sameOriginConfig: true,
    });
  } catch (error) {
    console.warn(`[mcp-bridge] disabled: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
