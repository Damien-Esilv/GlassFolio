/** Pre-flight rules for `npm run docker:up` (Epic E31). */

import { evaluateNetworkExposure } from '../../server/networkExposure.mjs';

export { evaluateNetworkExposure };

/** Parses simple KEY=VALUE lines (comments and blank lines ignored). */
export function parseEnvFile(text) {
  const values = {};
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !line.trim().startsWith('#')) values[match[1]] = match[2];
  }
  return values;
}
