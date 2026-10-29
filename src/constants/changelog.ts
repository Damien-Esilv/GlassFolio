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
    id: 'v1-1',
    version: '1.1',
    date: '2026-10-29',
    highlights: [
      { key: 'googleVault', kind: 'new' },
      { key: 'manualPrices', kind: 'improved' },
      { key: 'aiKeys', kind: 'improved' },
      { key: 'privacyNotice', kind: 'improved' },
    ],
  },
  {
    id: 'v1-0',
    version: '1.0',
    date: '2026-10-27',
    highlights: [
      { key: 'vault', kind: 'new' },
      { key: 'multiAssets', kind: 'new' },
      { key: 'importEngine', kind: 'new' },
      { key: 'taxAssistant', kind: 'new' },
      { key: 'aiAssistant', kind: 'new' },
      { key: 'selfHostAndCloud', kind: 'new' },
    ],
  },
];
