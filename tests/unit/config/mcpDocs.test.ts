import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { MCP_RESOURCES, MCP_TOOL_GROUPS, MCP_TOOL_NAMES } from '../../../src/config/mcpDocs';

const root = process.cwd();
const server = (args: string[], input?: string): string =>
  execFileSync('node', [join(root, 'mcp-server/index.mjs'), ...args], { encoding: 'utf-8', input, timeout: 10_000, stdio: ['pipe', 'pipe', 'ignore'] });
const docs = (lang: string): Record<string, any> => JSON.parse(readFileSync(join(root, `locales/${lang}/docs.json`), 'utf-8'));

describe('MCP documentation matches the server', () => {
  const listed = JSON.parse(server(['--list'])) as { tools: string[]; resources: string[] };

  it('documents exactly the tools and resources the server lists', () => {
    expect([...MCP_TOOL_NAMES].sort()).toEqual([...listed.tools].sort());
    expect(MCP_RESOURCES.map((resource) => resource.uri).sort()).toEqual([...listed.resources].sort());
    expect(new Set(MCP_TOOL_NAMES).size).toBe(MCP_TOOL_NAMES.length);
  });

  it.each(['en', 'fr'])('has a %s text for every group, tool and resource', (lang) => {
    const texts = docs(lang);
    MCP_TOOL_GROUPS.forEach((group) => expect(texts.tools.groups[group.key], group.key).toBeTruthy());
    MCP_TOOL_NAMES.forEach((tool) => expect(texts.tools.items[tool], tool).toBeTruthy());
    MCP_RESOURCES.forEach((resource) => expect(texts.resources.items[resource.key], resource.key).toBeTruthy());
  });

  it('says it answers with sample data, in the protocol handshake and in the docs', () => {
    const reply = JSON.parse(server([], '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n').trim().split('\n')[0]);
    expect(reply.result.instructions).toMatch(/sample data/i);
    expect(docs('en').sampleData.body).toMatch(/sample|fictional/i);
    expect(docs('fr').sampleData.body).toMatch(/exemple|fictif/i);
  });

  it('is a publishable package whose version is the one the server reports', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'mcp-server/package.json'), 'utf-8'));
    expect(pkg.name).toBe('glassfolio-mcp');
    expect(pkg.bin).toEqual({ 'glassfolio-mcp': 'index.mjs' });
    expect(pkg.files).toEqual(['index.mjs', 'README.md']);
    expect(server(['--version']).trim()).toBe(pkg.version);
    expect(readFileSync(join(root, 'mcp-server/index.mjs'), 'utf-8').startsWith('#!/usr/bin/env node')).toBe(true);
  });
});
