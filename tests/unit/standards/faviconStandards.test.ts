import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Favicon & Search Engine Metadata Standards', () => {
  const root = process.cwd();
  const indexHtml = readFileSync(join(root, 'index.html'), 'utf-8');

  it('guarantees physical presence of favicon.ico at root', () => {
    const icoPath = join(root, 'public', 'favicon.ico');
    expect(existsSync(icoPath)).toBe(true);
    const icoBuffer = readFileSync(icoPath);
    // ICO header: 0x0000 (reserved), 0x0001 (type: icon), count >= 1
    expect(icoBuffer.readUInt16LE(0)).toBe(0);
    expect(icoBuffer.readUInt16LE(2)).toBe(1);
    const count = icoBuffer.readUInt16LE(4);
    expect(count).toBeGreaterThanOrEqual(3); // 16x16, 32x32, 48x48
  });

  it('guarantees physical presence of 48px square raster icon for Google Search compliance', () => {
    const png48Path = join(root, 'public', 'favicon-48x48.png');
    expect(existsSync(png48Path)).toBe(true);
    const pngBuffer = readFileSync(png48Path);
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(pngBuffer.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    // IHDR width and height at offset 16 and 20 (big endian)
    expect(pngBuffer.readUInt32BE(16)).toBe(48);
    expect(pngBuffer.readUInt32BE(20)).toBe(48);
  });

  it('guarantees index.html defines rel="icon" with favicon.ico and sizes="48x48" for search engine crawlers', () => {
    expect(indexHtml).toMatch(/<link\s+rel=["']icon["']\s+href=["']\/favicon\.ico["']\s+sizes=["']48x48["']\s*\/?>/i);
  });

  it('guarantees index.html defines rel="icon" with favicon.svg for modern browser tabs', () => {
    expect(indexHtml).toMatch(/<link\s+rel=["']icon["']\s+href=["']\/favicon\.svg["']\s+sizes=["']any["']\s+type=["']image\/svg\+xml["']\s*\/?>/i);
  });

  it('guarantees index.html defines rel="icon" with 48x48 PNG for Googlebot Image compliance', () => {
    expect(indexHtml).toMatch(/<link\s+rel=["']icon["']\s+type=["']image\/png["']\s+sizes=["']48x48["']\s+href=["']\/favicon-48x48\.png["']\s*\/?>/i);
  });
});
