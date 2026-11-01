/**
 * Portfolio Page - Summary View
 * 
 * Finary-style portfolio overview with categories, accounts, and PnL.
 * Transactions view is now a separate page accessible from sidebar.
 */

import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import Button from '../components/Button';
import {
    Download,
    ChevronDown,
    ChevronRight,
    TrendingUp,
    Coins,
    Building2,
    ArrowUpRight,
    ArrowDownRight,
    Calendar,
    Wallet
} from 'lucide-react';
import { Position } from '../types';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/currency';
import { currencyService } from '../services/currencyService';
import { ASSET_CLASSES_CONFIG, ASSET_CLASSES, isAssetClassMatch, getAssetClassConfig } from '../constants/assetClasses';
import AnimatedCounter from '../components/AnimatedCounter';
import { TrendValue } from '../components/ui/TrendValue';
import { STAGGER_DELAY_MS } from '../constants/animations';

// ============================================================================
// TYPES
// ============================================================================

interface AccountGroup {
    id: string;
    name: string; // e.g., "PEA", "Spot Wallet"
    institution: string; // e.g., "BoursoBank", "Binance"
    positions: Position[];
    totalValue: number;
    totalGain: number;
}

interface CategoryGroup {
    id: string;
    name: string;
    icon: React.ElementType;
    color: string;
    accounts: AccountGroup[];
    totalValue: number;
    totalGain: number;
    allocation: number;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const Portfolio: React.FC = () => {
    const { t, i18n } = useTranslation('portfolio');
    const { positions: globalPositions } = useData();
    const { user } = useAuth();
    const prefCurrency = user?.preferences?.currency || 'USD';
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set([...ASSET_CLASSES, 'Other']));
    const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

    // Category configuration dynamically generated from ASSET_CLASSES_CONFIG + dynamic fallback
    const baseCategoryConfigs = useMemo(() => ASSET_CLASSES_CONFIG.map(ac => ({
        id: ac.id,
        name: t(`categories.${ac.i18nKey}`, { defaultValue: ac.id }),
        icon: ac.icon,
        color: ac.color,
        bgClass: ac.bgClass
    })), [t]);

    const typeLabels: Record<string, string> = {};
    ASSET_CLASSES_CONFIG.forEach(ac => {
        typeLabels[ac.id] = t(`categories.${ac.i18nKey}`, { defaultValue: ac.id });
    });
    typeLabels['Other'] = t('categories.other', { defaultValue: 'Autres actifs' });

    // Group positions by Category -> Account with base currency conversion
    const categories = useMemo(() => {
        const totalPortfolioValue = globalPositions.reduce((sum, p) => {
            const valInBase = currencyService.convertAmount(p.marketValue, p.currency || 'EUR', prefCurrency);
            return sum + valInBase;
        }, 0);

        // Check if any position does not match standard configs
        const hasUnmatchedPositions = globalPositions.some(p => 
            !ASSET_CLASSES_CONFIG.some(config => isAssetClassMatch(p.type, config.id))
        );

        const allConfigs = [...baseCategoryConfigs];
        if (hasUnmatchedPositions && !allConfigs.some(c => c.id === 'Other')) {
            const otherConfig = getAssetClassConfig('Other');
            allConfigs.push({
                id: 'Other',
                name: t(`categories.${otherConfig.i18nKey}`, { defaultValue: 'Autres actifs' }),
                icon: otherConfig.icon,
                color: otherConfig.color,
                bgClass: otherConfig.bgClass
            });
        }

        return allConfigs.map(config => {
            // 1. Filter positions for this category using robust matching
            const categoryPositions = globalPositions.filter(p => isAssetClassMatch(p.type, config.id));
            if (categoryPositions.length === 0) return null;

            // 2. Group by Account within this category
            const accountMap = new Map<string, Position[]>();

            categoryPositions.forEach(pos => {
                // Create a unique key for grouping
                const instName = pos.bankName || pos.source || t('fallback.other');
                const accName = pos.accountName || t('fallback.mainAccount');
                const key = `${instName}||${accName}`;

                if (!accountMap.has(key)) accountMap.set(key, []);
                accountMap.get(key)!.push(pos);
            });

            // 3. Build Account Groups
            const accounts: AccountGroup[] = [];
            accountMap.forEach((positions, key) => {
                const [instName, accName] = key.split('||');
                const accValue = positions.reduce((sum, p) => {
                    return sum + currencyService.convertAmount(p.marketValue, p.currency || 'EUR', prefCurrency);
                }, 0);
                const accGain = positions.reduce((sum, p) => {
                    return sum + currencyService.convertAmount(p.unrealizedPL, p.currency || 'EUR', prefCurrency);
                }, 0);

                accounts.push({
                    id: key,
                    name: accName,
                    institution: instName,
                    positions: positions.sort((a, b) => {
                        const valA = currencyService.convertAmount(a.marketValue, a.currency || 'EUR', prefCurrency);
                        const valB = currencyService.convertAmount(b.marketValue, b.currency || 'EUR', prefCurrency);
                        return valB - valA;
                    }),
                    totalValue: accValue,
                    totalGain: accGain
                });
            });

            // Sort accounts by value
            accounts.sort((a, b) => b.totalValue - a.totalValue);

            const catValue = accounts.reduce((sum, a) => sum + a.totalValue, 0);
            const catGain = accounts.reduce((sum, a) => sum + a.totalGain, 0);

            return {
                id: config.id,
                name: config.name,
                icon: config.icon,
                color: config.color,
                bgClass: config.bgClass,
                accounts,
                totalValue: catValue,
                totalGain: catGain,
                allocation: totalPortfolioValue > 0 ? (catValue / totalPortfolioValue) * 100 : 0
            } as CategoryGroup;
        }).filter(Boolean) as CategoryGroup[];

    }, [globalPositions, prefCurrency, t, baseCategoryConfigs]);

