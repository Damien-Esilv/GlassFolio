#!/usr/bin/env node
/**
 * Development runtime of the Woob worker (TGLA-239): `npm run woob:setup`.
 *
 * Creates `.woob-runtime/` (git-ignored) with a Python 3.11–3.13 virtual environment, the locked
 * dependencies (hashes checked), Woob at its pinned commit and every bank module of Woob.
 * `npm run dev` then finds it on its own. The desktop app and Docker build the same layout their way
 * (desktop/scripts/prepare-woob-runtime.mjs, docker/woob.Dockerfile).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bankModules, installWoobPackages, removeSeleniumManager } from './lib/woobRuntime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const companion = path.join(root, 'companions', 'woob');
const runtime = path.join(root, '.woob-runtime');
const source = JSON.parse(readFileSync(path.join(companion, 'woob-source.json'), 'utf8'));
const isWindows = process.platform === 'win32';

const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options });

function findPython() {
    const candidates = isWindows
        ? [['py', ['-3.12']], ['py', ['-3.13']], ['py', ['-3.11']], ['python', []]]
        : [['python3.12', []], ['python3.13', []], ['python3.11', []], ['python3', []]];
    for (const [command, prefix] of candidates) {
        try {
            const version = execFileSync(command, [...prefix, '-c', 'import sys;print("%d.%d" % sys.version_info[:2])'], { encoding: 'utf8' }).trim();
            if (['3.11', '3.12', '3.13'].includes(version)) return { command, prefix, version };
        } catch {
            // try the next one
        }
    }
    throw new Error('Python 3.11, 3.12 or 3.13 is required for the Woob worker in development (python3.12 recommended).');
}

const python = findPython();
console.log(`Woob runtime: using ${python.command} ${python.prefix.join(' ')} ${python.version}`);

rmSync(runtime, { recursive: true, force: true });
mkdirSync(runtime, { recursive: true });

const venv = path.join(runtime, 'venv');
run(python.command, [...python.prefix, '-m', 'venv', venv]);
const venvPython = path.join(venv, isWindows ? 'Scripts/python.exe' : 'bin/python');

run(venvPython, ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', '--require-hashes', '-r', path.join(companion, 'requirements.lock')]);

// Woob at the pinned commit: git checks the integrity of the fetched objects
const woobSource = path.join(runtime, 'woob-src');
run('git', ['init', '--quiet', woobSource]);
run('git', ['-C', woobSource, 'fetch', '--quiet', '--depth', '1', source.repository, source.commit]);
run('git', ['-C', woobSource, 'checkout', '--quiet', 'FETCH_HEAD']);
const fetched = execFileSync('git', ['-C', woobSource, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (fetched !== source.commit) throw new Error(`Woob commit mismatch: ${fetched}`);

// Pure-Python packages, copied as is: no build step, so nothing unpinned is downloaded
const sitePackages = execFileSync(venvPython, ['-I', '-c', "import sysconfig;print(sysconfig.get_paths()['purelib'])"], { encoding: 'utf8' }).trim();
// Every bank module of Woob and the modules they import (companions/woob/glassfolio_woob/catalog.py)
const moduleNames = bankModules(venvPython, woobSource);
installWoobPackages({ woobSource, companion, sitePackages, modules: path.join(runtime, 'woob-modules'), moduleNames, linkCompanion: true });
removeSeleniumManager(sitePackages);
const modules = path.join(runtime, 'woob-modules');
writeFileSync(path.join(runtime, 'woob-source.json'), JSON.stringify(source, null, 4));
rmSync(woobSource, { recursive: true, force: true });

if (!existsSync(venvPython)) throw new Error('Woob runtime incomplete');
const status = execFileSync(venvPython, ['-I', '-m', 'glassfolio_woob', 'status'], {
    encoding: 'utf8',
    env: { ...process.env, GLASSFOLIO_WOOB_MODULES: modules, GLASSFOLIO_WOOB_DATA: path.join(runtime, 'data') },
});
console.log(`Woob runtime ready in .woob-runtime/: ${status.trim()}`);
