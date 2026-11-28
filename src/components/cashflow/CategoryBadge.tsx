/**
 * Category pill and merchant badge of the cash flow pages (colours from the cash flow palette).
 */
import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import type { MerchantLogo } from '../../services/cashflow/merchantLogos';
import { resolveCashflowCategory } from '../../constants/cashflowCategories';
import { merchantInitials } from '../../services/cashflow/text';
import type { CustomCashflowCategory } from '../../types/cashflow';

export const CategoryBadge: React.FC<{
    categoryId: string;
    name: string;
    customCategories?: readonly CustomCashflowCategory[];
    size?: 'sm' | 'md';
}> = ({ categoryId, name, customCategories = [], size = 'sm' }) => {
    const config = resolveCashflowCategory(categoryId, customCategories);
    const Icon = config.icon;
    const sizing = size === 'sm' ? 'text-xs px-2 py-0.5 gap-1' : 'text-sm px-2.5 py-1 gap-1.5';
    return (
        <span className={`inline-flex items-center rounded-full font-semibold max-w-full ${sizing} ${config.tokens.bgSubtle} ${config.tokens.text}`}>
            <Icon size={size === 'sm' ? 12 : 14} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{name}</span>
        </span>
    );
};

/** Whether brand logos are shown (cash flow setting "Merchant logos", on unless turned off). */
const MerchantLogosContext = createContext(true);
export const MerchantLogosProvider = MerchantLogosContext.Provider;

type LogoFinder = (label: string) => MerchantLogo | undefined;
let logoFinder: LogoFinder | null = null;
let logoLoading: Promise<void> | null = null;
const logoListeners = new Set<() => void>();

/** Loads the logo set once, on first need (its own chunk, outside the main bundle). */
function loadLogoFinder(): void {
    if (logoFinder || logoLoading) return;
    logoLoading = import('../../services/cashflow/merchantLogos')
        .then(module => {
            logoFinder = module.findMerchantLogo;
            logoListeners.forEach(listener => listener());
        })
        .catch(() => { logoLoading = null; });
}

const subscribeLogos = (listener: () => void): (() => void) => {
    logoListeners.add(listener);
    return () => { logoListeners.delete(listener); };
};
const currentLogoFinder = (): LogoFinder | null => logoFinder;

/** Dark glyph on a light brand colour, light glyph otherwise (relative luminance of the brand hex). */
function glyphColour(hex: string): string {
    const channel = (offset: number): number => {
        const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
    return luminance > 0.45 ? 'black' : 'white';
}

/**
 * The merchant's brand logo when it is known for sure (bundled Simple Icons, see merchantLogos.ts), otherwise its
 * initials on its category colour. Nothing is fetched: no merchant leaves the device.
 */
export const MerchantAvatar: React.FC<{
    label: string;
    categoryId: string;
    customCategories?: readonly CustomCashflowCategory[];
    size?: number;
}> = ({ label, categoryId, customCategories = [], size = 36 }) => {
    const logosOn = useContext(MerchantLogosContext);
    const finder = useSyncExternalStore(subscribeLogos, currentLogoFinder, currentLogoFinder);
    useEffect(() => { if (logosOn) loadLogoFinder(); }, [logosOn]);
    const logo = logosOn && finder ? finder(label) : undefined;
    if (logo) {
        return (
            <span
                aria-hidden="true"
                title={logo.title}
                className="inline-flex items-center justify-center rounded-full shrink-0 ring-1 ring-border"
                style={{ width: size, height: size, backgroundColor: `#${logo.hex}` }}
            >
                <svg viewBox="0 0 24 24" width={Math.round(size * 0.56)} height={Math.round(size * 0.56)} fill={glyphColour(logo.hex)}>
                    <path d={logo.path} />
                </svg>
            </span>
        );
    }
    const tokens = resolveCashflowCategory(categoryId, customCategories).tokens;
    return (
        <span
            aria-hidden="true"
            className={`inline-flex items-center justify-center rounded-full font-bold shrink-0 ${tokens.bgSubtle} ${tokens.text}`}
            style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
        >
            {merchantInitials(label)}
        </span>
    );
};

/** Coloured dot used in legends and lists. */
export const ColorDot: React.FC<{ cssVar: string; className?: string }> = ({ cssVar, className = '' }) => (
    <span aria-hidden="true" className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${className}`} style={{ backgroundColor: cssVar }} />
);
