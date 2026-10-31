/**
 * Markdown 404 for AI agents (TGLA-197). vercel.json rewrites to this function only the unknown paths
 * requested with `Accept: text/markdown`; every other 404 stays the static page. The requested path is
 * not echoed back, so nobody can plant text in an agent's context through a crafted URL.
 */
const BODY = `# 404: page not found

This address does not exist on glassfolio.dev, so there is nothing to read here.

Where to look instead:

- [Home](https://glassfolio.dev/en): what GlassFolio is and how it works
- [Documentation](https://glassfolio.dev/en/docs): the MCP server and its tools
- [Sitemap](https://glassfolio.dev/sitemap.xml): every public page
- [llms.txt](https://glassfolio.dev/llms.txt): a short guide for AI agents
`;

export default function handler(_request, response) {
  response.statusCode = 404;
  response.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  response.setHeader('Cache-Control', 'public, max-age=300');
  response.setHeader('Vary', 'Accept');
  response.end(BODY);
}
