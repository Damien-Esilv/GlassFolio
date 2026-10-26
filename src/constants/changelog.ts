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
    id: 'v5-1',
    version: '5.1',
    date: '2026-10-26',
    highlights: [
      { key: 'showcase', kind: 'new' },
      { key: 'selfHostGuide', kind: 'new' },
      { key: 'pages', kind: 'new' },
      { key: 'aiLanguage', kind: 'improved' },
    ],
  },
  {
    id: 'v5-0',
    version: '5.0',
    date: '2026-10-25',
    highlights: [
      { key: 'cloud', kind: 'new' },
      { key: 'selfHosted', kind: 'new' },
      { key: 'signIn', kind: 'new' },
      { key: 'import', kind: 'improved' },
      { key: 'notifications', kind: 'new' },
      { key: 'privacy', kind: 'new' },
    ],
  },
  {
    id: 'v4-0',
    version: '4.0',
    date: '2026-10-09',
    highlights: [
      { key: 'mcp', kind: 'new' },
      { key: 'assistant', kind: 'new' },
    ],
  },
  {
    id: 'v2-0',
    version: '2.0',
    date: '2026-03-25',
    highlights: [
      { key: 'tax', kind: 'new' },
      { key: 'progress', kind: 'new' },
      { key: 'analytics', kind: 'improved' },
      { key: 'design', kind: 'improved' },
    ],
  },
  {
    id: 'v1-0',
    version: '1.0',
    date: '2026-01-31',
    highlights: [
      { key: 'dashboard', kind: 'new' },
      { key: 'import', kind: 'new' },
      { key: 'valuation', kind: 'new' },
    ],
  },
];
