import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { THEME_CATALOG } from '../../../src/constants/themeCatalog';

/**
 * WCAG 2.1 Typography Contrast Audit across all 5 Themes in `src/index.css` (TGLA-212).
 *
 * Ensures every theme registered in `THEME_CATALOG` (`light`, `night`, `dark`, `emerald`, `cyber`)
 * defines `--bg-canvas`, `--bg-card`, `--bg-subtle`, `--text-primary`, `--text-secondary`, and
 * `--text-tertiary` with sufficient WCAG relative luminance contrast so text never becomes unreadable.
 */

function parseHexToRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const toLinear = (channel: number): number => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(parseHexToRgb(hexA));
  const lumB = relativeLuminance(parseHexToRgb(hexB));
  const brightest = Math.max(lumA, lumB);
  const darkest = Math.min(lumA, lumB);
  return (brightest + 0.05) / (darkest + 0.05);
}

function extractThemeVariables(cssContent: string): Record<string, Record<string, string>> {
  const blocks: Record<string, string> = {};

  const rootMatch = cssContent.match(/:root\s*\{([^}]+)\}/);
  if (rootMatch) blocks.light = rootMatch[1];

  for (const themeId of ['dark', 'night', 'emerald', 'cyber']) {
    const regex = new RegExp(`\\[data-theme=['"]${themeId}['"]\\][^{]*\\{([^}]+)\\}`);
    const match = cssContent.match(regex);
    if (match) blocks[themeId] = match[1];
  }

  const parsed: Record<string, Record<string, string>> = {};
  for (const [themeId, body] of Object.entries(blocks)) {
    parsed[themeId] = {};
    const varRegex = /(--[a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\b/g;
    let match: RegExpExecArray | null;
    while ((match = varRegex.exec(body)) !== null) {
      parsed[themeId][match[1]] = match[2];
    }
  }
  return parsed;
}

describe('5-Theme WCAG 2.1 Typography Contrast Invariants (TGLA-212)', () => {
  const cssPath = path.resolve(process.cwd(), 'src/index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  const themeVars = extractThemeVariables(cssContent);

  it('defines CSS token blocks for every theme in THEME_CATALOG', () => {
    for (const theme of THEME_CATALOG) {
      expect(themeVars[theme.key]).toBeDefined();
      expect(themeVars[theme.key]['--bg-canvas']).toBeTruthy();
      expect(themeVars[theme.key]['--bg-card']).toBeTruthy();
      expect(themeVars[theme.key]['--bg-subtle']).toBeTruthy();
      expect(themeVars[theme.key]['--text-primary']).toBeTruthy();
      expect(themeVars[theme.key]['--text-secondary']).toBeTruthy();
      expect(themeVars[theme.key]['--text-tertiary']).toBeTruthy();
    }
  });

  it.each(THEME_CATALOG.map((t) => t.key))(
    'enforces WCAG AA contrast (>= 4.5:1) for --text-primary and --text-secondary across surfaces in "%s" theme',
    (themeId) => {
      const vars = themeVars[themeId];
      for (const bgToken of ['--bg-canvas', '--bg-card'] as const) {
        const primaryRatio = contrastRatio(vars['--text-primary'], vars[bgToken]);
        const secondaryRatio = contrastRatio(vars['--text-secondary'], vars[bgToken]);

        expect(primaryRatio).toBeGreaterThanOrEqual(7.0); // AAA for primary text
        expect(secondaryRatio).toBeGreaterThanOrEqual(4.5); // AA for secondary text
      }
    }
  );

  it.each(THEME_CATALOG.map((t) => t.key))(
    'enforces readable contrast (>= 4.5:1 on card/canvas, >= 4.3:1 on subtle) for --text-tertiary in "%s" theme',
    (themeId) => {
      const vars = themeVars[themeId];
      expect(contrastRatio(vars['--text-tertiary'], vars['--bg-card'])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(vars['--text-tertiary'], vars['--bg-canvas'])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(vars['--text-tertiary'], vars['--bg-subtle'])).toBeGreaterThanOrEqual(4.3);
    }
  );
});
