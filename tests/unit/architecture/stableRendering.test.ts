import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..', '..', 'src');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });

const files = sourceFiles(SRC).map((file) => ({ path: relative(SRC, file), text: readFileSync(file, 'utf8') }));

describe('stable rendering across the site', () => {
  it('every counting number renders through StableNumber, so its box never resizes while it counts', () => {
    const counters = files.filter(
      ({ path, text }) =>
        /useCountUp\(/.test(text)
        && !path.endsWith('hooks/useCountUp.ts')
        && !path.endsWith('hooks/useCountUp.tsx'),
    );
    expect(counters.length).toBeGreaterThan(0);
    for (const { path, text } of counters) {
      expect(text, `${path} counts a number but does not render it with StableNumber`).toContain('StableNumber');
    }
  });

  it('no component is declared inside another component (it would be rebuilt, and its charts replayed, on every render)', () => {
    // An indented `const Name: React.FC…` or `const Name = ({ … }) =>` is a component defined in a function body.
    const nested = /^[ \t]{2,}const [A-Z][A-Za-z0-9]*(?:: React\.FC\b[^=]*)? = (?:React\.memo\(|\(\{|\(props\b)/m;
    const offenders = files.filter(({ text }) => nested.test(text)).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
