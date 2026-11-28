/**
 * Sample import files of `test-data/` (investments/history, investments/snapshots, investments/broker-exports,
 * bank), found by file name wherever they are filed, so tests do not break when the folders are reorganised.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../test-data');

const walk = (dir: string): string[] => readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
});

const INDEX = new Map(walk(ROOT).map(file => [basename(file), file]));

/** Absolute path of a sample file, by its name. */
export function testDataPath(name: string): string {
    const found = INDEX.get(basename(name));
    if (!found) throw new Error(`No sample file named ${name} in test-data/`);
    return found;
}

/** Content of a sample file, by its name. */
export const readTestData = (name: string): string => readFileSync(testDataPath(name), 'utf-8');

/** Names of the sample files of one folder of test-data/ (e.g. 'bank'). */
export const testDataFiles = (folder: string): string[] =>
    walk(join(ROOT, folder)).map(file => basename(file)).sort();
