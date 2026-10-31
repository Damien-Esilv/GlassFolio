/**
 * changelog.ts
 *
 * Release notes shown on the changelog page, newest first. Texts live in
 * locales/{en,fr}/changelog.json under `entries.<id>`.
 *
 * Rule (AGENTS.md, Git protocol): every merge into `main` adds an entry here and its EN + FR
 * texts in the same squashed commit. tests/unit/constants/changelog.test.ts checks the order,
 * the unique versions and the translations.
 */
export type ChangeKind = 'new' | 'improved';

export interface ChangelogHighlight {
  key: string;
  kind: ChangeKind;
}

export interface ChangelogEntry {
  /** Used in i18n keys and as the page anchor. */
  id: string;
  version: string;
  /** ISO 8601 date (YYYY-MM-DD). */
  date: string;
  highlights: readonly ChangelogHighlight[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    id: 'v1-0',
    version: '1.0',
    date: '2026-10-31',
    highlights: [
      { key: 'selfHostVault', kind: 'new' },
      { key: 'e2eEncryption', kind: 'new' },
      { key: 'multiAssets', kind: 'new' },
      { key: 'universalImport', kind: 'new' },
      { key: 'taxReporting', kind: 'new' },
      { key: 'animationHarmonization', kind: 'improved' },
      { key: 'assetAllocationExtensible', kind: 'new' },
      { key: 'smartNotifications', kind: 'improved' },
    ],
  },
  {
    id: 'v0-4',
    version: '0.4',
    date: '2026-10-15',
    highlights: [
      { key: 'mcpServer', kind: 'new' },
      { key: 'inAppCopilot', kind: 'new' },
      { key: 'productionCore', kind: 'improved' },
    ],
  },
  {
    id: 'v0-3',
    version: '0.3',
    date: '2026-08-05',
    highlights: [
      { key: 'feeAnalysis', kind: 'new' },
      { key: 'assetComparisons', kind: 'new' },
      { key: 'geographicBreakdown', kind: 'new' },
    ],
  },
  {
    id: 'v0-2',
    version: '0.2',
    date: '2026-03-01',
    highlights: [
      { key: 'gamificationHub', kind: 'new' },
      { key: 'achievements', kind: 'new' },
      { key: 'wealthDashboard', kind: 'improved' },
    ],
  },
  {
    id: 'v0-1',
    version: '0.1',
    date: '2026-01-15',
    highlights: [
      { key: 'corePortfolio', kind: 'new' },
      { key: 'marketPrices', kind: 'new' },
      { key: 'csvImport', kind: 'new' },
    ],
  },
];
