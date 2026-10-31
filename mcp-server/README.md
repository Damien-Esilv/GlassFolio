# glassfolio-mcp

The [Model Context Protocol](https://modelcontextprotocol.io) server of [GlassFolio](https://glassfolio.dev), for
Claude Code, Codex, Cursor, Antigravity and other MCP clients.

GlassFolio encrypts your vault in your browser, and only your open, unlocked GlassFolio tab holds the key, so no
program can read it from outside. This server is therefore a **bridge** that runs on your own computer: your AI
client sends it a tool call, the bridge passes the call to your tab, the tab runs the tool on your own data and
sends the result back. Nothing goes through GlassFolio's servers, and the bridge stores nothing. A tool that
changes data waits for your approval in GlassFolio.

## Use

1. In GlassFolio, open Settings > AI & MCP and turn on "Allow AI clients". Keep the tab open and unlocked.
2. Give your client the bridge. Settings > AI & MCP prepares these snippets with your own values.

A client that starts a command (Claude Desktop, Codex...):

```json
{
  "mcpServers": {
    "glassfolio": { "command": "npx", "args": ["-y", "glassfolio-mcp"] }
  }
}
```

A client that takes a URL (Claude Code, Cursor...): start `npx glassfolio-mcp serve`, then

```bash
claude mcp add --transport http glassfolio http://127.0.0.1:47831/mcp --header "X-GlassFolio-Token: <token>"
```

The token is printed by `serve`, and by `npx glassfolio-mcp token`. Paste it in Settings > AI & MCP too.

With GlassFolio running on your machine (Docker or `npm run dev`), its server already contains the bridge at
`/mcp`: nothing to start. From a clone of the repository, replace `npx -y glassfolio-mcp` with
`node /absolute/path/to/GlassFolio/mcp-server/index.mjs`.

## Command line

```bash
glassfolio-mcp            # stdio server (the client starts it)
glassfolio-mcp serve      # HTTP server on 127.0.0.1:47831
glassfolio-mcp token      # print the shared token
glassfolio-mcp --list     # tool names, as JSON
glassfolio-mcp --version
```

It needs Node.js 22, listens on your own computer only, and accepts only the token that you share.

## Documentation

How it works, the clients, the approvals and the 35 tools: <https://glassfolio.dev/en/docs>

## License

[PolyForm Noncommercial 1.0.0](https://github.com/Damien-Esilv/GlassFolio/blob/main/LICENSE): source-available, free for noncommercial use.
