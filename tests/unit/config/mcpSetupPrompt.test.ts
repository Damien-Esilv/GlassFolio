import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { MCP_PLACEHOLDER_ADDRESS, MCP_PLACEHOLDER_TOKEN, MCP_SETUP_PROMPT } from '../../../src/config/mcpSetupPrompt';
import { MCP_COMMANDS, commandsFor } from '../../../src/config/mcpCommands';

const aiTexts = (lang: string): any => JSON.parse(readFileSync(join(process.cwd(), `locales/${lang}/ai.json`), 'utf-8')).mcpBridge;

describe('the universal setup prompt', () => {
  it('leaves exactly two things to the user: a token and an address, as placeholders', () => {
    [MCP_PLACEHOLDER_ADDRESS, MCP_PLACEHOLDER_TOKEN].forEach((placeholder) => {
      expect(MCP_SETUP_PROMPT.split(placeholder).length - 1, placeholder).toBeGreaterThanOrEqual(3);
    });
    expect(MCP_SETUP_PROMPT).toContain('Step 1');
    expect(MCP_SETUP_PROMPT).toContain('Step 2');
    expect(MCP_SETUP_PROMPT).not.toContain('Step 3');
  });

  it('holds no secret and no real address, and keeps them out of the conversation', () => {
    expect(MCP_SETUP_PROMPT).not.toMatch(/https?:\/\//);
    expect(MCP_SETUP_PROMPT).not.toMatch(/\b[0-9a-f]{32,}\b/);
    expect(MCP_SETUP_PROMPT).toMatch(/Never ask me for the token or the address/);
    expect(MCP_SETUP_PROMPT).toMatch(/do not read any token file/);
  });

  it('is one prompt for every client: it asks the AI to find its own file and format', () => {
    ['Antigravity', 'Cursor', 'Claude Code', 'Codex'].forEach((name) => expect(MCP_SETUP_PROMPT).toContain(name));
    expect(MCP_SETUP_PROMPT).toMatch(/where and in what format it stores its MCP server configuration/);
    expect(MCP_SETUP_PROMPT).toContain('X-GlassFolio-Token');
    expect(MCP_SETUP_PROMPT).toContain('GLASSFOLIO_MCP_URL');
    expect(MCP_SETUP_PROMPT).toContain('GLASSFOLIO_MCP_TOKEN');
    expect(MCP_SETUP_PROMPT).toMatch(/Keep the servers that are already there/);
  });

  it('stays short enough to paste anywhere', () => {
    expect(MCP_SETUP_PROMPT.length).toBeLessThan(4000);
  });
});

describe('the commands to manage the bridge', () => {
  it('shows the commands that fit where the bridge lives', () => {
    const online = commandsFor('online').map((command) => command.id);
    const local = commandsFor('local').map((command) => command.id);
    expect(online).toEqual(expect.arrayContaining(['start', 'token', 'tools', 'status', 'rotate']));
    expect(local).toEqual(expect.arrayContaining(['tools', 'status', 'rotate', 'disable']));
    expect(local).not.toContain('start');
    expect(online).not.toContain('disable');
  });

  it('builds a status command with the address and the token header', () => {
    const status = MCP_COMMANDS.find((command) => command.id === 'status')!;
    expect(status.lines({ base: 'http://127.0.0.1:47831', token: 'abc' })).toEqual(['curl -s -H "X-GlassFolio-Token: abc" http://127.0.0.1:47831/mcp/bridge/status']);
  });

  it.each(['en', 'fr'])('explains every command in %s', (lang) => {
    const items = aiTexts(lang).commands.items;
    MCP_COMMANDS.forEach((command) => {
      expect(items[command.id]?.title, `${command.id} title`).toBeTruthy();
      command.locations.forEach((location) => expect(items[command.id][location] ?? items[command.id].desc, `${command.id} ${location}`).toBeTruthy());
    });
  });
});
