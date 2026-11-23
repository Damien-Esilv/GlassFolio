import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT } from '../../../desktop/lib/constants.mjs';
import { isAppUrl, isExternalOpenable, appUrl } from '../../../desktop/lib/navigation.mjs';
import { choosePort, isPortFree } from '../../../desktop/lib/ports.mjs';
import { buildServerEnv } from '../../../desktop/lib/serverEnv.mjs';
import { findWoobRuntime } from '../../../desktop/lib/woobRuntime.mjs';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareVersions, isNewerVersion, parseVersion } from '../../../desktop/lib/version.mjs';
import { messagesFor } from '../../../desktop/lib/messages.mjs';

describe('desktop port choice', () => {
  const busy = (...ports: number[]) => async (port: number) => !ports.includes(port);

  it('uses the remembered port first, to keep the origin (prefs, MCP configs) stable', async () => {
    expect(await choosePort({ remembered: 3795, isFree: busy() })).toBe(3795);
  });

  it('falls back to the default port, then the next ones, when a port is taken', async () => {
    expect(await choosePort({ isFree: busy() })).toBe(DEFAULT_PORT);
    expect(await choosePort({ isFree: busy(DEFAULT_PORT) })).toBe(DEFAULT_PORT + 1);
    expect(await choosePort({ remembered: 3795, isFree: busy(3795, DEFAULT_PORT) })).toBe(DEFAULT_PORT + 1);
  });

  it('ignores an invalid remembered port and gives up (null) when every candidate is taken', async () => {
    expect(await choosePort({ remembered: 80, isFree: busy() })).toBe(DEFAULT_PORT);
    expect(await choosePort({ remembered: -5, isFree: busy() })).toBe(DEFAULT_PORT);
    expect(await choosePort({ limit: 3, isFree: async () => false })).toBeNull();
  });

  it('detects a port that is really in use', async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as net.AddressInfo;
    expect(await isPortFree(port)).toBe(false);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await isPortFree(port)).toBe(true);
  });
});

describe('local server environment', () => {
  it('is loopback-only and carries no access token, demo flag or custom CSP from the parent process', () => {
    const env = buildServerEnv({
      port: 3790,
      dataDir: '/data',
      staticDir: '/dist',
      baseEnv: { PATH: '/bin', HOME: '/home/u', ACCESS_TOKEN: 'secret-secret-secret', GLASSFOLIO_DEMO: '1', CSP_CONNECT_SRC: 'https://evil.example', ALLOWED_HOSTS: 'evil.example' },
    });
    expect(env).toEqual({ PATH: '/bin', HOME: '/home/u', NODE_ENV: 'production', PORT: '3790', HOST: '127.0.0.1', DATA_DIR: '/data', STATIC_DIR: '/dist' });
  });

  it('points the server to the shipped Woob worker when the app has one (TGLA-238)', () => {
    const env = buildServerEnv({ port: 3790, dataDir: '/data', staticDir: '/dist', baseEnv: {}, woob: { python: '/res/woob-runtime/python/bin/python3', modules: '/res/woob-runtime/woob-modules' } });
    expect(env).toMatchObject({ GLASSFOLIO_WOOB_PYTHON: '/res/woob-runtime/python/bin/python3', GLASSFOLIO_WOOB_MODULES: '/res/woob-runtime/woob-modules' });
  });
});

describe('Woob runtime of the desktop app (TGLA-238)', () => {
  const touch = (file: string) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '');
  };

  it('uses the runtime in the app resources once packaged', () => {
    const resources = mkdtempSync(path.join(os.tmpdir(), 'gf-res-'));
    expect(findWoobRuntime({ resourcesRoot: resources, packaged: true, platform: 'darwin' })).toBeNull();
    touch(path.join(resources, 'woob-runtime/python/bin/python3'));
    mkdirSync(path.join(resources, 'woob-runtime/woob-modules'));
    expect(findWoobRuntime({ resourcesRoot: resources, packaged: true, platform: 'darwin' }))
      .toEqual({ python: path.join(resources, 'woob-runtime/python/bin/python3'), modules: path.join(resources, 'woob-runtime/woob-modules') });
    touch(path.join(resources, 'woob-runtime/python/python.exe'));
    expect(findWoobRuntime({ resourcesRoot: resources, packaged: true, platform: 'win32' })?.python).toBe(path.join(resources, 'woob-runtime/python/python.exe'));
  });

  it('from the repository, prefers a runtime prepared for the installers, then the development one', () => {
    const repo = mkdtempSync(path.join(os.tmpdir(), 'gf-repo-'));
    touch(path.join(repo, '.woob-runtime/venv/bin/python'));
    mkdirSync(path.join(repo, '.woob-runtime/woob-modules'));
    expect(findWoobRuntime({ resourcesRoot: repo, packaged: false, platform: 'linux', arch: 'x64' })?.python).toBe(path.join(repo, '.woob-runtime/venv/bin/python'));
    touch(path.join(repo, 'desktop/.woob-runtime/linux-x64/python/bin/python3'));
    mkdirSync(path.join(repo, 'desktop/.woob-runtime/linux-x64/woob-modules'));
    expect(findWoobRuntime({ resourcesRoot: repo, packaged: false, platform: 'linux', arch: 'x64' })?.python)
      .toBe(path.join(repo, 'desktop/.woob-runtime/linux-x64/python/bin/python3'));
  });
});

describe('window navigation rules', () => {
  it('only accepts the local server on localhost and the chosen port', () => {
    expect(isAppUrl('http://localhost:3790/portfolio', 3790)).toBe(true);
    expect(isAppUrl(appUrl(3791), 3791)).toBe(true);
    for (const url of ['http://localhost:3791/', 'http://127.0.0.1:3790/', 'https://localhost:3790/', 'http://evil.example:3790/', 'file:///etc/passwd', 'not a url']) {
      expect(isAppUrl(url, 3790)).toBe(false);
    }
  });

  it('lets only https and mailto links leave the app', () => {
    expect(isExternalOpenable('https://github.com/Damien-Esilv/GlassFolio')).toBe(true);
    expect(isExternalOpenable('mailto:someone@example.com')).toBe(true);
    for (const url of ['http://example.com', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hi', 'custom-scheme://x', 'nope']) {
      expect(isExternalOpenable(url)).toBe(false);
    }
  });
});

describe('version comparison', () => {
  it('orders releases and pre-releases like semver', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.1.0-rc.1', '1.1.0')).toBe(-1);
    expect(compareVersions('1.1.0-rc.2', '1.1.0-rc.10')).toBe(-1);
    expect(compareVersions('v2.0.0', '1.9.9')).toBe(1);
  });

  it('refuses invalid versions instead of guessing', () => {
    expect(parseVersion('1.0')).toBeNull();
    expect(parseVersion('latest')).toBeNull();
    expect(compareVersions('abc', '1.0.0')).toBeNull();
    expect(isNewerVersion('garbage', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.2', '1.0.1')).toBe(true);
  });
});

describe('native messages', () => {
  it('speaks French for French locales and English otherwise', () => {
    expect(messagesFor('fr-FR').startFailed).toContain('GlassFolio');
    expect(messagesFor('fr').portsBusy).toContain('port');
    expect(messagesFor('de').startFailed).toBe(messagesFor('en').startFailed);
  });
});
