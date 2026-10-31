/**
 * Data behind the MCP documentation page (/docs). The tool and resource names must match what
 * mcp-server/index.mjs lists (`node mcp-server/index.mjs --list`): tests/unit/config/mcpDocs.test.ts
 * fails when they drift. Texts live in locales/{en,fr}/docs.json.
 */
import { GITHUB_REPO_URL } from './project';

export const MCP_TOOL_GROUPS = [
  { key: 'portfolio', tools: ['get_portfolio_summary', 'get_asset_allocation', 'list_positions', 'list_transactions', 'get_cost_basis_method', 'preview_csv_import'] },
  { key: 'tax', tools: ['get_tax_summary'] },
  { key: 'progress', tools: ['list_goals', 'get_gamification_status', 'list_quests'] },
  { key: 'alerts', tools: ['list_notifications', 'manage_notifications', 'list_alert_rules', 'create_alert_rule'] },
  {
    key: 'security',
    tools: [
      'get_security_status', 'get_storage_status', 'list_auth_methods', 'list_vault_secrets', 'lock_vault',
      'rotate_encryption_key', 'get_email_verification_status', 'resend_verification_email', 'get_privacy_status', 'export_gdpr_archive',
    ],
  },
] as const;

export const MCP_RESOURCES = [
  { key: 'summary', uri: 'glassfolio://portfolio/summary' },
  { key: 'positions', uri: 'glassfolio://positions' },
  { key: 'transactions', uri: 'glassfolio://transactions/recent' },
  { key: 'gamification', uri: 'glassfolio://gamification/status' },
  { key: 'notifications', uri: 'glassfolio://notifications' },
] as const;

export const MCP_TOOL_NAMES: readonly string[] = MCP_TOOL_GROUPS.flatMap((group) => group.tools);

export const MCP_VERIFY_COMMANDS: readonly string[] = [
  `git clone ${GITHUB_REPO_URL}.git`,
  'cd GlassFolio',
  'node mcp-server/index.mjs --list',
];

/** The same entry works in claude_desktop_config.json and in Cursor's .cursor/mcp.json */
export const MCP_CLIENT_CONFIG: readonly string[] = [
  '{',
  '  "mcpServers": {',
  '    "glassfolio": {',
  '      "command": "node",',
  '      "args": ["/absolute/path/to/GlassFolio/mcp-server/index.mjs"]',
  '    }',
  '  }',
  '}',
];
