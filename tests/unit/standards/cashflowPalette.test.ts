import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    CASHFLOW_CATEGORY_PALETTE,
    CASHFLOW_INCOME_PALETTE,
    CASHFLOW_RAMP,
    CASHFLOW_ROLE_TOKENS,
    getCashflowRampTokens,
} from '../../../src/constants/cashflowPalette';
import { CASHFLOW_CATEGORIES, getCashflowCategoryTokens } from '../../../src/constants/cashflowCategories';

/**
 * Cash flow palette contract (TGLA-247): every `--color-cashflow-*` variable exists in the 5 themes,
 * stays readable as a chart colour on the cards (WCAG 1.4.11, 3:1), neighbouring slots stay apart,
 * and the ramp goes one way in lightness.
 */

const css = fs.readFileSync(path.resolve(__dirname, '../../../src/index.css'), 'utf-8');

const THEMES = ['light', 'dark', 'night', 'emerald', 'cyber'] as const;

function themeBlocks(): Record<string, Record<string, string>> {
    const bodies: Record<string, string> = {};
    const root = css.match(/:root\s*\{([^}]+)\}/);
    if (root) bodies.light = root[1];
    for (const theme of THEMES.slice(1)) {
        const match = css.match(new RegExp(`\\[data-theme=['"]${theme}['"]\\][^{]*\\{([^}]+)\\}`));
        if (match) bodies[theme] = match[1];
    }
    const parsed: Record<string, Record<string, string>> = {};
    for (const [theme, body] of Object.entries(bodies)) {
        parsed[theme] = {};
        for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) parsed[theme][m[1]] = m[2].trim();
    }
    return parsed;
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex: string): [number, number, number] => {
    const clean = hex.replace('#', '');
    return [0, 2, 4].map(i => parseInt(clean.slice(i, i + 2), 16) / 255) as [number, number, number];
};
const luminance = (hex: string): number => {
    const [r, g, b] = rgb(hex).map(toLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
};
const oklab = (hex: string): [number, number, number] => {
    const [r, g, b] = rgb(hex).map(toLinear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
};
const distance = (a: string, b: string): number => {
    const p = oklab(a);
    const q = oklab(b);
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

const varName = (cssVar: string): string => cssVar.replace(/^var\((--[\w-]+)\)$/, '$1');

const CLASS_TOKENS = [
    ...Object.values(CASHFLOW_ROLE_TOKENS),
    ...CASHFLOW_CATEGORY_PALETTE,
    ...CASHFLOW_INCOME_PALETTE,
];
const ALL_TOKENS: ReadonlyArray<{ id: string; cssVar: string }> = [...CLASS_TOKENS, ...CASHFLOW_RAMP];

describe('Cash flow palette (TGLA-247)', () => {
    const blocks = themeBlocks();

    it('parses the 5 theme blocks', () => {
        expect(Object.keys(blocks).sort()).toEqual([...THEMES].sort());
    });

    it('has 7 roles, 16 categories, 4 income shades and a 7-step ramp', () => {
        expect(Object.keys(CASHFLOW_ROLE_TOKENS)).toHaveLength(7);
        expect(CASHFLOW_CATEGORY_PALETTE).toHaveLength(16);
        expect(CASHFLOW_INCOME_PALETTE).toHaveLength(4);
        expect(CASHFLOW_RAMP).toHaveLength(7);
    });

    it('points every token at a --color-cashflow-* variable with matching class names', () => {
        for (const token of ALL_TOKENS) expect(varName(token.cssVar)).toMatch(/^--color-cashflow-[a-z0-9-]+$/);
        for (const token of CLASS_TOKENS) {
            const suffix = varName(token.cssVar).replace('--color-', '');
            expect(token.text).toBe(`text-${suffix}`);
            expect(token.bgSubtle).toBe(`bg-${suffix}/10`);
        }
    });

    it.each(THEMES)('declares every cash flow colour in the %s theme as a hex value', theme => {
        for (const token of ALL_TOKENS) {
            const value = blocks[theme][varName(token.cssVar)];
            expect(value, `${theme} ${token.cssVar}`).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
    });

    it.each(THEMES)('keeps every colour at 3:1 or more on the cards of the %s theme', theme => {
        const card = blocks[theme]['--bg-card'];
        for (const token of ALL_TOKENS) {
            const value = blocks[theme][varName(token.cssVar)];
            expect(contrast(value, card), `${theme} ${token.cssVar} on ${card}`).toBeGreaterThanOrEqual(3);
        }
    });

    it.each(THEMES)('keeps neighbouring category slots apart in the %s theme', theme => {
        for (const family of [CASHFLOW_CATEGORY_PALETTE, CASHFLOW_INCOME_PALETTE]) {
            for (let i = 1; i < family.length; i++) {
                const a = blocks[theme][varName(family[i - 1].cssVar)];
                const b = blocks[theme][varName(family[i].cssVar)];
                expect(distance(a, b), `${theme} ${family[i - 1].id} vs ${family[i].id}`).toBeGreaterThan(0.08);
            }
        }
        const cats = CASHFLOW_CATEGORY_PALETTE.map(t => blocks[theme][varName(t.cssVar)]);
        expect(new Set(cats).size).toBe(cats.length);
    });

    it.each(THEMES)('orders the ramp from light to dark in the %s theme', theme => {
        const lightness = CASHFLOW_RAMP.map(t => oklab(blocks[theme][varName(t.cssVar)])[0]);
        for (let i = 1; i < lightness.length; i++) expect(lightness[i]).toBeLessThan(lightness[i - 1]);
    });

    it('gives every built-in category a palette colour, sub-categories their parent family', () => {
        for (const category of CASHFLOW_CATEGORIES) {
            expect(CLASS_TOKENS).toContain(category.tokens);
        }
        expect(getCashflowCategoryTokens('donations')).toBe(getCashflowCategoryTokens('gifts_donations'));
        expect(getCashflowCategoryTokens('unknown-id')).toBe(getCashflowCategoryTokens('other_expense'));
        expect(getCashflowCategoryTokens('custom', [{ id: 'custom', ownerId: 'u', parentId: 'housing', name: 'Garage', createdAt: '', updatedAt: '' }]))
            .toBe(getCashflowCategoryTokens('housing'));
    });

    it('clamps ramp indexes', () => {
        expect(getCashflowRampTokens(-3)).toBe(CASHFLOW_RAMP[0]);
        expect(getCashflowRampTokens(99)).toBe(CASHFLOW_RAMP[6]);
    });
});
