import { describe, it, expect, beforeEach } from 'vitest';
import { aiToolRegistry } from '../../../src/services/ai/aiToolRegistry';
import { registerAllStandardTools } from '../../../src/services/ai/tools';
import { PRESET_PATTERNS } from '../../../src/services/import/presetDetector';
import { PBKDF2_ITERATIONS } from '../../../src/services/security/crypto';
import { THEME_CATALOG } from '../../../src/constants/themeCatalog';
import {
  AI_TOOL_COUNT,
  SUPPORTED_BROKERS,
  type SupportedBroker,
  PUBLIC_THEME_IDS,
  UNLOCKABLE_THEME_COUNT,
  SUPPORTED_LANGUAGE_COUNT,
  VAULT_PBKDF2_ITERATIONS,
} from '../../../src/constants/productFacts';
import { GITHUB_REPO_URL, DOCKER_QUICKSTART_COMMANDS, SELF_HOST_DEFAULT_URL } from '../../../src/config/project';

/**
 * The showcase advertises these numbers without importing the registries (bundle budget).
 * These tests fail as soon as a tool, broker preset or theme is added without updating the copy.
 */
describe('productFacts', () => {
  beforeEach(() => {
    aiToolRegistry.clear();
    registerAllStandardTools();
  });

  it('AI_TOOL_COUNT matches the registered AI / MCP tools', () => {
    expect(AI_TOOL_COUNT).toBe(aiToolRegistry.getAllTools().length);
  });

  it('every broker CSV preset belongs to an advertised broker, and every broker has a preset', () => {
    const presetKeys = Object.keys(PRESET_PATTERNS).filter((key) => key !== 'GlassFolio');
    const brokerOf = (key: string): SupportedBroker | undefined =>
      SUPPORTED_BROKERS.find((broker) => key.toLowerCase().replace(/[^a-z]/g, '').startsWith(broker.presetPrefix));
    for (const key of presetKeys) {
      expect(brokerOf(key), `preset ${key} has no advertised broker`).toBeDefined();
    }
    for (const broker of SUPPORTED_BROKERS) {
      expect(presetKeys.some((key) => brokerOf(key) === broker), `${broker.name} has no preset`).toBe(true);
    }
  });

  it('public and unlockable themes match the theme catalog', () => {
    const catalogKeys = THEME_CATALOG.map((theme) => theme.key);
    for (const key of PUBLIC_THEME_IDS) expect(catalogKeys).toContain(key);
    expect(PUBLIC_THEME_IDS.length + UNLOCKABLE_THEME_COUNT).toBe(THEME_CATALOG.length);
  });

  it('language count matches the bundled locales', () => {
    expect(SUPPORTED_LANGUAGE_COUNT).toBe(2);
  });

  it('vault iteration count mirrors the crypto module', () => {
    expect(VAULT_PBKDF2_ITERATIONS).toBe(PBKDF2_ITERATIONS);
  });
});

describe('project config', () => {
  it('points to the public GitHub repository', () => {
    expect(GITHUB_REPO_URL).toBe('https://github.com/Damien-Esilv/GlassFolio');
  });

  it('documents a Docker quick start that clones the repository and uses the guarded npm script', () => {
    expect(DOCKER_QUICKSTART_COMMANDS[0]).toBe(`git clone ${GITHUB_REPO_URL}.git`);
    expect(DOCKER_QUICKSTART_COMMANDS).toContain('npm run docker:up');
    expect(SELF_HOST_DEFAULT_URL).toBe('http://localhost:3000');
  });
});
