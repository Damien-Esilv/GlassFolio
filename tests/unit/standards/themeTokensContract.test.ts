import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  THEME_INTENT,
  getTrendTokens,
  CHART_SERIES_PALETTE,
  getComparisonSeriesTokens,
  getAssetStableColor,
} from '../../../src/constants/themeTokens';

describe('Theme Tokens Contract & HTML Synchronization', () => {
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

  describe('HTML & Tailwind CDN Synchronization Contract', () => {
    const indexPath = path.join(process.cwd(), 'index.html');
    const indexContent = fs.readFileSync(indexPath, 'utf-8');

    it('should declare all Business Intent CSS variables in index.html across all 3 themes', () => {
      const intentVars = [
        '--color-positive',
        '--color-negative',
        '--color-positive-subtle',
        '--color-negative-subtle',
        '--color-warning-subtle',
      ];

      // Extract sections for :root (Light), [data-theme='dark'] (Dark), and [data-theme='night'] (Midnight)
      const lightTheme = indexContent.match(/:root\s*\{([^}]+)\}/)?.[1] || '';
      const darkTheme = indexContent.match(/\[data-theme=['"]dark['"]\][^\{]*\{([^}]+)\}/)?.[1] || '';
      const nightTheme = indexContent.match(/\[data-theme=['"]night['"]\][^\{]*\{([^}]+)\}/)?.[1] || '';

      expect(lightTheme).toBeTruthy();
      expect(darkTheme).toBeTruthy();
      expect(nightTheme).toBeTruthy();

      intentVars.forEach((cssVar) => {
        expect(lightTheme, `Missing ${cssVar} in Light (:root)`).toContain(cssVar);
        expect(darkTheme, `Missing ${cssVar} in Dark ([data-theme='dark'])`).toContain(cssVar);
        expect(nightTheme, `Missing ${cssVar} in Midnight ([data-theme='night'])`).toContain(cssVar);
      });
    });

    it('should declare all 8 Chart Series CSS variables in index.html across all 3 themes', () => {
      const requiredAccentVars = CHART_SERIES_PALETTE.map((slot) => {
        return slot.cssVar.replace(/^var\(|\)$/g, '');
      });

      const lightTheme = indexContent.match(/:root\s*\{([^}]+)\}/)?.[1] || '';
      const darkTheme = indexContent.match(/\[data-theme=['"]dark['"]\][^\{]*\{([^}]+)\}/)?.[1] || '';
      const nightTheme = indexContent.match(/\[data-theme=['"]night['"]\][^\{]*\{([^}]+)\}/)?.[1] || '';

      requiredAccentVars.forEach((accentVar) => {
        expect(lightTheme, `Missing ${accentVar} in Light theme`).toContain(accentVar);
        expect(darkTheme, `Missing ${accentVar} in Dark theme`).toContain(accentVar);
        expect(nightTheme, `Missing ${accentVar} in Midnight theme`).toContain(accentVar);
      });
    });

    it('should configure extended semantic colors in tailwind.config inside index.html', () => {
      expect(indexContent).toMatch(/(['"])?positive\1\s*:\s*['"]var\(--color-positive\)['"]/);
      expect(indexContent).toMatch(/(['"])?negative\1\s*:\s*['"]var\(--color-negative\)['"]/);
      expect(indexContent).toMatch(/(['"])?positive-subtle\1\s*:\s*['"]var\(--color-positive-subtle\)['"]/);
      expect(indexContent).toMatch(/(['"])?negative-subtle\1\s*:\s*['"]var\(--color-negative-subtle\)['"]/);
      expect(indexContent).toMatch(/(['"])?warning-subtle\1\s*:\s*['"]var\(--color-warning-subtle\)['"]/);
    });
  });
});
