import { appStorage } from '../storage/appStorage';
import { MCP_BRIDGE_STORAGE_KEY } from '../storage/storageKeys';
import { getDeploymentMode } from '../../config/deployment';

/**
 * Device settings of the MCP bridge (TGLA-198): whether AI clients (Claude Code, Codex, Cursor...) may call
 * GlassFolio's tools through the open tab, and where the bridge listens. Stored on this device only.
 */
export interface McpBridgeSettings {
  enabled: boolean;
  /** Address of a bridge on this computer; '' means the server that serves the app (local mode). */
  url: string;
  token: string;
}

/** Where the standalone bridge (`glassfolio-mcp serve`) listens by default. */
export const STANDALONE_BRIDGE_URL = 'http://127.0.0.1:47831';
export const MCP_TOKEN_HEADER = 'X-GlassFolio-Token';

const DEFAULTS: McpBridgeSettings = { enabled: false, url: '', token: '' };
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedValue: McpBridgeSettings = DEFAULTS;

/**
 * A bridge address is the origin of a program on this computer: nothing else is accepted, so that a pasted
 * address can never send the decrypted data to another machine. '' stands for "the server of the app".
 * @returns the origin, '' for an empty input, or null when the address is not acceptable
 */
export function normalizeBridgeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return (url.protocol === 'http:' || url.protocol === 'https:') && local ? url.origin : null;
  } catch {
    return null;
  }
}

function parse(raw: string | null): McpBridgeSettings {
  if (!raw) return DEFAULTS;
  try {
    const value = JSON.parse(raw) as Partial<McpBridgeSettings>;
    return {
      enabled: value.enabled === true,
      url: typeof value.url === 'string' ? (normalizeBridgeUrl(value.url) ?? '') : '',
      token: typeof value.token === 'string' ? value.token : '',
    };
  } catch {
    return DEFAULTS;
  }
}

export function getMcpBridgeSettings(): McpBridgeSettings {
  const raw = appStorage.getItem(MCP_BRIDGE_STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parse(raw);
  }
  return cachedValue;
}

export function saveMcpBridgeSettings(patch: Partial<McpBridgeSettings>): McpBridgeSettings {
  const current = getMcpBridgeSettings();
  const url = patch.url === undefined ? current.url : (normalizeBridgeUrl(patch.url) ?? current.url);
  const next: McpBridgeSettings = { ...current, ...patch, url, token: (patch.token ?? current.token).trim() };
  appStorage.setItem(MCP_BRIDGE_STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
  return getMcpBridgeSettings();
}

export function subscribeMcpBridgeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Base URL the tab connects to: the bridge the user entered, else the app's own server (local mode), else the standalone bridge. */
export const resolveBridgeBaseUrl = (settings: McpBridgeSettings): string =>
  settings.url || (getDeploymentMode() === 'local' ? '' : STANDALONE_BRIDGE_URL);

/** The server of the app brings its own bridge and hands its token to the page of the same origin. */
export async function fetchOwnServerToken(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetchImpl('/mcp/bridge/config', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) return null;
    const body = (await response.json()) as { token?: unknown };
    return typeof body.token === 'string' && body.token ? body.token : null;
  } catch {
    return null;
  }
}
