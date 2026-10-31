import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { MCP_SETUP_PROMPT } from '../../../src/config/mcpSetupPrompt';
import { MCP_COMMANDS, commandsFor } from '../../../src/config/mcpCommands';

const aiTexts = (lang: string): any => JSON.parse(readFileSync(join(process.cwd(), `locales/${lang}/ai.json`), 'utf-8')).mcpBridge;

describe('the universal setup prompt', () => {
  it('is one prompt in English, with the three steps: start the bridge, add the server, hand back two values', () => {
    expect(MCP_SETUP_PROMPT).toMatch(/^Configure and connect the GlassFolio MCP server to your AI client\./);
    expect(MCP_SETUP_PROMPT).toMatch(/^1\. Start the MCP bridge/m);
    expect(MCP_SETUP_PROMPT).toMatch(/^2\. Add the MCP server "glassfolio"/m);
    expect(MCP_SETUP_PROMPT).toMatch(/^3\. Give me only the token and the address to paste into GlassFolio \(Settings > AI & MCP\)/m);
    expect(MCP_SETUP_PROMPT).not.toMatch(/^4\./m);
  });

  it('gives both ways to start the bridge, and the command that prints the token', () => {
    expect(MCP_SETUP_PROMPT).toContain('npx -y glassfolio-mcp serve');
    expect(MCP_SETUP_PROMPT).toContain('node mcp-server/index.mjs serve');
    expect(MCP_SETUP_PROMPT).toContain('`token`');
  });

  it('holds no secret and no real address, and no accented letter: it stays English whatever the interface language', () => {
    expect(MCP_SETUP_PROMPT).not.toMatch(/https?:\/\//);
    expect(MCP_SETUP_PROMPT).not.toMatch(/\b[0-9a-f]{32,}\b/);
    expect(MCP_SETUP_PROMPT).not.toMatch(/[À-ÿ]/);
  });

  it('is not tied to a client: it names none and lets the AI use its own configuration', () => {
    ['Antigravity', 'Cursor', 'Claude', 'Codex'].forEach((name) => expect(MCP_SETUP_PROMPT).not.toContain(name));
    expect(MCP_SETUP_PROMPT).toContain('your local MCP configuration');
    expect(MCP_SETUP_PROMPT.length).toBeLessThan(700);
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
