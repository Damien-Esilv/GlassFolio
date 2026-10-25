/**
 * Import validation codes are translated through a dynamic key
 * (`common:errors.importValidation.<CODE>`), which the static i18n audit cannot see.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../../..');

const codesIn = (file: string): string[] =>
    [...readFileSync(resolve(ROOT, file), 'utf-8').matchAll(/code: '([A-Z_]+)'/g)].map(m => m[1]);

describe('import validation i18n', () => {
    it.each(['en', 'fr'])('every validation code has a %s message in common:errors.importValidation', lang => {
        const messages = JSON.parse(readFileSync(resolve(ROOT, `locales/${lang}/common.json`), 'utf-8')).errors.importValidation as Record<string, string>;
        const codes = new Set([
            ...codesIn('src/services/core/validationService.ts'),
            ...codesIn('src/services/import/snapshotService.ts'),
            'UNKNOWN',
        ]);
        expect([...codes].filter(code => !messages[code])).toEqual([]);
    });
});
