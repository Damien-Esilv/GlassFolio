#!/usr/bin/env node
/**
 * Builds the Python runtime of the Woob bank worker shipped in the desktop installers (TGLA-238).
 *
 *   node desktop/scripts/prepare-woob-runtime.mjs --target mac-arm64 [--python <host python 3.12>]
 *
 * Output: desktop/.woob-runtime/<target>/ = python/ (python-build-standalone, SHA-256 checked), the locked
 * dependencies (hashes checked, ready-made wheels only, for the target platform: an arm64 Mac also
 * prepares the x64 one), Woob at its pinned commit, the GlassFolio worker and the shipped bank modules.
 * electron-builder copies it into the app resources (electron-builder.yml, `woob-runtime`).
 * Licences of Python and Woob go with it (companions/woob/LICENSES).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bankModules, installWoobPackages, removeSeleniumManager } from '../../scripts/lib/woobRuntime.mjs';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(desktopDir, '..');
const companion = path.join(root, 'companions', 'woob');
const manifest = JSON.parse(fs.readFileSync(path.join(desktopDir, 'woob-runtime.json'), 'utf8'));
const source = JSON.parse(fs.readFileSync(path.join(companion, 'woob-source.json'), 'utf8'));

const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
};
const hostTarget = `${process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux'}-${process.arch}`;
const targetName = argument('target', hostTarget);
const target = manifest.targets[targetName];
if (!target) throw new Error(`Unknown target ${targetName}: ${Object.keys(manifest.targets).join(', ')}`);
const hostPython = argument('python', process.platform === 'win32' ? 'python' : 'python3.12');

const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options });

// The host compiles the bytecode the shipped interpreter loads: same CPython minor version required
const hostVersion = execFileSync(hostPython, ['-c', 'import sys;print("%d.%d" % sys.version_info[:2])'], { encoding: 'utf8' }).trim();
if (hostVersion !== manifest.python.split('.').slice(0, 2).join('.')) {
  throw new Error(`--python must be CPython ${manifest.python.split('.').slice(0, 2).join('.')} (got ${hostVersion})`);
}
const output = path.join(desktopDir, '.woob-runtime', targetName);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'glassfolio-woob-runtime-'));

/** Locales kept in the translation data: the banks are French, the app speaks French and English. */
const KEPT_LOCALE = /^(root|en|fr)([_.-]|$)/i;

function removeMatching(dir, predicate) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (predicate(name)) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

export function pruneRuntime({ python, stdlib, sitePackages }) {
  for (const unused of ['test', 'idlelib', 'tkinter', 'turtledemo', 'ensurepip', 'lib2to3']) fs.rmSync(path.join(stdlib, unused), { recursive: true, force: true });
  removeMatching(path.join(stdlib, 'lib-dynload'), (name) => name.startsWith('_tkinter'));
  removeMatching(path.join(stdlib, '..'), (name) => /^(lib)?(tcl|tk|itcl|thread)\d/.test(name) || /^libtcl/.test(name) || name === 'pkgconfig');
  for (const folder of ['include', 'share', 'tcl']) fs.rmSync(path.join(python, folder), { recursive: true, force: true });
  removeMatching(python, (name) => /^(tcl|tk)\d.*\.dll$/i.test(name) || /^_tkinter/i.test(name));
  removeMatching(path.join(python, 'DLLs'), (name) => /^(tcl|tk)\d|^_tkinter/i.test(name));
  removeMatching(sitePackages, (name) => /^pip(-.*\.dist-info)?$/.test(name));
  fs.rmSync(path.join(sitePackages, 'lxml', 'includes'), { recursive: true, force: true });
  fs.rmSync(path.join(sitePackages, 'pycountry', 'tests'), { recursive: true, force: true });
  removeMatching(path.join(sitePackages, 'babel', 'locale-data'), (name) => name.endsWith('.dat') && !KEPT_LOCALE.test(name));
  removeMatching(path.join(sitePackages, 'pycountry', 'locales'), (name) => !KEPT_LOCALE.test(name));
}

async function download(url, sha256) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== sha256) throw new Error(`SHA-256 mismatch for ${url}: ${digest}`);
  // Saved next to where it is extracted: tar then gets relative paths only (Git Bash's GNU tar reads `C:\\…`
  // as a remote host on Windows)
  const file = path.join(output, 'python.tar.gz');
  fs.writeFileSync(file, bytes);
  return path.basename(file);
}

