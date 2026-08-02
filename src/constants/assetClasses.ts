import { TrendingUp, Coins, Building2, LucideIcon } from 'lucide-react';

export interface AssetClassConfig {
    id: string;              // Canonical ID (e.g. 'Equities', 'ETFs', 'Crypto', 'Cash')
    i18nKey: string;         // Translation key under portfolio:categories (e.g. 'equities', 'etfs', 'crypto', 'cash')
    icon: LucideIcon;        // Icon component
    color: string;           // Color key ('blue', 'violet', 'amber', 'emerald')
    hex: string;             // Hex color for SVG / Recharts charts ('#3b82f6', '#8b5cf6', '#f59e0b', '#10b981')
    bgClass: string;         // Tailwind background class ('bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500')
    textClass: string;       // Tailwind text class ('text-blue-500', 'text-violet-500', 'text-amber-500', 'text-emerald-500')
    matchingTypes: string[]; // Variations of position/instrument types that map to this asset class
}

export const ASSET_CLASSES_CONFIG: AssetClassConfig[] = [
    { 
        id: 'Equities', 
        i18nKey: 'equities', 
        icon: TrendingUp, 
        color: 'blue',
        hex: '#3b82f6',
        bgClass: 'bg-blue-500',
        textClass: 'text-blue-500',
        matchingTypes: ['Equities', 'Equity', 'stock', 'Stock', 'Action', 'Actions']
    },
    { 
        id: 'ETFs', 
        i18nKey: 'etfs', 
        icon: TrendingUp, 
        color: 'violet',
        hex: '#8b5cf6',
        bgClass: 'bg-violet-500',
        textClass: 'text-violet-500',
        matchingTypes: ['ETFs', 'ETF', 'etf']
    },
    { 
        id: 'Crypto', 
        i18nKey: 'crypto', 
        icon: Coins, 
        color: 'amber',
        hex: '#f59e0b',
        bgClass: 'bg-amber-500',
        textClass: 'text-amber-500',
        matchingTypes: ['Crypto', 'crypto', 'CryptoSpot', 'CryptoEarn']
    },
    { 
        id: 'Cash', 
        i18nKey: 'cash', 
        icon: Building2, 
        color: 'emerald',
        hex: '#10b981',
        bgClass: 'bg-emerald-500',
        textClass: 'text-emerald-500',
        matchingTypes: ['Cash', 'cash', 'Livret', 'Savings']
    }
];

export const DEFAULT_OTHER_CONFIG: AssetClassConfig = {
    id: 'Other',
    i18nKey: 'other',
    icon: Building2,
    color: 'slate',
    hex: '#64748b',
    bgClass: 'bg-slate-500',
    textClass: 'text-slate-500',
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


