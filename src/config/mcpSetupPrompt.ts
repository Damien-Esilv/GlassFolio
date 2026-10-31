/**
 * One prompt for every AI client (Antigravity, Cursor, Claude Code, Codex...): the user pastes it, and the AI
 * starts the bridge if needed, adds the server to its own configuration, and hands back the token and the
 * address to paste into GlassFolio. It is always in English, whatever the language of the interface.
 */
export const MCP_SETUP_PROMPT = `Configure and connect the GlassFolio MCP server to your AI client.

Instructions:

1. Start the MCP bridge if needed (\`npx -y glassfolio-mcp serve\` or \`node mcp-server/index.mjs serve\`) and get the token with the \`token\` command.
2. Add the MCP server "glassfolio" to your local MCP configuration.
3. Give me only the token and the address to paste into GlassFolio (Settings > AI & MCP).`;
