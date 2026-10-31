import { MCP_TOKEN_HEADER_NAME } from './mcpClients';

/** The two words the AI leaves in the configuration, for the user to replace. */
export const MCP_PLACEHOLDER_ADDRESS = 'PASTE_THE_ADDRESS_HERE';
export const MCP_PLACEHOLDER_TOKEN = 'PASTE_THE_TOKEN_HERE';

/**
 * One prompt for every AI client (Antigravity, Cursor, Claude Code, Codex...): the user pastes it, and the AI
 * works out its own configuration file and format. It holds no secret: the AI writes two placeholders, and the
 * user pastes the address and the token himself, so that they never go through the conversation.
 */
export const MCP_SETUP_PROMPT = `Connect yourself to GlassFolio, a wealth-tracking app, through its MCP server. Do the whole setup yourself. At the end I only want two things to do: paste a token and paste an address.

What it is: an MCP server named "glassfolio" that gives you about 35 tools (portfolio, positions, transactions, goals, alerts, tax...). The tools run in my open GlassFolio browser tab, on my own data. The server speaks Streamable HTTP and checks the HTTP header ${MCP_TOKEN_HEADER_NAME}.

Steps:
1. Work out which AI client you are running in (for example Antigravity, Cursor, Claude Code, Codex, Claude Desktop, Windsurf, Gemini CLI), and where and in what format it stores its MCP server configuration. Use what you know about your own client. If you are not sure, read its documentation or its settings, and tell me what you chose.
2. Add an MCP server named "glassfolio" to that configuration. Keep the servers that are already there, change nothing else, and make a backup copy of the file first if the client does not do it.
   - Preferred: a remote HTTP server (Streamable HTTP) with the url ${MCP_PLACEHOLDER_ADDRESS} and the header ${MCP_TOKEN_HEADER_NAME}: ${MCP_PLACEHOLDER_TOKEN}
   - If your client can only start a local command (stdio): command "node", with as argument the file mcp-server/index.mjs of my GlassFolio folder (ask me for the folder if you do not know it), and the environment variables GLASSFOLIO_MCP_URL=${MCP_PLACEHOLDER_ADDRESS} and GLASSFOLIO_MCP_TOKEN=${MCP_PLACEHOLDER_TOKEN}
   Write the words ${MCP_PLACEHOLDER_ADDRESS} and ${MCP_PLACEHOLDER_TOKEN} exactly as they are: I will replace them.
3. Never ask me for the token or the address in this conversation, never look for them yourself (do not read any token file), and never print them back. They must not go through this chat.
4. Tell me how to reload the MCP servers in your client. Once I have done my two steps, check that you can list the tools of "glassfolio" (for example get_portfolio_summary and list_goals).
5. Finish your answer with exactly two steps for me, naming the file and the lines to edit:
   Step 1: paste the token (copied from GlassFolio, Settings > AI & MCP) in place of ${MCP_PLACEHOLDER_TOKEN}.
   Step 2: paste the address (copied from the same place) in place of ${MCP_PLACEHOLDER_ADDRESS}.
   Remind me to keep GlassFolio open and unlocked in my browser, with "Allow AI clients" turned on.`;
