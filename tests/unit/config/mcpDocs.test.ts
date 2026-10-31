import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { MCP_TOOLS, MCP_TOOL_NAMES } from '../../../src/config/mcpDocs';

const root = process.cwd();
const server = (args: string[]): string => execFileSync('node', [join(root, 'mcp-server/index.mjs'), ...args], { encoding: 'utf-8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] });
const docs = (lang: string): Record<string, any> => JSON.parse(readFileSync(join(root, `locales/${lang}/docs.json`), 'utf-8'));

describe('MCP documentation matches the bridge', () => {
  it('lists exactly the tools the server lists, each with a description', () => {
    const listed = JSON.parse(server(['--list'])) as { tools: string[] };
    expect([...MCP_TOOL_NAMES].sort()).toEqual([...listed.tools].sort());
    expect(MCP_TOOLS.length).toBeGreaterThan(30);
    MCP_TOOLS.forEach((tool) => expect(tool.description.length, tool.name).toBeGreaterThan(10));
    expect(MCP_TOOLS.some((tool) => tool.needsApproval)).toBe(true);
    expect(MCP_TOOLS.some((tool) => !tool.needsApproval)).toBe(true);
  });

  it.each(['en', 'fr'])('explains the bridge in %s: the tab, the token, the approvals and where the data goes', (lang) => {
    const text = JSON.stringify(docs(lang));
    ['X-GlassFolio-Token', 'Claude Code', 'Codex', 'Cursor', 'Antigravity', 'Streamable HTTP', '127.0.0.1', 'app.glassfolio.dev'].forEach((word) => expect(text).toContain(word));
    expect(text).not.toMatch(/sample data|données d’exemple|fictional|fictif/i);
  });

  it('says which client it was really tried with, and nothing else', () => {
    expect(readFileSync(join(root, 'src/pages/Docs.tsx'), 'utf-8')).toContain("const TESTED_CLIENT = 'Claude Code'");
  });

  it('ships the files the bridge needs in the npm package, at the version it reports', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'mcp-server/package.json'), 'utf-8'));
    expect(pkg.name).toBe('glassfolio-mcp');
    expect(pkg.bin).toEqual({ 'glassfolio-mcp': 'index.mjs' });
    expect(pkg.files).toEqual(['index.mjs', 'bridge.mjs', 'tools.json', 'README.md']);
    expect(server(['--version']).trim()).toBe(pkg.version);
    expect(readFileSync(join(root, 'mcp-server/index.mjs'), 'utf-8').startsWith('#!/usr/bin/env node')).toBe(true);
  });
});