    // Calculate global totals
    const totalValue = categories.reduce((sum, cat) => sum + cat.totalValue, 0);
    const totalGain = categories.reduce((sum, cat) => sum + cat.totalGain, 0);
    const totalInvested = totalValue - totalGain;
    const gainPercent = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

    const toggleCategory = (id: string, e: React.MouseEvent) => {
        // Prevent event bubbling if clicking inside
        e.stopPropagation();
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAccount = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedAccounts(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Get current date formatted
    const today = new Date();
    const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-US';
    const formattedDate = today.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });

    return (
        <div className="space-y-6">
            {/* Hero Section - Large Value Display (Finary Style) */}
            <div className="bg-card rounded-2xl border border-border p-6 md:p-8">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-secondary text-sm mb-2">
                            <Calendar size={14} />
                            <span>{formattedDate}</span>
                        </div>
                        <div className="text-4xl md:text-5xl font-bold text-primary mb-3">
                            <AnimatedCounter value={totalValue} currency={prefCurrency} locale={locale} options={{ minimumFractionDigits: 0, maximumFractionDigits: 0 }} />
                        </div>
                        <div className="flex items-center gap-3">
                            <TrendValue
                                value={totalGain}
                                format="currency"
                                currency={prefCurrency}
                                locale={locale}
                                decimals={0}
                                showPlusSign
                                showIcon
                                iconSize={16}
                                className="text-sm font-semibold"
                                animated
                            />
                            <TrendValue
                                value={gainPercent}
                                format="percent"
                                decimals={2}
                                showPlusSign
                                className="text-sm font-semibold"
                                animated
                            />
                        </div>
                    </div>

                    <Link to="/import">
                        <Button className="flex items-center gap-2 bg-primary text-white hover:bg-primary/90">
                            <Download size={16} />
                            {t('common:buttons.import')}
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Breakdown Table */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold text-primary">{t('title')}</h2>
                        <p className="text-xs text-secondary">{t('summary.categoriesCount', { count: categories.length })}</p>
                    </div>
                </div>

                <div className="w-full text-sm">
                    {/* Header */}
                    <div className="grid grid-cols-12 px-6 py-3 bg-subtle border-b border-border text-xs text-secondary uppercase font-medium">
                        <div className="col-span-5">{t('table.category')}</div>
                        <div className="col-span-2 text-right">{t('table.allocation')}</div>
                        <div className="col-span-3 text-right">{t('table.value')}</div>
                        <div className="col-span-2 text-right">{t('table.pnl')}</div>
                    </div>

                    {/* Body */}
                    <div className="divide-y divide-border">
                        {categories.map((category, catIdx) => (
                            <React.Fragment key={category.id}>
                                {/* Level 1: Category Row */}
                                <div
                                    className="grid grid-cols-12 px-6 py-4 hover:bg-card-hover cursor-pointer transition-colors items-center animate-row-in"
                                    style={{ animationDelay: `${catIdx * STAGGER_DELAY_MS}ms`, animationFillMode: 'both' }}
                                    onClick={(e) => toggleCategory(category.id, e)}
                                >
                                    <div className="col-span-5 flex items-center gap-3">
                                        <button className="text-secondary hover:text-primary">
                                            {expandedCategories.has(category.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        </button>
                                        <div className={`w-3 h-3 rounded-full ${category.bgClass}`} />
                                        <category.icon className="text-secondary" size={18} />
                                        <span className="font-semibold text-primary">{category.name}</span>
                                    </div>
                                    <div className="col-span-2 text-right font-medium text-secondary">
                                        {category.allocation.toFixed(0)} %
                                    </div>
                                    <div className="col-span-3 text-right font-bold text-primary">
                                        {formatCurrency(category.totalValue, prefCurrency, locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </div>
                                    <div className="col-span-2 text-right">
                                        <div className={`font-semibold ${category.totalGain >= 0 ? 'text-success' : 'text-error'}`}>
                                            {category.totalGain >= 0 ? '+' : ''}{formatCurrency(category.totalGain, prefCurrency, locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </div>
                                    </div>
                                </div>

                                {/* Level 2: Account Rows */}
                                {expandedCategories.has(category.id) && category.accounts.map((account, accIdx) => (
                                    <React.Fragment key={account.id}>
                                        <div
                                            className="grid grid-cols-12 px-6 py-3 bg-subtle hover:bg-card-hover cursor-pointer transition-colors items-center border-l-4 border-l-transparent hover:border-l-primary animate-row-in"
                                            style={{ animationDelay: `${(catIdx * STAGGER_DELAY_MS) + (accIdx * STAGGER_DELAY_MS)}ms`, animationFillMode: 'both' }}
                                            onClick={(e) => toggleAccount(account.id, e)}
                                        >
                                            <div className="col-span-5 flex items-center gap-3 pl-8">
                                                <button className="text-secondary hover:text-primary">
                                                    {expandedAccounts.has(account.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </button>
                                                <div className="w-8 h-8 rounded bg-card shadow-sm flex items-center justify-center text-secondary border border-border">
                                                    {/* Attempt to show logo or initial */}
                                                    <span className="text-xs font-bold">{account.institution.slice(0, 2).toUpperCase()}</span>
                                                </div>
                                                <div>
                                                    <div className="font-medium text-primary text-sm">{account.name}</div>
                                                    <div className="text-xs text-secondary">{account.institution}</div>
                                                </div>
                                            </div>
                                            <div className="col-span-2 text-right text-sm text-secondary">
                                                {/* No allocation at account level usually, or relative to category? */}
                                            </div>
                                            <div className="col-span-3 text-right font-medium text-primary text-sm">
                                                {formatCurrency(account.totalValue, prefCurrency, locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                            </div>
                                            <div className="col-span-2 text-right text-sm">
                                                <div className={`${account.totalGain >= 0 ? 'text-success' : 'text-error'}`}>
                                                    {account.totalGain >= 0 ? '+' : ''}{formatCurrency(account.totalGain, prefCurrency, locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Level 3: Position Rows */}
                                        {expandedAccounts.has(account.id) && account.positions.map(pos => {
                                            const posCurr = pos.currency || 'EUR';
                                            const valInBase = currencyService.convertAmount(pos.marketValue, posCurr, prefCurrency);
                                            const gainInBase = currencyService.convertAmount(pos.unrealizedPL, posCurr, prefCurrency);
                                            const isForeign = posCurr.toUpperCase() !== prefCurrency.toUpperCase();

                                            return (
                                                <div key={pos.id} className="grid grid-cols-12 px-6 py-2 bg-subtle/50 items-center text-xs border-b border-border last:border-0 relative animate-fade-in">
                                                    <div className="col-span-5 flex items-center gap-3 pl-20">
                                                        <div className="w-6 h-6 rounded-full bg-border flex items-center justify-center text-[10px] font-bold text-secondary">
                                                            {pos.symbol.slice(0, 2)}
                                                        </div>
                                                        <div className="overflow-hidden">
                                                            <div className="font-medium text-primary truncate">{pos.instrument}</div>
                                                            <div className="text-secondary flex items-center gap-1.5">
                                                                <span>{pos.quantity.toLocaleString(locale, { maximumFractionDigits: 8 })} {pos.symbol}</span>
                                                                {isForeign && (
                                                                    <span className="text-[10px] px-1 py-0.2 rounded bg-subtle border border-border text-tertiary">
                                                                        {posCurr}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="col-span-2 text-right text-secondary">
                                                        {pos.quantity > 0 && (
                                                            <span className="bg-card px-1.5 py-0.5 rounded text-[10px] border border-border">
                                                                {typeLabels[pos.type] ?? pos.type}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="col-span-3 text-right font-medium text-primary">
                                                        {formatCurrency(valInBase, prefCurrency, locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                    </div>
                                                    <div className="col-span-2 text-right">
                                                        <div className={`${gainInBase >= 0 ? 'text-success/80' : 'text-error/80'}`}>
                                                            {gainInBase >= 0 ? '+' : ''}{formatCurrency(gainInBase, prefCurrency, locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}
                            </React.Fragment>
                        ))}
                    </div>

                    {categories.length === 0 && (
                        <div className="p-12 text-center text-secondary">
                            {t('emptyState', { defaultValue: 'Aucune position trouvée.' })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Portfolio;
