/**
 * Theme Catalog & Progression Rules
 *
 * Centralized registry for all application visual themes and their progression/unlock levels.
 * Adding a new theme requires only a new entry in THEME_CATALOG and matching CSS variables in index.html.
 */

export type ThemeKey = 'light' | 'night' | 'dark' | 'emerald' | 'cyber';

export interface ThemeConfig {
    id: string;
    key: ThemeKey;
    nameKey: string;
    descriptionKey?: string;
    requiredLevel: number; // Level 1 is available out of the box
}

export const THEME_CATALOG: ThemeConfig[] = [
    {
        id: 'theme_light',
        key: 'light',
        nameKey: 'settings:preferences.light',
        requiredLevel: 1,
    },
    {
        id: 'theme_night',
        key: 'night',
        nameKey: 'settings:preferences.night',
        requiredLevel: 1,
    },
    {
        id: 'theme_dark',
        key: 'dark',
        nameKey: 'settings:preferences.dark',
        requiredLevel: 2,
    },
    {
        id: 'theme_emerald',
        key: 'emerald',
        nameKey: 'gamification:themes.emeraldPrestige',
        requiredLevel: 6,
    },
    {
        id: 'theme_cyber',
        key: 'cyber',
        nameKey: 'gamification:themes.cyberNeon',
        requiredLevel: 15,
    },
];

export function isThemeUnlocked(themeKey: ThemeKey, userLevel: number): boolean {
    const config = THEME_CATALOG.find(t => t.key === themeKey);
    if (!config) return true;
    return userLevel >= config.requiredLevel;
}

export function getThemeRequiredLevel(themeKey: ThemeKey): number {
    const config = THEME_CATALOG.find(t => t.key === themeKey);
    return config?.requiredLevel || 1;
}
