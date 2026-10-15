import { TrendingUp, Coins, Building2, LucideIcon } from 'lucide-react';

export interface AssetClassConfig {
    id: string;              // Canonical ID (e.g. 'Equities', 'ETFs', 'Crypto', 'Cash')
    i18nKey: string;         // Translation key under portfolio:categories (e.g. 'equities', 'etfs', 'crypto', 'cash')
    icon: LucideIcon;        // Icon component
    color: string;           // Color key ('accent-blue', 'accent-purple', 'accent-amber', 'accent-green')
    hex: string;             // CSS Variable for SVG / Recharts charts (e.g. 'var(--color-accent-blue)')
    bgClass: string;         // Tailwind semantic background class ('bg-accent-blue/10', etc.)
    textClass: string;       // Tailwind semantic text class ('text-accent-blue', etc.)
    matchingTypes: string[]; // Variations of position/instrument types that map to this asset class
}

export const ASSET_CLASSES_CONFIG: AssetClassConfig[] = [
    { 
        id: 'Equities', 
        i18nKey: 'equities', 
        icon: TrendingUp, 
        color: 'accent-blue',
        hex: 'var(--color-accent-blue)',
        bgClass: 'bg-accent-blue/10',
        textClass: 'text-accent-blue',
        matchingTypes: ['Equities', 'Equity', 'stock', 'Stock', 'Action', 'Actions']
    },
    { 
        id: 'ETFs', 
        i18nKey: 'etfs', 
        icon: TrendingUp, 
        color: 'accent-purple',
        hex: 'var(--color-accent-purple)',
        bgClass: 'bg-accent-purple/10',
        textClass: 'text-accent-purple',
        matchingTypes: ['ETFs', 'ETF', 'etf']
    },
    { 
        id: 'Crypto', 
        i18nKey: 'crypto', 
        icon: Coins, 
        color: 'accent-amber',
        hex: 'var(--color-accent-amber)',
        bgClass: 'bg-accent-amber/10',
        textClass: 'text-accent-amber',
        matchingTypes: ['Crypto', 'crypto', 'CryptoSpot', 'CryptoEarn']
    },
    { 
        id: 'Cash', 
        i18nKey: 'cash', 
        icon: Building2, 
        color: 'accent-green',
        hex: 'var(--color-accent-green)',
        bgClass: 'bg-accent-green/10',
        textClass: 'text-accent-green',
        matchingTypes: ['Cash', 'cash', 'Livret', 'Savings']
    }
];

export const DEFAULT_OTHER_CONFIG: AssetClassConfig = {
    id: 'Other',
    i18nKey: 'other',
    icon: Building2,
    color: 'neutral',
    hex: 'var(--text-secondary)',
    bgClass: 'bg-subtle',
    textClass: 'text-secondary',
    matchingTypes: ['Other', 'other', 'RealEstate', 'Immobilier', 'Bond', 'Bonds', 'Commodity', 'Commodities']
};

export const ASSET_CLASSES = ASSET_CLASSES_CONFIG.map(c => c.id) as readonly string[];
export type AssetClass = typeof ASSET_CLASSES[number];

/**
 * Checks if a given position or transaction type string matches an asset class ID.
 */
export function isAssetClassMatch(positionType: string | undefined | null, assetClassId: string): boolean {
    if (!positionType) return false;
    if (positionType === assetClassId) return true;
    
    if (assetClassId === 'Other') {
        const matchesStandard = ASSET_CLASSES_CONFIG.some(config => 
            config.matchingTypes.some(t => t.toLowerCase() === positionType.toLowerCase()) ||
            config.id.toLowerCase() === positionType.toLowerCase()
        );
        return !matchesStandard;
    }

    const config = ASSET_CLASSES_CONFIG.find(c => c.id === assetClassId);
    if (!config) return positionType.toLowerCase() === assetClassId.toLowerCase();
    
    const posTypeLower = positionType.toLowerCase();
    return config.matchingTypes.some(t => t.toLowerCase() === posTypeLower);
}

/**
 * Returns the AssetClassConfig for a position type or asset class ID, with fallback for custom types.
 */
export function getAssetClassConfig(positionType: string | undefined | null): AssetClassConfig {
    if (!positionType) return DEFAULT_OTHER_CONFIG;
    const posTypeLower = positionType.toLowerCase();
    const found = ASSET_CLASSES_CONFIG.find(config => 
        config.id.toLowerCase() === posTypeLower ||
        config.matchingTypes.some(t => t.toLowerCase() === posTypeLower)
    );
    if (found) return found;

    return {
        ...DEFAULT_OTHER_CONFIG,
        id: positionType,
        i18nKey: positionType.toLowerCase()
    };
}

/**
 * Gets canonical AssetClass ID for any position type variation.
 */
export function getCanonicalAssetClass(positionType: string | undefined | null): string {
    if (!positionType) return 'Other';
    const config = getAssetClassConfig(positionType);
    return config ? config.id : positionType;
}


