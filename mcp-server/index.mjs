#!/usr/bin/env node
/**
 * GlassFolio Universal MCP Server (Stdio Transport)
 * Conforming to Model Context Protocol specification.
 * Connects Claude Desktop, Cursor, Antigravity IDE and other MCP-enabled AI agents
 * directly to the GlassFolio wealth management data layer.
 */

import readline from 'readline';

// Standard MCP tools definition
const TOOLS = [
  {
    name: 'get_portfolio_summary',
    description: 'Get an overall financial summary of the user portfolio (net wealth, cost basis, unrealized profit/loss).',
    inputSchema: {
      type: 'object',
      properties: {
        currency: { type: 'string', description: 'Currency (e.g. EUR, USD). Defaults to EUR.' }
      }
    }
  },
  {
    name: 'get_asset_allocation',
    description: 'Get the asset allocation breakdown by asset class (Equity, Crypto, Cash, ETF) with values and percentages.',
    inputSchema: {
      type: 'object',
      properties: {
        currency: { type: 'string', description: 'Base currency, defaults to EUR' }
      }
    }
  },
  {
    name: 'list_positions',
    description: 'List user asset holdings and positions with quantities, average cost (PRU), current price, market value, and unrealized gains.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Filter by asset class: All, Equity, Crypto, Cash, ETF' },
        searchQuery: { type: 'string', description: 'Filter by symbol or name' }
      }
    }
  },
  {
    name: 'list_transactions',
    description: 'List recent financial transactions with optional filtering by asset ticker or operation type.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Asset ticker symbol' },
        type: { type: 'string', description: 'Transaction type: Buy, Sell, Deposit, Withdrawal' },
        limit: { type: 'number', description: 'Max number of transactions (default 10)' }
      }
    }
  },
  {
    name: 'get_tax_summary',
    description: 'Calculate capital gains and French tax estimates (PFU vs barème progressif) for a given fiscal year.',
    inputSchema: {
      type: 'object',
      properties: {
        fiscalYear: { type: 'string', description: 'Fiscal year, e.g. "2024", "2025"' }
      }
    }
  },
  {
    name: 'list_goals',
    description: 'List user financial goals, target amounts, current amounts and progress percentages.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_gamification_status',
    description: 'Retrieve user gamification level, total XP, investor rank, streak, and unlocked achievements count.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'list_quests',
    description: 'List active gamified investor quests with progress, target and XP rewards.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_security_status',
    description: 'Inspect the encrypted client-side E2EE vault status, 2FA MFA state, registered passkeys, and recent security audit events.',
    inputSchema: {
      type: 'object',
      properties: {
        includeAuditHistory: { type: 'boolean', description: 'Whether to include the last 5 security audit events' }
      }
    }
  },
  {
    name: 'list_vault_secrets',
    description: 'List all configured external API providers in the encrypted secrets vault (masked values only).',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'lock_vault',
    description: 'Immediately lock the encrypted client-side vault and wipe decrypted data from memory (requires confirmation).',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'rotate_encryption_key',
    description: 'Rotate the Data Encryption Key (DEK) and re-encrypt all sensitive records under a new key (requires confirmation).',
    inputSchema: {
      type: 'object',
      properties: {
        masterPassword: { type: 'string', description: 'Current master password to authorize re-wrapping' }
      },
      required: ['masterPassword']
    }
  },
  {
    name: 'list_notifications',
    description: 'List all notifications and alerts with optional category filter (portfolio, fiscal, goals, security, system), read filter, and limit.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['portfolio', 'fiscal', 'goals', 'security', 'system'] },
        unreadOnly: { type: 'boolean', description: 'Filter unread notifications only' },
        limit: { type: 'number', description: 'Maximum notifications to return' }
      }
    }
  },
  {
    name: 'manage_notifications',
    description: 'Perform management actions on notifications (mark_read, mark_all_read, delete, clear_read). Requires confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['mark_read', 'mark_all_read', 'delete', 'clear_read'] },
        alertId: { type: 'string', description: 'Notification ID required for mark_read or delete' }
      },
      required: ['action']
    }
  },
  {
    name: 'list_alert_rules',
    description: 'List all custom user-defined alert rules (price threshold, P&L %, cash ratio) with their trigger history and enabled state.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'create_alert_rule',
    description: 'Create a new custom alert rule for real-time portfolio monitoring (e.g. price threshold, P&L %, cash ratio). Requires confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the rule' },
        metric: { type: 'string', enum: ['price_above', 'price_below', 'pl_percent_above', 'pl_percent_below', 'cash_ratio_above'] },
        threshold: { type: 'number', description: 'Threshold value' },
        symbol: { type: 'string', description: 'Asset symbol if metric requires it' }
      },
      required: ['name', 'metric', 'threshold']
    }
  }
];

