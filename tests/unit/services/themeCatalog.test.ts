import { describe, it, expect } from 'vitest';
import { THEME_CATALOG, isThemeUnlocked, getThemeRequiredLevel } from '../../../src/constants/themeCatalog';

describe('Theme Catalog & Progression', () => {
    it('contains all supported application themes', () => {
        const themeKeys = THEME_CATALOG.map(t => t.key);
        expect(themeKeys).toContain('light');
        expect(themeKeys).toContain('night');
        expect(themeKeys).toContain('dark');
        expect(themeKeys).toContain('emerald');
        expect(themeKeys).toContain('cyber');
    });

    it('makes light and night themes available at level 1', () => {
        expect(getThemeRequiredLevel('light')).toBe(1);
        expect(getThemeRequiredLevel('night')).toBe(1);
        expect(isThemeUnlocked('light', 1)).toBe(true);
        expect(isThemeUnlocked('night', 1)).toBe(true);
    });

    it('locks dark theme until level 2', () => {
        expect(getThemeRequiredLevel('dark')).toBe(2);
        expect(isThemeUnlocked('dark', 1)).toBe(false);
        expect(isThemeUnlocked('dark', 2)).toBe(true);
    });

    it('locks emerald theme until level 6', () => {
        expect(getThemeRequiredLevel('emerald')).toBe(6);
        expect(isThemeUnlocked('emerald', 5)).toBe(false);
        expect(isThemeUnlocked('emerald', 6)).toBe(true);
    });

    it('locks cyber theme until level 15', () => {
        expect(getThemeRequiredLevel('cyber')).toBe(15);
        expect(isThemeUnlocked('cyber', 14)).toBe(false);
        expect(isThemeUnlocked('cyber', 15)).toBe(true);
    });
});
