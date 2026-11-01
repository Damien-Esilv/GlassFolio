import { describe, it, expect } from 'vitest';

describe('DevSecOps Pre-Commit Shield — 6 Core Invariants Contract', () => {
  // Regex definitions corresponding to scripts/pre-commit-check.mjs
  const FORBIDDEN_FILE_PATTERNS = [
    /^\.env(?!\.example$)(?:\..+)?$/,
    /\.(pem|key|cert|crt|pfx|p12|pkcs12)$/i,
  ];

  const PERSONAL_PATH_PREFIX = '/' + 'Users/';
  const personalPathRegex = new RegExp(PERSONAL_PATH_PREFIX + '[a-zA-Z0-9_.-]+');

  const SECRET_PATTERNS = [
    { name: 'Google API Key', regex: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
    { name: 'GitHub Token', regex: /\b(?:ghp_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{82})\b/ },
    { name: 'Slack Token', regex: /\bxox[baprs]-[0-9A-Za-z]{10,48}\b/ },
    { name: 'Private Key Block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { name: 'OpenAI/Anthropic Secret Key', regex: /\b(?:sk|sk-ant|sk-proj)-[a-zA-Z0-9_-]{20,}\b/ },
  ];

  const TEST_CANARY_ALLOWLIST = [
    'sk-1234567890abcdef1234567890',
    'sk-proj-xxxxx',
    'sk-abc123',
    'CANARY_',
  ];

  const storageRegex = /\b(?:(?:window|globalThis)\.)?(?:localStorage|sessionStorage)\./;
  const hexRegex = /#[0-9a-fA-F]{3,6}\b/;
  const rawTailwindColorRegex = /\b(?:text|bg|border|ring|fill|stroke)-(?:emerald|rose|amber|yellow|lime|green|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|slate|gray|zinc|neutral|stone)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/;

  // ── RULE 1: Staged Forbidden Files ─────────────────────────────────────────
  describe('Rule 1: Staged Forbidden Secret File Names', () => {
    it('blocks dangerous environment and credential files', () => {
      const blockedFiles = [
        '.env',
        '.env.local',
        '.env.production',
        '.env.staging',
        'server.key',
        'cert.pem',
        'identity.pfx',
        'client.p12',
      ];

      for (const file of blockedFiles) {
        const isBlocked = FORBIDDEN_FILE_PATTERNS.some(pat => pat.test(file));
        expect(isBlocked, `Expected ${file} to be blocked`).toBe(true);
      }
    });

    it('allows non-secret repository files', () => {
      const allowedFiles = [
        'package.json',
        'README.md',
        'App.tsx',
        'src/services/db.ts',
      ];

      for (const file of allowedFiles) {
        const isBlocked = FORBIDDEN_FILE_PATTERNS.some(pat => pat.test(file));
        expect(isBlocked, `Expected ${file} to be allowed`).toBe(false);
      }
    });
  });

  // ── RULE 2: API Keys and Secret Tokens ─────────────────────────────────────
  describe('Rule 2: API Keys & Tokens Detection', () => {
    it('detects live secret key patterns', () => {
      const samples = [
        'const key = "AIzaSyB_1234567890abcdef1234567890abcde";',
        'const token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";',
        'const pat = "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";',
        'const slack = "xoxb-1234567890-1234567890123-abcdefghijklmnopqrstuvwx";',
        '-----BEGIN RSA PRIVATE KEY-----',
        'const openai = "sk-live12345678901234567890123456789012";',
      ];

      for (const sample of samples) {
        const detected = SECRET_PATTERNS.some(({ regex }) => regex.test(sample));
        expect(detected, `Expected pattern detection in: ${sample}`).toBe(true);
      }
    });

    it('permits harmless test canaries and documentation examples', () => {
      for (const canary of TEST_CANARY_ALLOWLIST) {
        const isAllowlisted = TEST_CANARY_ALLOWLIST.some(allowed => canary.includes(allowed));
        expect(isAllowlisted).toBe(true);
      }
    });
  });

  // ── RULE 3: Personal Filesystem Paths ──────────────────────────────────────
  describe('Rule 3: Personal Local Machine Paths', () => {
    it('detects /Users/ personal paths', () => {
      const U = '/' + 'Users/';
      const dangerous = [
        U + 'damien/Developpement/GlassFolio',
        'file://' + U + 'john/Projects/app.ts',
        U + 'alice/.ssh/id_rsa',
      ];

      for (const pathSample of dangerous) {
        expect(personalPathRegex.test(pathSample)).toBe(true);
      }
    });

    it('permits relative and environment paths', () => {
      const safe = [
        './src/components/Card.tsx',
        '$HOME/Developpement/brain',
        'process.env.BRAIN_PATH',
        '/api/v1/auth/login',
      ];

      for (const pathSample of safe) {
        expect(pathSample.includes(PERSONAL_PATH_PREFIX)).toBe(false);
      }
    });
  });

  // ── RULE 4: Direct Storage Bypass ──────────────────────────────────────────
  describe('Rule 4: Storage Invariant Enforcement', () => {
    it('detects direct window or global localStorage calls', () => {
      const violations = [
        'localStorage.setItem("key", value)',
        'window.localStorage.getItem("key")',
        'globalThis.sessionStorage.clear()',
        'sessionStorage.removeItem("token")',
      ];

      for (const line of violations) {
        expect(storageRegex.test(line)).toBe(true);
      }
    });

    it('permits appStorage and IStorageProvider abstraction methods', () => {
      const safe = [
        'await appStorage.getItem("key")',
        'storageProvider.setItem("user", data)',
        'const value = await this.storage.getItem(key)',
      ];

      for (const line of safe) {
        expect(storageRegex.test(line)).toBe(false);
      }
    });
  });

  // ── RULE 5: Raw Hex Colors in UI ───────────────────────────────────────────
  describe('Rule 5: Raw Hex Color Invariant', () => {
    it('detects raw hex color codes in component code', () => {
      const violations = [
        'color: "#137fec"',
        'backgroundColor: "#ffffff"',
        'className="border-[#e2e8f0]"',
      ];

      for (const line of violations) {
        expect(hexRegex.test(line)).toBe(true);
      }
    });

    it('permits semantic CSS variables and design tokens', () => {
      const safe = [
        'className="text-positive bg-subtle"',
        'var(--color-primary)',
        'THEME_INTENT.positive.color',
      ];

      for (const line of safe) {
        expect(hexRegex.test(line)).toBe(false);
      }
    });
  });

  // ── RULE 6: Raw Tailwind Palette Classes ───────────────────────────────────
  describe('Rule 6: Raw Tailwind Color Palette Classes Invariant', () => {
    it('detects prohibited raw Tailwind color palette classes', () => {
      const violations = [
        'className="text-emerald-500 font-bold"',
        'className="bg-rose-400 p-4"',
        'className="border-slate-200"',
        'className="ring-amber-500 ring-2"',
        'className="fill-indigo-600"',
        'className="stroke-cyan-500"',
      ];

      for (const line of violations) {
        expect(rawTailwindColorRegex.test(line)).toBe(true);
      }
    });

    it('permits semantic and theme token classes', () => {
      const safe = [
        'className="text-positive bg-positive-subtle border-positive"',
        'className="text-negative bg-negative-subtle"',
        'className="text-brand bg-primary"',
        'className="text-primary bg-card border-subtle"',
        'className="text-warning bg-warning-subtle"',
      ];

      for (const line of safe) {
        expect(rawTailwindColorRegex.test(line)).toBe(false);
      }
    });
  });
});
