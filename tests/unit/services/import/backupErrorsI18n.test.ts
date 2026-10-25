import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf-8');
const CODES = [
  'unreadable', 'not_an_object', 'missing_data', 'prototype_pollution', 'invalid_collection',
  'checksum_mismatch', 'invalid_zip', 'unsupported_compression', 'crc_mismatch', 'zip_no_backup',
];

describe('backup import errors are translated, never hardcoded', () => {
  it.each(['fr', 'en'] as const)('has a message for every error code (%s)', (lang) => {
    const errors = JSON.parse(read(`locales/${lang}/settings.json`)).backupWizard.errors as Record<string, string>;
    CODES.forEach(code => expect(errors[code], `${lang}: ${code}`).toBeTruthy());
  });

  it('keeps French wording out of the restore services', () => {
    ['src/services/import/backupRestoreService.ts', 'src/services/import/zipReader.ts', 'src/services/import/backupIntegrity.ts']
      .forEach(file => expect(read(file), file).not.toMatch(/Impossible|invalide|Tentative|Structure de sauvegarde/));
  });
});
