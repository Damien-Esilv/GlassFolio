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
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['stocks', 'crypto', 'cash']));
    const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

    // Category configuration
    const categoryConfig = [
        { id: 'stocks', name: t('categories.stocks'), icon: TrendingUp, color: 'blue', types: ['Equity', 'ETF'] },
        { id: 'crypto', name: t('categories.crypto'), icon: Coins, color: 'purple', types: ['Crypto'] },
        { id: 'cash', name: t('categories.cash'), icon: Building2, color: 'emerald', types: ['Cash'] },
    ];

    const typeLabels: Record<string, string> = {
        Equity: t('types.equity'),
        ETF: t('types.etf'),
        Crypto: t('types.crypto'),
        Cash: t('types.cash')
    };

    // Group positions by Category -> Account
    const categories = useMemo(() => {
        const totalPortfolioValue = globalPositions.reduce((sum, p) => sum + p.marketValue, 0);

        return categoryConfig.map(config => {
            // 1. Filter positions for this category
            const categoryPositions = globalPositions.filter(p => config.types.includes(p.type));
            if (categoryPositions.length === 0) return null;

            // 2. Group by Account within this category
            const accountMap = new Map<string, Position[]>();

            categoryPositions.forEach(pos => {
                // Create a unique key for grouping
                // Use accountName if available, otherwise assume a default account for the source
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
                const accValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
                const accGain = positions.reduce((sum, p) => sum + p.unrealizedPL, 0);

                accounts.push({
                    id: key,
                    name: accName,
                    institution: instName,
                    positions: positions.sort((a, b) => b.marketValue - a.marketValue),
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
                accounts,
                totalValue: catValue,
                totalGain: catGain,
                allocation: totalPortfolioValue > 0 ? (catValue / totalPortfolioValue) * 100 : 0
            } as CategoryGroup;
        }).filter(Boolean) as CategoryGroup[];

    }, [globalPositions]);

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
                            {formatCurrency(totalValue, prefCurrency, locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${totalGain >= 0
                                ? 'bg-emerald-500/10 text-success'
                                : 'bg-red-500/10 text-error'
                                }`}>
                                {totalGain >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                                {totalGain >= 0 ? '+' : ''}{formatCurrency(totalGain, prefCurrency, locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                            <span className={`text-sm font-medium ${gainPercent >= 0 ? 'text-success' : 'text-error'
                                }`}>
                                {gainPercent >= 0 ? '+' : ''}{gainPercent.toFixed(2)}%
                            </span>
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

            {/* Categories Table */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                        <h2 className="text-lg font-bold text-primary">{t('summary.assets')}</h2>
                    <div className="text-sm text-secondary">
                        {t('summary.categoriesCount', { count: categories.length })}
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
                        {categories.map(category => (
                            <React.Fragment key={category.id}>
                                {/* Level 1: Category Row */}
                                <div
                                    className="grid grid-cols-12 px-6 py-4 hover:bg-card-hover cursor-pointer transition-colors items-center"
                                    onClick={(e) => toggleCategory(category.id, e)}
                                >
                                    <div className="col-span-5 flex items-center gap-3">
                                        <button className="text-secondary hover:text-primary">
                                            {expandedCategories.has(category.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        </button>
                                        <div className={`w-3 h-3 rounded-full ${category.color === 'blue' ? 'bg-blue-500' : category.color === 'purple' ? 'bg-purple-500' : 'bg-emerald-500'}`} />
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
                                {expandedCategories.has(category.id) && category.accounts.map(account => (
                                    <React.Fragment key={account.id}>
                                        <div
                                            className="grid grid-cols-12 px-6 py-3 bg-subtle hover:bg-card-hover cursor-pointer transition-colors items-center border-l-4 border-l-transparent hover:border-l-primary"
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
                                        {expandedAccounts.has(account.id) && account.positions.map(pos => (
                                            <div key={pos.id} className="grid grid-cols-12 px-6 py-2 bg-subtle/50 items-center text-xs border-b border-border last:border-0 relative">
                                                {/* Vertical line connector visualization can be added here with CSS if needed */}
                                                <div className="col-span-5 flex items-center gap-3 pl-20">
                                                    <div className="w-6 h-6 rounded-full bg-border flex items-center justify-center text-[10px] font-bold text-secondary">
                                                        {pos.symbol.slice(0, 2)}
                                                    </div>
                                                    <div className="overflow-hidden">
                                                        <div className="font-medium text-primary truncate">{pos.instrument}</div>
                                                        <div className="text-secondary">{pos.quantity.toLocaleString()} {pos.symbol}</div>
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
                                                    {formatCurrency(pos.marketValue, pos.currency, locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                </div>
                                                <div className="col-span-2 text-right">
                                                    <div className={`${pos.unrealizedPL >= 0 ? 'text-success/80' : 'text-error/80'}`}>
                                                        {pos.unrealizedPL >= 0 ? '+' : ''}{formatCurrency(pos.unrealizedPL, pos.currency, locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </React.Fragment>
                        ))}
                    </div>

                    {categories.length === 0 && (
                        <div className="p-12 text-center text-secondary">
                            {t('emptyState.message')} <Link to="/import" className="text-brand hover:underline">{t('emptyState.link')}</Link> {t('emptyState.suffix')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Portfolio;