console.log(`Woob runtime for ${targetName}: CPython ${manifest.python}, Woob ${source.commit.slice(0, 12)}`);
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

// 1. Python itself (extracts to ./python)
const archive = await download(target.url, target.sha256);
run('tar', ['-xzf', archive], { cwd: output });
fs.rmSync(path.join(output, archive));
const sitePackages = targetName.startsWith('win')
  ? path.join(output, 'python', 'Lib', 'site-packages')
  : path.join(output, 'python', 'lib', `python${manifest.python.split('.').slice(0, 2).join('.')}`, 'site-packages');
fs.mkdirSync(sitePackages, { recursive: true });

// 2. Locked dependencies, as wheels for the target platform (no build step, so nothing runs at install time)
run(hostPython, [
  '-m', 'pip', 'install', '--disable-pip-version-check', '--no-deps', '--require-hashes', '--only-binary=:all:',
  ...target.platforms.flatMap((platform) => ['--platform', platform]),
  '--python-version', manifest.python.split('.').slice(0, 2).join('.'), '--implementation', 'cp',
  '--target', sitePackages, '-r', path.join(companion, 'requirements.lock'),
]);

// 3. Woob at its pinned commit (git checks the integrity of what it fetches), the worker, the bank modules
const woobSource = path.join(work, 'woob');
run('git', ['init', '--quiet', woobSource]);
run('git', ['-C', woobSource, 'fetch', '--quiet', '--depth', '1', source.repository, source.commit]);
run('git', ['-C', woobSource, 'checkout', '--quiet', 'FETCH_HEAD']);
const fetched = execFileSync('git', ['-C', woobSource, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (fetched !== source.commit) throw new Error(`Woob commit mismatch: ${fetched}`);
installWoobPackages({ woobSource, companion, sitePackages, modules: path.join(output, 'woob-modules'), moduleNames: bankModules(hostPython, woobSource) });
fs.writeFileSync(path.join(output, 'woob-source.json'), JSON.stringify(source, null, 4));
fs.cpSync(path.join(companion, 'LICENSES'), path.join(output, 'LICENSES'), { recursive: true });
fs.copyFileSync(path.join(woobSource, 'COPYING.LESSER'), path.join(output, 'LICENSES', 'woob-COPYING.LESSER'));

// 4. What the worker never uses: test suites, the Tk GUI toolkit, the package installer, C headers, and the
//    translations of languages other than French and English (Babel and pycountry carry ~50 MB of them)
pruneRuntime({ python: path.join(output, 'python'), stdlib: path.dirname(sitePackages), sitePackages });
removeSeleniumManager(sitePackages);

// 5. Bytecode compiled once, checked against nothing at run time ("unchecked-hash"): Python never rewrites a
//    file of the app (that would break the macOS signature) and starts faster. The host is CPython 3.12 too.
run(hostPython, ['-m', 'compileall', '-q', '-f', '-j', '0', '--invalidation-mode', 'unchecked-hash',
  path.dirname(sitePackages), path.join(output, 'woob-modules')]);

// 6. macOS: every binary signed ad hoc, as the app itself (no Apple Developer ID), so Apple Silicon runs it
if (targetName.startsWith('mac') && process.platform === 'darwin') {
  const binaries = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && (/\.(so|dylib)$/.test(entry.name) || (path.basename(dir) === 'bin' && /^python3/.test(entry.name)))) binaries.push(full);
    }
  };
  walk(path.join(output, 'python'));
  for (const binary of binaries) execFileSync('codesign', ['--force', '--sign', '-', binary], { stdio: 'ignore' });
  console.log(`Signed ${binaries.length} binaries ad hoc`);
}

// 7. A runtime this machine can run is checked right away
const interpreter = path.join(output, 'python', target.interpreter);
if (targetName === hostTarget) {
  const status = JSON.parse(execFileSync(interpreter, ['-I', '-B', '-m', 'glassfolio_woob', 'status'], {
    encoding: 'utf8',
    env: { ...process.env, GLASSFOLIO_WOOB_MODULES: path.join(output, 'woob-modules'), GLASSFOLIO_WOOB_DATA: path.join(work, 'data') },
  }));
  if (status.commit !== source.commit || status.banks.length === 0) throw new Error(`Woob runtime check failed: ${JSON.stringify(status)}`);
  console.log(`Runtime check: ${JSON.stringify(status)}`);
}
fs.rmSync(work, { recursive: true, force: true });
console.log(`Woob runtime ready in desktop/.woob-runtime/${targetName}`);