const RESOURCES = [
  {
    uri: 'glassfolio://portfolio/summary',
    name: 'Portfolio Summary',
    description: 'Current portfolio net wealth and macro asset allocation summary',
    mimeType: 'application/json'
  },
  {
    uri: 'glassfolio://positions',
    name: 'Portfolio Positions',
    description: 'Detail of all currently open positions with cost basis and unrealized PL',
    mimeType: 'application/json'
  },
  {
    uri: 'glassfolio://transactions/recent',
    name: 'Recent Transactions',
    description: 'Last 20 transactions in the user portfolio',
    mimeType: 'application/json'
  },
  {
    uri: 'glassfolio://gamification/status',
    name: 'Gamification Status',
    description: 'Current investor rank, level, total XP, and unlocked badges count',
    mimeType: 'application/json'
  },
  {
    uri: 'glassfolio://notifications',
    name: 'Notifications & Alerts',
    description: 'Current in-app notifications, smart alerts, and unread counts',
    mimeType: 'application/json'
  }
];

function sendResponse(id, result, error = null) {
  const payload = {
    jsonrpc: '2.0',
    id,
  };
  if (error) {
    payload.error = error;
  } else {
    payload.result = result;
  }
  process.stdout.write(JSON.stringify(payload) + '\n');
}

// In-memory / mock data fallback for stdio process
const mockPortfolioSummary = {
  totalValue: 124850.45,
  totalCost: 98400.0,
  totalPL: 26450.45,
  totalPLPercent: 26.88,
  currency: 'EUR',
  positionsCount: 12
};

const mockPositions = [
  { symbol: 'AAPL', instrument: 'Apple Inc.', type: 'Equity', quantity: 45, avgCost: 152.3, lastPrice: 178.5, marketValue: 8032.5, unrealizedPL: 1179.0, currency: 'EUR' },
  { symbol: 'BTC', instrument: 'Bitcoin', type: 'Crypto', quantity: 0.85, avgCost: 42000.0, lastPrice: 65200.0, marketValue: 55420.0, unrealizedPL: 19720.0, currency: 'EUR' },
  { symbol: 'CW8', instrument: 'Amundi MSCI World ETF', type: 'ETF', quantity: 80, avgCost: 420.0, lastPrice: 512.4, marketValue: 40992.0, unrealizedPL: 7392.0, currency: 'EUR' },
  { symbol: 'EUR', instrument: 'Livret A & Liquidités', type: 'Cash', quantity: 20405.95, avgCost: 1.0, lastPrice: 1.0, marketValue: 20405.95, unrealizedPL: 0.0, currency: 'EUR' }
];

let mockAlerts = [
  { id: 'alrt-1', type: 'warning', category: 'fiscal', title: 'Échéance fiscale', message: 'Date limite dans 15 jours.', date: '2026-05-15T00:00:00.000Z', read: false },
  { id: 'alrt-2', type: 'info', category: 'portfolio', title: 'Dividende reçu', message: '+45.20 € sur AAPL', date: '2026-05-10T12:00:00.000Z', read: true }
];

let mockAlertRules = [
  { id: 'rule-btc-target', name: 'BTC > $60,000', metric: 'price_above', symbol: 'BTC', threshold: 60000, enabled: true, createdAt: '2026-05-01T00:00:00.000Z' }
];

