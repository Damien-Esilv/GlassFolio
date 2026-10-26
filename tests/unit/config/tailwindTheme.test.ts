import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../../../tailwind.config';
import { buildThemeColors, extractCssVariableNames } from '../../../src/config/tailwindTheme.mjs';

const root = process.cwd();
const stylesheet = readFileSync(join(root, 'src/index.css'), 'utf-8');

describe('Tailwind theme derived from src/index.css (E31 — TGLA-141)', () => {
  describe('extractCssVariableNames', () => {
    it('returns declared custom properties once, sorted, ignoring comments and var() uses', () => {
      const css = `
        /* --color-commented: red; */
        :root { --color-b: #000; --color-a: var(--color-b); }
        [data-theme='x'] { --color-a: #fff; --Text-Mixed: 1px; }
        .x { color: var(--color-never-declared); }
      `;
      expect(extractCssVariableNames(css)).toEqual(['--Text-Mixed', '--color-a', '--color-b']);
    });
  });

  describe('buildThemeColors', () => {
    it('maps each variable family to its Tailwind table', () => {
      const tables = buildThemeColors(`
        :root {
          --color-positive: #0f0; --color-accent-green: #0f0;
          --text-primary: #111; --bg-card: #fff; --border-strong: #999;
          --shadow-card: none; --font-size: 1px; --spacing: 2px;
        }`);
      expect(tables.colors).toEqual({ positive: 'var(--color-positive)', 'accent-green': 'var(--color-accent-green)' });
      expect(tables.textColor).toEqual({ primary: 'var(--text-primary)' });
      expect(tables.backgroundColor).toEqual({ card: 'var(--bg-card)' });
      expect(tables.borderColor).toEqual({ strong: 'var(--border-strong)', border: 'var(--border-subtle)' });
    });

    it('turns a variable added to the stylesheet into working utilities with no other change', async () => {
      const css = ':root { --color-ocean: #123456; --bg-panel: #abcdef; }';
      const result = await postcss([
        tailwindcss({
          content: [{ raw: '<i class="text-ocean bg-ocean border-ocean ring-ocean bg-panel"></i>' }],
          theme: { extend: buildThemeColors(css) },
        }),
      ]).process('@tailwind utilities;', { from: undefined });

      expect(result.css).toContain('.text-ocean');
      expect(result.css).toMatch(/\.text-ocean\s*\{[^}]*color:\s*var\(--color-ocean\)/);
      expect(result.css).toMatch(/\.bg-ocean\s*\{[^}]*background-color:\s*var\(--color-ocean\)/);
      expect(result.css).toMatch(/\.border-ocean\s*\{[^}]*border-color:\s*var\(--color-ocean\)/);
      expect(result.css).toMatch(/\.bg-panel\s*\{[^}]*background-color:\s*var\(--bg-panel\)/);
    });
  });

  describe('the real tailwind.config.ts', () => {
    const extend = (tailwindConfig.theme?.extend ?? {}) as Record<string, Record<string, string>>;

    it('exposes every color/text/bg/border variable declared in src/index.css', () => {
      const tableByPrefix: Record<string, string> = { color: 'colors', text: 'textColor', bg: 'backgroundColor', border: 'borderColor' };
      const variables = extractCssVariableNames(stylesheet).filter((name) => /^--(color|text|bg|border)-/.test(name));
      expect(variables.length).toBeGreaterThan(30);
      for (const variable of variables) {
        const [, prefix, name] = variable.match(/^--([a-z]+)-(.+)$/) as RegExpMatchArray;
        expect(extend[tableByPrefix[prefix]]?.[name], `${variable} is missing from the Tailwind theme`).toBe(`var(${variable})`);
      }
    });

    it('keeps the semantic utilities the app relies on', () => {
      const theme = resolveConfig(tailwindConfig).theme as unknown as Record<string, Record<string, string>>;
      expect(theme.textColor.primary).toBe('var(--text-primary)');
      expect(theme.textColor.secondary).toBe('var(--text-secondary)');
      expect(theme.textColor.positive).toBe('var(--color-positive)');
      expect(theme.textColor['accent-blue']).toBe('var(--color-accent-blue)');
      expect(theme.backgroundColor.canvas).toBe('var(--bg-canvas)');
      expect(theme.backgroundColor.card).toBe('var(--bg-card)');
      expect(theme.backgroundColor['brand-static']).toBe('var(--color-brand-static)');
      expect(theme.backgroundColor.primary).toBe('var(--color-primary)');
      expect(theme.borderColor.subtle).toBe('var(--border-subtle)');
      expect(theme.borderColor.border).toBe('var(--border-subtle)');
      expect(theme.colors['negative-subtle']).toBe('var(--color-negative-subtle)');
    });

    it('does not hand-list colors: they must be declared once, in src/index.css', () => {
      const source = readFileSync(join(root, 'tailwind.config.ts'), 'utf-8');
      expect(source).not.toMatch(/var\(--/);
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });

    it('resolves every themed variable in every theme block of the stylesheet', () => {
      // each theme must define the variables the utilities point to, or the class would render nothing
      const themeBlocks = [...stylesheet.matchAll(/(?:\[data-theme=['"]([a-z]+)['"]\][^{]*|:root\s*)\{([^}]+)\}/g)];
      expect(themeBlocks.length).toBeGreaterThanOrEqual(4);
      const rootBlock = themeBlocks.find((block) => block[1] === undefined)?.[2] ?? '';
      const baseVars = new Set(extractCssVariableNames(rootBlock));
      for (const [, theme, body] of themeBlocks) {
        if (!theme) continue;
        for (const variable of extractCssVariableNames(body)) {
          expect(baseVars.has(variable), `${variable} (theme ${theme}) has no base value in :root`).toBe(true);
        }
      }
    });
  });
});
