import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TOKEN, TOKEN_HEADER, catalog, connectTab, startBridge, type RunningBridge } from './mcpTestKit';

const script = join(process.cwd(), 'mcp-server/index.mjs');
const home = (): string => mkdtempSync(join(tmpdir(), 'gf-mcp-cli-'));
const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync('node', [script, ...args], { encoding: 'utf-8', env: { ...process.env, GLASSFOLIO_MCP_HOME: home(), ...env }, timeout: 15_000 });

interface StdioClient {
  child: ChildProcessWithoutNullStreams;
  stderr: () => string;
  send: (message: unknown) => void;
  reply: (id: number, timeoutMs?: number) => Promise<any>;
  ready: () => Promise<void>;
}
const children: ChildProcessWithoutNullStreams[] = [];
const startStdio = (env: Record<string, string>): StdioClient => {
  const child = spawn('node', [script], { env: { ...process.env, ...env } }) as ChildProcessWithoutNullStreams;
  children.push(child);
  let out = '';
  let err = '';
  const replies = new Map<number, any>();
  child.stdout.on('data', (chunk) => {
    out += chunk;
    let end;
    while ((end = out.indexOf('\n')) >= 0) {
      const line = out.slice(0, end);
      out = out.slice(end + 1);
      const message = JSON.parse(line);
      replies.set(message.id, message);
    }
  });
  child.stderr.on('data', (chunk) => (err += chunk));
  const waitFor = async (check: () => boolean, timeoutMs: number, what: string): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (!check()) {
      if (Date.now() > deadline) throw new Error(`timeout: ${what}\n${err}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };
  return {
    child,
    stderr: () => err,
    send: (message) => child.stdin.write(`${JSON.stringify(message)}\n`),
    reply: async (id, timeoutMs = 5000) => {
      await waitFor(() => replies.has(id), timeoutMs, `reply ${id}`);
      return replies.get(id);
    },
    ready: () => waitFor(() => /listening|attached|forwarding/.test(err), 5000, 'start'),
  };
};

let bridge: RunningBridge | undefined;
afterEach(async () => {
  children.splice(0).forEach((child) => child.kill());
  await bridge?.stop();
  bridge = undefined;
});

describe('glassfolio-mcp command line', () => {
  it('prints its version, its help, and the tool names of the catalog', () => {
    expect(run(['--version']).stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    const help = run(['--help']);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('glassfolio-mcp serve');
    expect(JSON.parse(run(['--list']).stdout).tools).toEqual(catalog.tools.map((tool) => tool.name));
    const unknown = run(['frobnicate']);
    expect(unknown.status).toBe(1);
    expect(unknown.stdout).toContain('Usage');
  });

  it('keeps one token per machine, and lets the environment override it', () => {
    const dir = home();
    const first = run(['token'], { GLASSFOLIO_MCP_HOME: dir }).stdout.trim();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(run(['token'], { GLASSFOLIO_MCP_HOME: dir }).stdout.trim()).toBe(first);
    expect(run(['token'], { GLASSFOLIO_MCP_TOKEN: 'z'.repeat(20) }).stdout.trim()).toBe('z'.repeat(20));
  });

  it('serves MCP over stdio and relays a tool call to the tab that connects to its bridge', async () => {
    const port = await freePort();
    const client = startStdio({ GLASSFOLIO_MCP_HOME: home(), GLASSFOLIO_MCP_TOKEN: TOKEN, GLASSFOLIO_MCP_PORT: String(port) });
    await client.ready();
    client.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
    expect((await client.reply(1)).result.serverInfo.name).toBe('glassfolio');
    client.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    client.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect((await client.reply(2)).result.tools).toHaveLength(catalog.tools.length);

    client.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_portfolio_summary', arguments: {} } });
    expect((await client.reply(3)).result.content[0].text).toMatch(/not connected/);

    const tab = await connectTab(`http://127.0.0.1:${port}`);
    client.send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_portfolio_summary', arguments: {} } });
    const request = await tab.next('call');
    await tab.postResult({ id: request.id, ok: true, result: { totalValue: 1234 } });
    expect(JSON.parse((await client.reply(4)).result.content[0].text)).toEqual({ totalValue: 1234 });
    tab.close();
  });

  it('writes nothing but protocol messages on stdout', async () => {
    const client = startStdio({ GLASSFOLIO_MCP_HOME: home(), GLASSFOLIO_MCP_TOKEN: TOKEN, GLASSFOLIO_MCP_PORT: String(await freePort()) });
    await client.ready();
    client.child.stdin.write('not json\n');
    expect((await client.reply(null as unknown as number)).error.code).toBe(-32700);
    expect(client.stderr()).toMatch(/bridge listening/);
  });

  it('attaches to the bridge that another client already runs on the same port', async () => {
    const port = await freePort();
    const env = { GLASSFOLIO_MCP_HOME: home(), GLASSFOLIO_MCP_TOKEN: TOKEN, GLASSFOLIO_MCP_PORT: String(port) };
    const host = startStdio(env);
    await host.ready();
    const second = startStdio(env);
    await second.ready();
    expect(second.stderr()).toMatch(/attached/);
    const tab = await connectTab(`http://127.0.0.1:${port}`);
    second.send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_goals', arguments: {} } });
    const request = await tab.next('call');
    await tab.postResult({ id: request.id, ok: true, result: ['goal'] });
    expect(JSON.parse((await second.reply(1)).result.content[0].text)).toEqual(['goal']);
    tab.close();
  });

  it('forwards to a bridge it is pointed at, and explains a wrong token', async () => {
    bridge = await startBridge({ callTimeoutMs: 2000 });
    const good = startStdio({ GLASSFOLIO_MCP_HOME: home(), GLASSFOLIO_MCP_TOKEN: TOKEN, GLASSFOLIO_MCP_URL: `${bridge.base}/mcp` });
    await good.ready();
    good.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect((await good.reply(1)).result.tools).toHaveLength(catalog.tools.length);
    const bad = startStdio({ GLASSFOLIO_MCP_HOME: home(), GLASSFOLIO_MCP_TOKEN: 'w'.repeat(32), GLASSFOLIO_MCP_URL: `${bridge.base}/mcp` });
    await bad.ready();
    bad.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect((await bad.reply(1)).error.message).toMatch(/token is wrong/);
    const lost = startStdio({ GLASSFOLIO_MCP_HOME: home(), GLASSFOLIO_MCP_TOKEN: TOKEN, GLASSFOLIO_MCP_URL: `http://127.0.0.1:${await freePort()}/mcp` });
    await lost.ready();
    lost.send({ jsonrpc: '2.0', id: 1, method: 'ping' });
    expect((await lost.reply(1)).error.message).toMatch(/cannot be reached/);
    expect(TOKEN_HEADER).toBe('x-glassfolio-token');
  });
});
