/**
 * Category pill and merchant badge of the cash flow pages (colours from the cash flow palette).
 */
import React from 'react';
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

/** Initials of the merchant on its category colour (logos come later, without sending merchants to a third party). */
export const MerchantAvatar: React.FC<{
    label: string;
    categoryId: string;
    customCategories?: readonly CustomCashflowCategory[];
    size?: number;
}> = ({ label, categoryId, customCategories = [], size = 36 }) => {
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
