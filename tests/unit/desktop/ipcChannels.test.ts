import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), 'desktop', file), 'utf8');
const channels = (source: string): string[] => [...new Set(source.match(/'glassfolio:[a-z-]+'/g) ?? [])].sort();

describe('desktop IPC contract', () => {
  it('uses the same channel names in the preload and the main process', () => {
    expect(channels(read('preload.cjs'))).toEqual(channels(read('main.mjs')));
    expect(channels(read('preload.cjs')).length).toBeGreaterThanOrEqual(7);
  });

  it('exposes only the documented, frozen API to the page', () => {
    const preload = read('preload.cjs');
    expect(preload).toContain("exposeInMainWorld(\n  'glassfolioDesktop'");
    expect(preload).toContain('Object.freeze');
    expect(preload).not.toMatch(/ipcRenderer\s*[,}]\s*\)/); // never hand the raw ipcRenderer to the page
  });

  it('keeps the window locked down (isolation, sandbox, no node integration)', () => {
    const main = read('main.mjs');
    expect(main).toContain('contextIsolation: true');
    expect(main).toContain('sandbox: true');
    expect(main).toContain('nodeIntegration: false');
    expect(main).toContain('fromApp(event)');
  });
});
