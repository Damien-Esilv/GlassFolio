import { describe, it, expect, afterEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import connectorRelay from '../../../api/connector-relay.js';

const run = async (headers: Record<string, string>) => {
  const captured = { status: 0, body: '' };
  const res = {
    statusCode: 0,
    setHeader: vi.fn(),
    writeHead(status: number) {
      captured.status = status;
    },
    end(chunk?: Buffer | string) {
      captured.status ||= this.statusCode;
      captured.body = chunk ? chunk.toString() : '';
    },
  };
  await connectorRelay(Object.assign(Readable.from([]), { method: 'POST', headers }), res);
  return captured;
};

describe('hosted connector relay function (TGLA-221)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not exist on the showcase project', async () => {
    vi.stubEnv('GLASSFOLIO_BUILD_TARGET', 'showcase');
    expect((await run({ host: 'glassfolio.dev' })).status).toBe(404);
  });

  it('refuses a cross-site call on the app project before any session check', async () => {
    vi.stubEnv('GLASSFOLIO_BUILD_TARGET', 'app');
    const result = await run({ host: 'app.glassfolio.dev', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' });
    expect(result.status).toBe(403);
  });
});
