/**
 * productFacts.ts
 *
 * Product figures advertised by the public showcase. They are plain constants so the showcase
 * bundle never imports the AI registry or the import engine; tests/unit/config/productFacts.test.ts
 * checks them against the real registries so the marketing copy cannot drift from the code.
 */

/** Tools registered by `registerAllStandardTools()` (in-app assistant + MCP clients). */
export const AI_TOOL_COUNT = 35;

export interface SupportedBroker {
  name: string;
  /** Lowercased, letters-only prefix of the matching `PRESET_PATTERNS` keys. */
  presetPrefix: string;
}

/** Brokers and exchanges whose CSV exports are auto-detected by the import wizard. */
export const SUPPORTED_BROKERS: readonly SupportedBroker[] = [
  { name: 'BoursoBank', presetPrefix: 'bourso' },
  { name: 'Trade Republic', presetPrefix: 'traderepublic' },
  { name: 'Binance', presetPrefix: 'binance' },
  { name: 'Kraken', presetPrefix: 'kraken' },
  { name: 'Bitget', presetPrefix: 'bitget' },
  { name: 'Coinbase', presetPrefix: 'coinbase' },
];

/** Themes offered to every visitor; the others are unlocked through progression. */
export const PUBLIC_THEME_IDS = ['light', 'dark', 'night'] as const;
export const UNLOCKABLE_THEME_COUNT = 2;

export const SUPPORTED_LANGUAGE_COUNT = 2;

/** Key-derivation iterations of the vault (mirrors PBKDF2_ITERATIONS in services/security/crypto). */
export const VAULT_PBKDF2_ITERATIONS = 600_000;
