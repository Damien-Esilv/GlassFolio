import net from 'node:net';
import { DEFAULT_PORT, PORT_SCAN_LIMIT, SERVER_HOST } from './constants.mjs';

const isValidPort = (value) => Number.isInteger(value) && value >= 1024 && value <= 65_535;

/** True when nothing listens on `host:port` (we can bind it ourselves). */
export function isPortFree(port, host = SERVER_HOST) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, host);
  });
}

/**
 * Picks the port of the local server. The remembered port comes first (it keeps the origin, hence the
 * browser-only prefs, MCP client configs and passkey prefs, stable), then the default, then the next ones.
 * @param {{ remembered?: number | null, preferred?: number, limit?: number, isFree?: (port: number) => Promise<boolean> }} [options]
 * @returns {Promise<number | null>} null when every candidate is taken
 */
export async function choosePort({ remembered, preferred = DEFAULT_PORT, limit = PORT_SCAN_LIMIT, isFree = isPortFree } = {}) {
  const candidates = [];
  if (isValidPort(remembered)) candidates.push(remembered);
  for (let offset = 0; offset < limit; offset += 1) {
    const port = preferred + offset;
    if (isValidPort(port) && !candidates.includes(port)) candidates.push(port);
  }
  for (const port of candidates) {
    if (await isFree(port)) return port;
  }
  return null;
}
