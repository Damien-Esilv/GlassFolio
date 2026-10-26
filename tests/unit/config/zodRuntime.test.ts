import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('zod runtime under a strict CSP', () => {
  it('declares jitless so zod never probes the Function constructor', async () => {
    const functionProbe = vi.spyOn(globalThis, 'Function');
    await import('../../../src/config/zodRuntime');
    const { z } = await import('zod');
    z.object({ a: z.string() }).parse({ a: 'x' });
    expect(z.core.globalConfig.jitless).toBe(true);
    // zod keeps a reference to Function when it probes: with jitless it must not construct one
    expect(functionProbe).not.toHaveBeenCalledWith('');
    functionProbe.mockRestore();
  });

  it('is the first import of the application entry point', () => {
    const main = readFileSync(join(process.cwd(), 'src/main.tsx'), 'utf-8');
    expect(main.trimStart().startsWith("import './config/zodRuntime';")).toBe(true);
  });
});
