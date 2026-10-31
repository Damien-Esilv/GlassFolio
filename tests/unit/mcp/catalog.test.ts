import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { aiToolRegistry } from '../../../src/services/ai/aiToolRegistry';
import { registerAllStandardTools } from '../../../src/services/ai/tools';

/**
 * mcp-server/tools.json is what an MCP client sees before GlassFolio is even open: it is generated from the
 * tool registry of the app (`npm run mcp:catalog`) and this test fails when the two drift apart.
 */
const file = join(process.cwd(), 'mcp-server/tools.json');

const build = (): { tools: unknown[] } => ({
  tools: aiToolRegistry
    .formatToolsForMCP()
    .map((tool) => ({
      ...tool,
      annotations: {
        title: tool.name,
        readOnlyHint: !aiToolRegistry.getTool(tool.name)?.requiresConfirmation,
        // A change is never applied before the user approves it in the app
        destructiveHint: false,
        openWorldHint: false,
      },
    }))
    .sort((a, b) => a.name.localeCompare(b.name)),
});

describe('MCP tool catalog', () => {
  beforeAll(() => {
    aiToolRegistry.clear();
    registerAllStandardTools();
  });

  it('matches the tools registered in the app', () => {
    const expected = build();
    if (process.env.UPDATE_MCP_CATALOG === '1') writeFileSync(file, `${JSON.stringify(expected, null, 2)}\n`);
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual(expected);
  });

  it('marks exactly the tools that need an approval as not read-only', () => {
    const catalog = JSON.parse(readFileSync(file, 'utf-8')) as { tools: Array<{ name: string; annotations: { readOnlyHint: boolean } }> };
    const needApproval = aiToolRegistry.getAllTools().filter((tool) => tool.requiresConfirmation).map((tool) => tool.name).sort();
    expect(catalog.tools.filter((tool) => !tool.annotations.readOnlyHint).map((tool) => tool.name).sort()).toEqual(needApproval);
    expect(needApproval.length).toBeGreaterThan(0);
  });

  it('gives every tool a name, a description and an object schema', () => {
    const catalog = JSON.parse(readFileSync(file, 'utf-8')) as { tools: Array<{ name: string; description: string; inputSchema: { type: string } }> };
    expect(new Set(catalog.tools.map((tool) => tool.name)).size).toBe(catalog.tools.length);
    catalog.tools.forEach((tool) => {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema.type).toBe('object');
    });
  });
});
