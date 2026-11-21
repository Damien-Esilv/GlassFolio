import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createUpdateController, pickStrategy, UPDATE_STATUS } from '../../../desktop/lib/updateController.mjs';
import { signManifestBytes } from '../../../desktop/lib/updateManifest.mjs';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

const manifestFor = (version: string) => ({
  schema: 1,
  version,
  releaseDate: '2026-12-01T10:00:00.000Z',
  files: [
    { platform: 'mac', arch: 'arm64', kind: 'zip', name: 'GlassFolio-mac-arm64.zip', size: 10, sha512: 'a'.repeat(128) },
    { platform: 'win', arch: 'x64', kind: 'exe', name: 'GlassFolio-win-x64.exe', size: 10, sha512: 'b'.repeat(128) },
    { platform: 'linux', arch: 'x64', kind: 'appimage', name: 'GlassFolio-linux-x64.AppImage', size: 10, sha512: 'c'.repeat(128) },
  ],
});

/** Serves a signed manifest the way the GitHub release does. */
const releaseFetch = (version: string, { tamper = false, fail = false }: { tamper?: boolean; fail?: boolean } = {}) =>
  vi.fn(async (url: string) => {
    if (fail) throw new Error('offline');
    const bytes = Buffer.from(JSON.stringify(manifestFor(version)));
    if (url.endsWith('update-manifest.json.sig')) return new Response(signManifestBytes(bytes, privateKey));
    return new Response(tamper ? Buffer.from(JSON.stringify(manifestFor('9.9.9'))) : bytes);
  });

const controllerFor = (overrides: Record<string, unknown> = {}) => {
  const calls = { quit: vi.fn(), open: vi.fn(), stage: vi.fn(), apply: vi.fn() };
  const controller = createUpdateController({
    currentVersion: '1.0.1',
    platform: 'darwin',
    arch: 'arm64',
    isPackaged: true,
    publicKey,
    execPath: '/Applications/GlassFolio.app/Contents/MacOS/GlassFolio',
    pid: 4242,
    workRoot: '/tmp',
    fetchImpl: releaseFetch('1.1.0'),
    quitApp: calls.quit,
    openExternal: calls.open,
    deps: {
      canSwap: () => true,
      stageMacUpdate: calls.stage.mockResolvedValue({ newBundlePath: '/tmp/new/GlassFolio.app', workDir: '/tmp/new' }),
      applyMacUpdate: calls.apply,
    },
    ...overrides,
  });
  return { controller, calls };
};

describe('update strategy', () => {
  const base = { isPackaged: true, hasPublicKey: true, execPath: '/Applications/GlassFolio.app/Contents/MacOS/GlassFolio', appImage: '', canSwap: () => true };
  it('picks the installer path per platform', () => {
    expect(pickStrategy({ ...base, platform: 'win32' })).toBe('standard');
    expect(pickStrategy({ ...base, platform: 'linux', appImage: '/x.AppImage' })).toBe('standard');
    expect(pickStrategy({ ...base, platform: 'linux' })).toBe('manual');
    expect(pickStrategy({ ...base, platform: 'darwin' })).toBe('mac-guided');
  });

  it('falls back to the release page when the Mac app cannot be swapped, and disables updates without a key or in development', () => {
    expect(pickStrategy({ ...base, platform: 'darwin', canSwap: () => false })).toBe('manual');
    expect(pickStrategy({ ...base, platform: 'darwin', execPath: '/tmp/some-binary' })).toBe('manual');
    expect(pickStrategy({ ...base, platform: 'darwin', hasPublicKey: false })).toBe('disabled');
    expect(pickStrategy({ ...base, platform: 'darwin', isPackaged: false })).toBe('disabled');
  });
});

describe('update controller', () => {
  it('reports a newer signed release as available', async () => {
    const { controller } = controllerFor();
    expect((await controller.check({ manual: true })).status).toBe(UPDATE_STATUS.available);
    expect(controller.getState().version).toBe('1.1.0');
  });

  it('reports up to date when the release is not newer', async () => {
    const { controller } = controllerFor({ fetchImpl: releaseFetch('1.0.1') });
    expect((await controller.check({ manual: true })).status).toBe(UPDATE_STATUS.upToDate);
  });

  it('never offers an update whose manifest does not match its signature', async () => {
    const { controller } = controllerFor({ fetchImpl: releaseFetch('1.1.0', { tamper: true }) });
    const state = await controller.check({ manual: true });
    expect(state.status).toBe(UPDATE_STATUS.error);
    expect(state.errorCode).toBe('signature');
  });

  it('stays silent on a failed background check but reports a failed manual one', async () => {
    const background = controllerFor({ fetchImpl: releaseFetch('1.1.0', { fail: true }) });
    expect((await background.controller.check({ manual: false })).status).toBe(UPDATE_STATUS.idle);
    const manual = controllerFor({ fetchImpl: releaseFetch('1.1.0', { fail: true }) });
    expect((await manual.controller.check({ manual: true })).status).toBe(UPDATE_STATUS.error);
  });

  it('does nothing when updates are disabled', async () => {
    const fetchImpl = releaseFetch('1.1.0');
    const { controller } = controllerFor({ isPackaged: false, fetchImpl });
    expect((await controller.check({ manual: true })).status).toBe(UPDATE_STATUS.idle);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('downloads, swaps and restarts on a Mac install', async () => {
    const { controller, calls } = controllerFor();
    await controller.check({ manual: true });
    await controller.install();
    expect(calls.stage).toHaveBeenCalledTimes(1);
    expect(calls.apply).toHaveBeenCalledWith(expect.objectContaining({ pid: 4242, currentBundlePath: '/Applications/GlassFolio.app', newBundlePath: '/tmp/new/GlassFolio.app' }));
    expect(calls.quit).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe(UPDATE_STATUS.restarting);
  });

  it('keeps the user unstuck when the install fails', async () => {
    const { controller, calls } = controllerFor();
    calls.stage.mockRejectedValueOnce(Object.assign(new Error('bad'), { code: 'checksum' }));
    await controller.check({ manual: true });
    const state = await controller.install();
    expect(state.status).toBe(UPDATE_STATUS.error);
    expect(state.errorCode).toBe('checksum');
    expect(calls.quit).not.toHaveBeenCalled();
  });

  it('opens the release page for a manual strategy', async () => {
    const { controller, calls } = controllerFor({ execPath: '/tmp/odd/location', deps: { canSwap: () => false } });
    await controller.check({ manual: true });
    await controller.install();
    expect(calls.open).toHaveBeenCalledWith(expect.stringContaining('/releases/latest'));
  });

  it('hands Windows and Linux installs to electron-updater', async () => {
    const standardUpdater = { on: vi.fn(), checkForUpdates: vi.fn().mockResolvedValue(undefined), downloadUpdate: vi.fn().mockResolvedValue(undefined), quitAndInstall: vi.fn() };
    const { controller } = controllerFor({ platform: 'win32', arch: 'x64', standardUpdater });
    await controller.check({ manual: true });
    await controller.install();
    expect(standardUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(standardUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it('notifies subscribers of every state change', async () => {
    const { controller } = controllerFor();
    const seen: string[] = [];
    const unsubscribe = controller.subscribe((state: { status: string }) => seen.push(state.status));
    await controller.check({ manual: true });
    unsubscribe();
    expect(seen).toEqual([UPDATE_STATUS.checking, UPDATE_STATUS.available]);
  });
});
