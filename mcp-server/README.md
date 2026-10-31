# glassfolio-mcp

The [Model Context Protocol](https://modelcontextprotocol.io) server of [GlassFolio](https://glassfolio.dev), over stdio.

> **It answers with sample data.** The server returns a built-in, fictional portfolio. It is not
> connected to your GlassFolio vault: your data is encrypted in your browser and the key never leaves
> it, so a separate program cannot read it. Use this server to try the 24 tools and to build an
> integration, not to read your own figures.

## Use

Your MCP client starts the server. Add it to `claude_desktop_config.json` (Claude Desktop) or
`.cursor/mcp.json` (Cursor):

```json
{
  "mcpServers": {
    "glassfolio": {
      "command": "npx",
      "args": ["-y", "glassfolio-mcp"]
    }
  }
}
```

Or from a clone of the repository: `"command": "node"`, `"args": ["/absolute/path/to/GlassFolio/mcp-server/index.mjs"]`.

## Command line

```bash
npx glassfolio-mcp --list      # tool names and resource URIs, as JSON
npx glassfolio-mcp --version
npx glassfolio-mcp --help
```

Without an option it speaks MCP on standard input and output. It needs Node.js 22, makes no network
request and sends nothing anywhere.

## Documentation

Tools, resources and configuration: <https://glassfolio.dev/en/docs>

## License

[PolyForm Noncommercial 1.0.0](https://github.com/Damien-Esilv/GlassFolio/blob/main/LICENSE): source-available, free for noncommercial use.
