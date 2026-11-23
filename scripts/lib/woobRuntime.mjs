/**
 * Shared by the Woob runtime builders (TGLA-236/238/239): copies Woob, the GlassFolio worker and the
 * shipped bank modules into a Python runtime. Tests and caches are left out.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skipped = new Set(['__pycache__', 'test', 'tests', '.pytest_cache']);

/** Copy filter: no test files, no bytecode caches. */
export const keepRuntimeFile = from => {
    const name = path.basename(from);
    return !skipped.has(name) && !name.startsWith('test_') && name !== 'test.py' && !name.endsWith('.pyc');
};

/**
 * `linkCompanion` (development): the runtime reads companions/woob through a .pth file, so edits to the
 * worker apply without running the setup again. Shipped runtimes get a copy.
 */
export function installWoobPackages({ woobSource, companion, sitePackages, modules, moduleNames, linkCompanion = false }) {
    cpSync(path.join(woobSource, 'woob'), path.join(sitePackages, 'woob'), { recursive: true, filter: keepRuntimeFile });
    if (linkCompanion) {
        writeFileSync(path.join(sitePackages, 'glassfolio_woob_dev.pth'), `${companion}\n`);
    } else {
        cpSync(path.join(companion, 'glassfolio_woob'), path.join(sitePackages, 'glassfolio_woob'), { recursive: true, filter: keepRuntimeFile });
    }
    mkdirSync(modules, { recursive: true });
    for (const name of moduleNames) {
        cpSync(path.join(woobSource, 'modules', name), path.join(modules, name), { recursive: true, filter: keepRuntimeFile });
    }
}

/** Bank modules of a Woob source and the modules they import, as companions/woob/glassfolio_woob/catalog.py lists them. */
export function bankModules(python, woobSource) {
    const catalog = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'companions', 'woob', 'glassfolio_woob', 'catalog.py');
    const names = execFileSync(python, [catalog, 'closure', path.join(woobSource, 'modules')], { encoding: 'utf8' })
        .split(/\r?\n/).map(name => name.trim()).filter(Boolean);
    if (names.length < 50) throw new Error(`Woob bank modules not found (${names.length})`);
    return names;
}

/**
 * Selenium ships `selenium-manager`, a program that downloads browsers and drivers when a page asks for one.
 * Woob's La Banque Postale module imports Selenium and tries a headless browser first: without the manager
 * that attempt fails at once and the module uses its classic login. Nothing is ever downloaded at run time.
 */
export function removeSeleniumManager(sitePackages) {
    const common = path.join(sitePackages, 'selenium', 'webdriver', 'common');
    if (!existsSync(common)) return;
    for (const name of readdirSync(common)) {
        const full = path.join(common, name);
        if (['macos', 'windows', 'linux-x86_64', 'linux-arm64', 'linux'].includes(name) || name.startsWith('selenium-manager')) {
            rmSync(full, { recursive: true, force: true });
        }
    }
}

