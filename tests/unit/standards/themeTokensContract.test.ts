import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  THEME_INTENT,
  getTrendTokens,
  CHART_SERIES_PALETTE,
  getComparisonSeriesTokens,
  getAssetStableColor,
  THEME_PALETTES,
} from '../../../src/constants/themeTokens';

describe('Theme Tokens Contract & HTML Synchronization (Critique 4 SSOT)', () => {
  describe('Business Intent Tokens Contract', () => {
    it('should define all 5 required business intent categories with complete token properties', () => {
      const requiredIntents = ['positive', 'negative', 'warning', 'neutral', 'brand'] as const;

      requiredIntents.forEach((intentKey) => {
        const tokenSet = THEME_INTENT[intentKey];
        expect(tokenSet).toBeDefined();
        expect(tokenSet.text).toBeTruthy();
        expect(tokenSet.bg).toBeTruthy();
        expect(tokenSet.bgSubtle).toBeTruthy();
        expect(tokenSet.border).toBeTruthy();
        expect(tokenSet.cssVar).toMatch(/^var\(--[\w-]+\)$/);
      });
    });

    it('should correctly map numeric financial deltas to intent tokens', () => {
      const positiveTokens = getTrendTokens(150.25);
      expect(positiveTokens).toEqual(THEME_INTENT.positive);

      const negativeTokens = getTrendTokens(-42.1);
      expect(negativeTokens).toEqual(THEME_INTENT.negative);

      const neutralTokens = getTrendTokens(0);
      expect(neutralTokens).toEqual(THEME_INTENT.neutral);
    });
  });

  describe('Categorical & Multi-Series Chart Palette Contract', () => {
    it('should provide exactly 8 distinct series slots with complete styling tokens', () => {
      expect(CHART_SERIES_PALETTE).toHaveLength(8);

      const ids = new Set<string>();
      const cssVars = new Set<string>();

      CHART_SERIES_PALETTE.forEach((slot, index) => {
        expect(slot.id).toBe(`series-${index + 1}`);
        expect(slot.cssVar).toMatch(/^var\(--color-accent-[\w-]+\)$/);
        expect(slot.text).toMatch(/^text-accent-[\w-]+$/);
        expect(slot.bg).toMatch(/^bg-accent-[\w-]+$/);
        expect(slot.bgSubtle).toMatch(/^bg-accent-[\w-]+\/10$/);
        expect(slot.border).toMatch(/^border-accent-[\w-]+$/);

        ids.add(slot.id);
        cssVars.add(slot.cssVar);
      });

      expect(ids.size).toBe(8);
      expect(cssVars.size).toBe(8);
    });

    it('should safely wrap indices using modulo 8 for comparison charts', () => {
      expect(getComparisonSeriesTokens(0)).toEqual(CHART_SERIES_PALETTE[0]);
      expect(getComparisonSeriesTokens(7)).toEqual(CHART_SERIES_PALETTE[7]);
      expect(getComparisonSeriesTokens(8)).toEqual(CHART_SERIES_PALETTE[0]);
      expect(getComparisonSeriesTokens(15)).toEqual(CHART_SERIES_PALETTE[7]);
      expect(getComparisonSeriesTokens(-1)).toEqual(CHART_SERIES_PALETTE[1]);
    });

    it('should deterministically assign stable colors for asset ticker symbols', () => {
      const cw8Color1 = getAssetStableColor('CW8.PA');
      const cw8Color2 = getAssetStableColor('CW8.PA');
      expect(cw8Color1).toEqual(cw8Color2);

      const wpeaColor1 = getAssetStableColor('WPEA.PA');
      const wpeaColor2 = getAssetStableColor('WPEA.PA');
      expect(wpeaColor1).toEqual(wpeaColor2);

      // Empty symbol fallback
      expect(getAssetStableColor('')).toEqual(CHART_SERIES_PALETTE[0]);
    });
  });

  describe('HTML & Tailwind CDN Synchronization Contract (SSOT)', () => {
    const indexPath = path.join(process.cwd(), 'index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf-8');

    function parseCssVars(block: string): Record<string, string> {
      const vars: Record<string, string> = {};
      const regex = /(--[\w-]+)\s*:\s*([^;]+);/g;
      let match;
      while ((match = regex.exec(block)) !== null) {
        vars[match[1].trim()] = match[2].trim();
      }
      return vars;
    }

    function toCssVarName(prop: string): string {
      const kebab = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
      return `--color-${kebab}`;
    }

    const lightBlock = indexContent.match(/:root\s*\{([^}]+)\}/)?.[1] || '';
    const darkBlock = indexContent.match(/\[data-theme=['"]dark['"]\][^\{]*\{([^}]+)\}/)?.[1] || '';
    const nightBlock = indexContent.match(/\[data-theme=['"]night['"]\][^\{]*\{([^}]+)\}/)?.[1] || '';

    const lightVars = parseCssVars(lightBlock);
    const darkVars = parseCssVars(darkBlock);
    const nightVars = parseCssVars(nightBlock);

    it('should extract CSS variables successfully for all 3 themes', () => {
      expect(Object.keys(lightVars).length).toBeGreaterThan(15);
      expect(Object.keys(darkVars).length).toBeGreaterThan(15);
      expect(Object.keys(nightVars).length).toBeGreaterThan(15);
    });

    it('should guarantee 100% of tokens in THEME_PALETTES exist and match in index.html across all 3 themes', () => {
      const themes = [
        { name: 'light', vars: lightVars, palette: THEME_PALETTES.light },
        { name: 'dark', vars: darkVars, palette: THEME_PALETTES.dark },
        { name: 'night', vars: nightVars, palette: THEME_PALETTES.night },
      ] as const;

      themes.forEach(({ name, vars, palette }) => {
        Object.entries(palette).forEach(([key, expectedValue]) => {
          const cssVarName = toCssVarName(key);
          const rawActual = vars[cssVarName];
          expect(rawActual, `Missing ${cssVarName} in theme ${name}`).toBeDefined();

          // Resolve alias if actual value is var(--another-var)
          let resolvedActual = rawActual;
          if (rawActual.startsWith('var(')) {
            const aliasedVar = rawActual.replace(/^var\(|\)$/g, '').trim();
            resolvedActual = vars[aliasedVar] || rawActual;
          }

          expect(
            resolvedActual.toLowerCase(),
            `Mismatch for ${cssVarName} in theme ${name}: expected ${expectedValue}, got ${resolvedActual}`
          ).toBe(expectedValue.toLowerCase());
        });
      });
    });

    it('should ensure brandStatic, brand, primary, and accent-blue all equal GlassFolio deep blue (#137fec)', () => {
      const authenticBlue = '#137fec';
      expect(THEME_PALETTES.light.primary).toBe(authenticBlue);
      expect(THEME_PALETTES.light.brand).toBe(authenticBlue);
      expect(THEME_PALETTES.light.brandStatic).toBe(authenticBlue);
      expect(THEME_PALETTES.light.accentBlue).toBe(authenticBlue);

      expect(THEME_PALETTES.dark.primary).toBe(authenticBlue);
      expect(THEME_PALETTES.dark.brand).toBe(authenticBlue);
      expect(THEME_PALETTES.dark.brandStatic).toBe(authenticBlue);
      expect(THEME_PALETTES.dark.accentBlue).toBe(authenticBlue);

      expect(THEME_PALETTES.night.primary).toBe(authenticBlue);
      expect(THEME_PALETTES.night.brand).toBe(authenticBlue);
      expect(THEME_PALETTES.night.brandStatic).toBe(authenticBlue);
      expect(THEME_PALETTES.night.accentBlue).toBe(authenticBlue);
    });

    it('should configure extended semantic colors in tailwind.config inside index.html', () => {
      expect(indexContent).toMatch(/(['"])?positive\1\s*:\s*['"]var\(--color-positive\)['"]/);
      expect(indexContent).toMatch(/(['"])?negative\1\s*:\s*['"]var\(--color-negative\)['"]/);
      expect(indexContent).toMatch(/(['"])?positive-subtle\1\s*:\s*['"]var\(--color-positive-subtle\)['"]/);
      expect(indexContent).toMatch(/(['"])?negative-subtle\1\s*:\s*['"]var\(--color-negative-subtle\)['"]/);
      expect(indexContent).toMatch(/(['"])?warning-subtle\1\s*:\s*['"]var\(--color-warning-subtle\)['"]/);
      expect(indexContent).toMatch(/(['"])?brand-static\1\s*:\s*['"]var\(--color-brand-static\)['"]/);
    });
  });
});
