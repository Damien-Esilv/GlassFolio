#!/usr/bin/env node
/**
 * GlassFolio MCP server (command line).
 *
 *   glassfolio-mcp            stdio server for clients that start a command (Claude Desktop, Codex, Cursor...)
 *   glassfolio-mcp serve      Streamable HTTP server for clients that take a URL (Claude Code, Cursor...)
 *
 * Both relay the tool calls to the user's open GlassFolio tab (see bridge.mjs): the tools run there, on
 * the user's own data, after the vault is unlocked. Nothing is read or stored by this program.
 */

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { readFileSync } from 'node:fs';
import { DEFAULT_APP_ORIGINS, DEFAULT_PORT, MCP_PATH, TOKEN_HEADER, createMcpBridge, loadOrCreateToken } from './bridge.mjs';

const readJson = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const { version } = readJson('./package.json');
const { tools } = readJson('./tools.json');

const HELP = `glassfolio-mcp ${version}: GlassFolio's MCP server.

Your AI client (Claude Code, Codex, Cursor, Antigravity...) calls GlassFolio's ${tools.length} tools through it. The tools run in
your open GlassFolio tab, on your own data, once you have unlocked your vault.

Usage:
  glassfolio-mcp                 stdio server (the client starts this command)
  glassfolio-mcp serve           HTTP server, MCP endpoint http://127.0.0.1:${DEFAULT_PORT}${MCP_PATH}
  glassfolio-mcp token           print the token that the client and GlassFolio must share

Options:
  --port <n>       port of the bridge (default ${DEFAULT_PORT}, or GLASSFOLIO_MCP_PORT)
  --host <addr>    address to listen on (default 127.0.0.1)
  --origin <url>   also accept GlassFolio tabs served from this origin (repeatable, or GLASSFOLIO_MCP_ORIGINS)
  --list           print the tool names as JSON, then exit
  --version        print the version, then exit
  --help           print this help, then exit

Environment:
  GLASSFOLIO_MCP_TOKEN   use this token instead of the one stored in ~/.glassfolio/mcp-token
  GLASSFOLIO_MCP_URL     stdio only: forward to a bridge that already runs (for example the one of a local
                         GlassFolio server, http://127.0.0.1:3000/mcp) instead of starting one

Documentation: https://glassfolio.dev/en/docs`;

const argv = process.argv.slice(2);
const has = (...names) => names.some((name) => argv.includes(name));
const valueOf = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const valuesOf = (name) => argv.flatMap((arg, index) => (arg === name && argv[index + 1] ? [argv[index + 1]] : []));
const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'stdio';

if (has('--version', '-v')) {
  console.log(version);
  process.exit(0);
}
if (has('--list')) {
  console.log(JSON.stringify({ tools: tools.map((tool) => tool.name) }, null, 2));
  process.exit(0);
}
if (has('--help', '-h') || !['stdio', 'serve', 'token'].includes(command)) {
  console.log(HELP);
  process.exit(has('--help', '-h') ? 0 : 1);
}

const home = process.env.GLASSFOLIO_MCP_HOME || path.join(os.homedir(), '.glassfolio');
const token = process.env.GLASSFOLIO_MCP_TOKEN || loadOrCreateToken(home);
if (command === 'token') {
  console.log(token);
  process.exit(0);
}

const host = valueOf('--host') ?? '127.0.0.1';
const port = Number(valueOf('--port') ?? process.env.GLASSFOLIO_MCP_PORT ?? DEFAULT_PORT);
const allowedOrigins = [
  ...DEFAULT_APP_ORIGINS,
  ...valuesOf('--origin'),
  ...(process.env.GLASSFOLIO_MCP_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
];
const log = (message) => process.stderr.write(`glassfolio-mcp: ${message}\n`);

const startServer = (bridge) => {
  const server = http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      res.writeHead(400).end();
      return;
    }
    bridge
      .handle(req, res, url)
      .then((handled) => {
        if (!handled) res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      })
      .catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
};

const newBridge = () => createMcpBridge({ token, tools, version, allowedOrigins });

/** Forwards each JSON-RPC message to a bridge that already runs. */
const createProxy = (url) => async (message) => {
  const failure = (text) => (message?.id === undefined ? null : { jsonrpc: '2.0', id: message.id, error: { code: -32000, message: text } });
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', [TOKEN_HEADER]: token },
      body: JSON.stringify(message),
    });
    if (response.status === 202 || response.status === 204) return null;
    if (response.status === 401) return failure('The GlassFolio MCP token is wrong. Run "glassfolio-mcp token" or copy it from GlassFolio > Settings > AI & MCP.');
    const body = await response.json().catch(() => null);
    return body?.jsonrpc === '2.0' ? body : failure(`The bridge answered HTTP ${response.status}.`);
  } catch {
    return failure(`The bridge at ${url} cannot be reached. Is it running?`);
  }
};

async function runServe() {
  const bridge = newBridge();
  await startServer(bridge);
  console.log(`GlassFolio MCP bridge ${version} listens on http://${host}:${port}`);
  console.log(`  MCP endpoint (Streamable HTTP): http://${host}:${port}${MCP_PATH}`);
  console.log(`  Token (header ${TOKEN_HEADER}): ${token}`);
  console.log('  In GlassFolio: Settings > AI & MCP > turn on "AI clients", enter this address and this token, and keep the tab open and unlocked.');
}

async function runStdio() {
  let dispatch;
  let closeBridge = () => {};
  if (process.env.GLASSFOLIO_MCP_URL) {
    dispatch = createProxy(process.env.GLASSFOLIO_MCP_URL);
    log(`forwarding to ${process.env.GLASSFOLIO_MCP_URL}`);
  } else {
    const bridge = newBridge();
    try {
      const server = await startServer(bridge);
      dispatch = bridge.dispatch;
      closeBridge = () => {
        bridge.close();
        server.close();
      };
      log(`bridge listening on http://${host}:${port}: open GlassFolio, unlock it, and turn on "AI clients" in Settings.`);
    } catch (error) {
      if (error?.code !== 'EADDRINUSE') throw error;
      dispatch = createProxy(`http://${host}:${port}${MCP_PATH}`);
      log(`attached to the bridge that already runs on port ${port}`);
    }
  }

  const lines = readline.createInterface({ input: process.stdin, terminal: false });
  lines.on('line', async (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      return;
    }
    const response = await dispatch(message);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
  lines.on('close', () => {
    closeBridge();
    process.exit(0);
  });
}

(command === 'serve' ? runServe() : runStdio()).catch((error) => {
  log(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
