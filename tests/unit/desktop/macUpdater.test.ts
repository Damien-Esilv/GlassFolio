import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { APP_ID } from '../../../desktop/lib/constants.mjs';
import { applyMacUpdate, canSwapBundle, resolveBundlePath, stageMacUpdate } from '../../../desktop/lib/macUpdater.mjs';

describe('macOS bundle location', () => {
  it('finds the .app from the executable path', () => {
    expect(resolveBundlePath('/Applications/GlassFolio.app/Contents/MacOS/GlassFolio')).toBe('/Applications/GlassFolio.app');
    expect(resolveBundlePath('/Volumes/Data/My Apps/GlassFolio.app/Contents/MacOS/GlassFolio')).toBe('/Volumes/Data/My Apps/GlassFolio.app');
    expect(resolveBundlePath('/usr/local/bin/node')).toBeNull();
  });

  it('refuses translocated, mounted-disk and read-only locations', () => {
    const writable = () => undefined;
    expect(canSwapBundle('/Applications/GlassFolio.app', writable)).toBe(true);
    expect(canSwapBundle('/private/var/folders/x/AppTranslocation/ABC/d/GlassFolio.app', writable)).toBe(false);
    expect(canSwapBundle('/Volumes/GlassFolio/GlassFolio.app', writable)).toBe(false);
    expect(
      canSwapBundle('/Applications/GlassFolio.app', () => {
        throw new Error('EACCES');
      }),
    ).toBe(false);
    expect(canSwapBundle(null, writable)).toBe(false);
  });
});

/** Real unpack and swap on a tiny fake bundle: needs the macOS tools (ditto, plutil, xattr). */
describe.runIf(process.platform === 'darwin')('macOS guided update (real swap on a fake bundle)', () => {
  let root = '';
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-macupdate-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const makeBundle = (parent: string, version: string, bundleId = APP_ID): string => {
    const bundle = path.join(parent, 'GlassFolio.app');
    fs.mkdirSync(path.join(bundle, 'Contents', 'MacOS'), { recursive: true });
    fs.writeFileSync(
      path.join(bundle, 'Contents', 'Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundleId}</string><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>\n`,
    );
    fs.writeFileSync(path.join(bundle, 'Contents', 'MacOS', 'GlassFolio'), `version ${version}`);
    return bundle;
  };

  const zipOf = (bundle: string): Buffer => {
    const zip = path.join(root, `${crypto.randomUUID()}.zip`);
    execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', bundle, zip]);
    return fs.readFileSync(zip);
  };

  const stage = (bytes: Buffer, version: string) =>
    stageMacUpdate({
      manifest: { version },
      file: { name: 'GlassFolio-mac-arm64.zip', size: bytes.length, sha512: crypto.createHash('sha512').update(bytes).digest('hex') },
      workRoot: root,
      fetchImpl: async () => new Response(bytes),
    });

  it('unpacks a verified zip into a bundle of the announced version', async () => {
    const staged = await stage(zipOf(makeBundle(fs.mkdtempSync(path.join(root, 'src-')), '1.1.0')), '1.1.0');
    expect(fs.readFileSync(path.join(staged.newBundlePath, 'Contents', 'MacOS', 'GlassFolio'), 'utf8')).toBe('version 1.1.0');
  });

  it('refuses a bundle with another version or another app identity', async () => {
    const other = zipOf(makeBundle(fs.mkdtempSync(path.join(root, 'src-')), '1.0.5'));
    await expect(stage(other, '1.1.0')).rejects.toThrow(/announced version/);
    const foreign = zipOf(makeBundle(fs.mkdtempSync(path.join(root, 'src-')), '1.1.0', 'com.example.other'));
    await expect(stage(foreign, '1.1.0')).rejects.toThrow(/announced version/);
  });

  it('replaces the installed app once the old process has exited, then relaunches it', async () => {
    const applications = fs.mkdtempSync(path.join(root, 'apps-'));
    const current = makeBundle(applications, '1.0.1');
    const staged = await stage(zipOf(makeBundle(fs.mkdtempSync(path.join(root, 'src-')), '1.1.0')), '1.1.0');

    const marker = path.join(root, 'relaunched');
    const launcher = path.join(root, 'launcher.sh');
    fs.writeFileSync(launcher, `#!/bin/sh\necho "$1" > "${marker}"\n`, { mode: 0o755 });
    const oldApp = spawn('/bin/sleep', ['1']);
    applyMacUpdate({ pid: oldApp.pid, currentBundlePath: current, newBundlePath: staged.newBundlePath, workDir: staged.workDir, launcher });

    await expect.poll(() => fs.existsSync(marker), { timeout: 8000, interval: 100 }).toBe(true);
    expect(fs.readFileSync(path.join(current, 'Contents', 'MacOS', 'GlassFolio'), 'utf8')).toBe('version 1.1.0');
    expect(fs.readFileSync(marker, 'utf8').trim()).toBe(current);
    expect(fs.existsSync(`${current}.previous`)).toBe(false);
    expect(fs.existsSync(staged.workDir)).toBe(false);
  });
});