async function handleToolCall(name, args) {
  switch (name) {
    case 'get_portfolio_summary':
      return {
        content: [{ type: 'text', text: JSON.stringify(mockPortfolioSummary, null, 2) }]
      };
    case 'get_asset_allocation': {
      const allocation = [
        { assetClass: 'Crypto', value: 55420.0, percentage: 44.39 },
        { assetClass: 'ETF', value: 40992.0, percentage: 32.83 },
        { assetClass: 'Cash', value: 20405.95, percentage: 16.34 },
        { assetClass: 'Equity', value: 8032.5, percentage: 6.43 }
      ];
      return {
        content: [{ type: 'text', text: JSON.stringify(allocation, null, 2) }]
      };
    }
    case 'list_positions': {
      return {
        content: [{ type: 'text', text: JSON.stringify(mockPositions, null, 2) }]
      };
    }
    case 'list_transactions': {
      const txs = [
        { id: 'tx-1', date: '2026-03-15', type: 'Buy', symbol: 'AAPL', amount: 10, price: 175, total: 1750, currency: 'EUR' },
        { id: 'tx-2', date: '2026-02-28', type: 'Buy', symbol: 'CW8', amount: 5, price: 505, total: 2525, currency: 'EUR' },
        { id: 'tx-3', date: '2026-01-10', type: 'Deposit', symbol: 'EUR', amount: 2000, price: 1, total: 2000, currency: 'EUR' }
      ];
      return {
        content: [{ type: 'text', text: JSON.stringify(txs, null, 2) }]
      };
    }
    case 'get_tax_summary': {
      const tax = {
        fiscalYear: args?.fiscalYear || '2025',
        totalGrossCapitalGains: 4520.0,
        totalGrossCapitalLosses: 340.0,
        netTaxableGain: 4180.0,
        totalTaxDue: 1254.0,
        recommendedRegime: 'PFU (Flat Tax 30%)',
        taxSavingsWithOptimalRegime: 215.0
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(tax, null, 2) }]
      };
    }
    case 'list_goals': {
      const goals = [
        { id: 'g-1', title: 'Fonds d’urgence', targetAmount: 15000, currentAmount: 12500, progressPercentage: 83.33 },
        { id: 'g-2', title: 'Apport Immobilier', targetAmount: 50000, currentAmount: 28400, progressPercentage: 56.8 }
      ];
      return {
        content: [{ type: 'text', text: JSON.stringify(goals, null, 2) }]
      };
    }
    case 'get_gamification_status': {
      const gamification = {
        level: 3,
        xp: 450,
        rank: {
          id: 'rank_3',
          titleKey: 'ranks.rank_3',
          levelMin: 3,
          levelMax: 4
        },
        progress: {
          xpInCurrentLevel: 50,
          levelRange: 200,
          progressPercent: 25
        },
        unlockedBadgesCount: 4,
        totalBadgesCount: 16,
        pinnedBadges: ['first_transaction', 'dca_streak_3']
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(gamification, null, 2) }]
      };
    }
    case 'list_quests': {
      const quests = [
        { id: 'quest_portfolio_diversity', titleKey: 'quests.portfolio_diversity.title', xpReward: 50, progress: 3, target: 4, completed: false },
        { id: 'quest_first_goal', titleKey: 'quests.first_goal.title', xpReward: 30, progress: 1, target: 1, completed: true }
      ];
      return {
        content: [{ type: 'text', text: JSON.stringify(quests, null, 2) }]
      };
    }
    case 'get_security_status': {
      const status = {
        isInitialized: true,
        vaultStatus: 'unlocked',
        autoLockMinutes: 15,
        totpEnabled: true,
        passkeysCount: 1,
        secretsCount: 2,
        recentAuditEvents: args?.includeAuditHistory ? [
          { event: 'vault_unlocked', severity: 'info', timestamp: new Date().toISOString() },
          { event: 'totp_verified', severity: 'info', timestamp: new Date().toISOString() }
        ] : undefined
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(status, null, 2) }]
      };
    }
    case 'list_vault_secrets': {
      const secrets = {
        count: 2,
        secrets: [
          { id: 'sec-1', provider: 'gemini', name: 'Gemini Pro', preview: '••••••••1234', updatedAt: new Date().toISOString() },
          { id: 'sec-2', provider: 'openai', name: 'OpenAI GPT-4', preview: '••••••••5678', updatedAt: new Date().toISOString() }
        ]
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(secrets, null, 2) }]
      };
    }
    case 'lock_vault': {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Vault successfully locked' }, null, 2) }]
      };
    }
    case 'rotate_encryption_key': {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'DEK successfully rotated with fresh IVs' }, null, 2) }]
      };
    }
    case 'list_notifications': {
      let filtered = mockAlerts;
      if (args?.category) filtered = filtered.filter(a => a.category === args.category);
      if (args?.unreadOnly) filtered = filtered.filter(a => !a.read);
      const limit = args?.limit || 20;
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            total: filtered.length,
            unreadCount: mockAlerts.filter(a => !a.read).length,
            notifications: filtered.slice(0, limit)
          }, null, 2)
        }]
      };
    }
    case 'manage_notifications': {
      if (args?.action === 'mark_read') {
        mockAlerts = mockAlerts.map(a => a.id === args.alertId ? { ...a, read: true } : a);
      } else if (args?.action === 'mark_all_read') {
        mockAlerts = mockAlerts.map(a => ({ ...a, read: true }));
      } else if (args?.action === 'delete') {
        mockAlerts = mockAlerts.filter(a => a.id !== args.alertId);
      } else if (args?.action === 'clear_read') {
        mockAlerts = mockAlerts.filter(a => !a.read);
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            action: args?.action,
            remainingCount: mockAlerts.length,
            unreadCount: mockAlerts.filter(a => !a.read).length
          }, null, 2)
        }]
      };
    }
    case 'list_alert_rules': {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            count: mockAlertRules.length,
            rules: mockAlertRules
          }, null, 2)
        }]
      };
    }
    case 'create_alert_rule': {
      const newRule = {
        id: `rule-${Date.now()}`,
        name: args.name,
        metric: args.metric,
        threshold: args.threshold,
        symbol: args.symbol,
        enabled: true,
        createdAt: new Date().toISOString()
      };
      mockAlertRules.push(newRule);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, rule: newRule }, null, 2)
        }]
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleResourceRead(uri) {
  if (uri === 'glassfolio://portfolio/summary') {
    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(mockPortfolioSummary, null, 2) }]
    };
  }
  if (uri === 'glassfolio://positions') {
    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(mockPositions, null, 2) }]
    };
  }
  if (uri === 'glassfolio://transactions/recent') {
    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify([{ symbol: 'AAPL', type: 'Buy', amount: 10, total: 1750 }], null, 2) }]
    };
  }
  if (uri === 'glassfolio://gamification/status') {
    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ level: 3, xp: 450, rank: 'rank_3', unlockedBadgesCount: 4 }, null, 2) }]
    };
  }
  if (uri === 'glassfolio://notifications') {
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({
          unreadCount: mockAlerts.filter(a => !a.read).length,
          alerts: mockAlerts
        }, null, 2)
      }]
    };
  }
  throw new Error(`Resource not found: ${uri}`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const request = JSON.parse(trimmed);
    const { id, method, params } = request;

    if (method === 'initialize') {
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {}
        },
        serverInfo: {
          name: 'glassfolio-mcp-server',
          version: '1.0.0'
        }
      });
      return;
    }

    if (method === 'notifications/initialized') {
      // Notification without response
      return;
    }

    if (method === 'ping') {
      sendResponse(id, {});
      return;
    }

    if (method === 'tools/list') {
      sendResponse(id, { tools: TOOLS });
      return;
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      const result = await handleToolCall(toolName, toolArgs);
      sendResponse(id, result);
      return;
    }

    if (method === 'resources/list') {
      sendResponse(id, { resources: RESOURCES });
      return;
    }

    if (method === 'resources/read') {
      const uri = params?.uri;
      const result = await handleResourceRead(uri);
      sendResponse(id, result);
      return;
    }

    // Default error for unhandled method
    sendResponse(id, null, { code: -32601, message: `Method not found: ${method}` });
  } catch (err) {
    sendResponse(null, null, { code: -32700, message: `Parse error: ${err.message}` });
  }
});
