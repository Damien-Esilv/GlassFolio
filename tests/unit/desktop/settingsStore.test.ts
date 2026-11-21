import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSettingsStore, DEFAULT_SETTINGS, sanitizeSettings } from '../../../desktop/lib/settingsStore.mjs';

describe('desktop settings store', () => {
  let dir = '';
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-settings-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts with automatic update checks on and no remembered port', () => {
    expect(createSettingsStore(path.join(dir, 's.json')).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists changes to disk and reads them back', () => {
    const file = path.join(dir, 'nested', 's.json');
    createSettingsStore(file).update({ autoUpdateCheck: false, port: 3791 });
    expect(createSettingsStore(file).get()).toMatchObject({ autoUpdateCheck: false, port: 3791 });
  });

  it('survives a corrupt or hand-edited file', () => {
    const file = path.join(dir, 's.json');
    fs.writeFileSync(file, '{not json');
    expect(createSettingsStore(file).get()).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ autoUpdateCheck: 'yes', port: '3790', window: { x: 1, y: 1, width: 10, height: 10 }, extra: 1 })).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid window bounds only', () => {
    expect(sanitizeSettings({ window: { x: 10.4, y: 20, width: 1200, height: 800, maximized: true } }).window).toEqual({ x: 10, y: 20, width: 1200, height: 800, maximized: true });
  });
});
