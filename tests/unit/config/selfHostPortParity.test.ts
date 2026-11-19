import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MCP_BRIDGE_DEFAULT_PORT,
  SELF_HOST_DEFAULT_PORT,
  SELF_HOST_DEFAULT_URL,
  STANDALONE_BRIDGE_DEFAULT_URL,
} from '../../../src/config/project';
import { DEFAULT_GLASSFOLIO_PORT } from '../../../scripts/lib/dockerReady.mjs';
import { DEFAULT_APP_PORT, DEFAULT_PORT as MCP_SERVER_DEFAULT_PORT } from '../../../mcp-server/bridge.mjs';

const readRepoFile = (relPath: string): string =>
  readFileSync(join(process.cwd(), relPath), 'utf8');

describe('Self-hosted & MCP port single-source-of-truth parity (TGLA-217)', () => {
  it('keeps the GlassFolio default port (3780) consistent across config, Docker, Vite and docs', () => {
    expect(SELF_HOST_DEFAULT_PORT).toBe('3780');
    expect(SELF_HOST_DEFAULT_URL).toBe(`http://localhost:${SELF_HOST_DEFAULT_PORT}`);
    expect(DEFAULT_GLASSFOLIO_PORT).toBe(SELF_HOST_DEFAULT_PORT);
    expect(String(DEFAULT_APP_PORT)).toBe(SELF_HOST_DEFAULT_PORT);

    const dockerEnv = readRepoFile('docker/docker.env');
    expect(dockerEnv).toContain(`GLASSFOLIO_PORT=${SELF_HOST_DEFAULT_PORT}`);

    const dockerCompose = readRepoFile('docker-compose.yml');
    expect(dockerCompose).toContain(`GLASSFOLIO_PORT:-${SELF_HOST_DEFAULT_PORT}`);

    const viteConfig = readRepoFile('vite.config.ts');
    expect(viteConfig).toContain(`process.env.GLASSFOLIO_PORT) || ${SELF_HOST_DEFAULT_PORT}`);

    for (const readme of ['README.md', 'README.fr.md']) {
      const content = readRepoFile(readme);
      expect(content).toContain(`\`GLASSFOLIO_PORT\` | \`${SELF_HOST_DEFAULT_PORT}\``);
      expect(content).toContain(`http://localhost:${SELF_HOST_DEFAULT_PORT}`);
    }
  });

  it('keeps the standalone MCP bridge default port consistent between app and mcp-server', () => {
    expect(MCP_BRIDGE_DEFAULT_PORT).toBe(String(MCP_SERVER_DEFAULT_PORT));
    expect(STANDALONE_BRIDGE_DEFAULT_URL).toBe(`http://127.0.0.1:${MCP_SERVER_DEFAULT_PORT}`);
  });
});
