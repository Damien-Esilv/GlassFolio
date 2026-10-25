import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import { ArrowRight, FileText, Lightbulb, BookOpen, AlertTriangle, TrendingUp, TrendingDown, Globe, ShieldCheck, ChevronDown } from 'lucide-react';
import { STAGGER_DELAY_MS } from '../src/constants/animations';
import { taxService } from '../src/services/fiscal';
import { DEFAULT_FISCAL_YEAR, SUPPORTED_FISCAL_YEARS } from '../src/constants/fiscalConstants';
import { TaxSummaryResult, FiscalProfile } from '../src/types/types.backend';

interface TaxHubCardItem {
    id: string;
    icon: React.FC<{ size?: number; className?: string }>;
    titleKey: string;
    descKey: string;
    route: string;
}

const TaxHub: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [fiscalYear, setFiscalYear] = useState<string>(DEFAULT_FISCAL_YEAR);
    const [summary, setSummary] = useState<TaxSummaryResult | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const profile: FiscalProfile = user?.preferences?.fiscalProfile || {};
    const hasFiscalProfile = !!(profile.taxResidenceCountries?.length && profile.familyStatus && profile.fiscalShares);
    const supportedYears = taxService.getSupportedYears();

    // Compute the declaration year from the fiscal year rules
    const declarationYear = (parseInt(fiscalYear) + 1).toString();

    useEffect(() => {
        const loadSummary = async () => {
            setIsLoading(true);
            try {
                const result = await taxService.getTaxSummary(fiscalYear, profile);
                setSummary(result);
            } catch (err) {
                console.error('Failed to load tax summary:', err);
            }
            setIsLoading(false);
        };
        loadSummary();
    }, [fiscalYear]);

    const cards: TaxHubCardItem[] = [
        {
            id: 'declaration',
            icon: FileText,
            titleKey: 'tax:hub.cards.declaration.title',
            descKey: 'tax:hub.cards.declaration.desc',
            route: `/tax/declaration?year=${fiscalYear}`,
        },
        {
            id: 'optimization',
            icon: Lightbulb,
            titleKey: 'tax:hub.cards.optimization.title',
            descKey: 'tax:hub.cards.optimization.desc',
            route: `/tax/optimization?year=${fiscalYear}`,
        },
        {
            id: 'guide',
            icon: BookOpen,
            titleKey: 'tax:hub.cards.guide.title',
            descKey: 'tax:hub.cards.guide.desc',
            route: '/tax/guide',
        },
    ];

    const totalGains = summary
        ? summary.cto.totalGains + summary.crypto.totalGains + summary.income.totalDividends
        : 0;
    const totalLosses = summary
        ? summary.cto.totalLosses + summary.crypto.totalLosses
        : 0;

    return (
        <div className="space-y-8">
            {/* Header with fiscal year selector */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-subtle">
                <div>
                    <h1 className="text-3xl font-bold text-primary mb-1">{t('tax:hub.title')}</h1>
                    <p className="text-secondary text-sm">{t('tax:hub.subtitle')}</p>
                </div>
                <div className="relative">
                    <select
                        value={fiscalYear}
                        onChange={(e) => setFiscalYear(e.target.value)}
                        className="appearance-none bg-subtle text-primary border border-subtle rounded-lg px-4 py-2 pr-10 text-sm font-medium focus:ring-2 focus:ring-brand focus:border-brand cursor-pointer"
                    >
                        {supportedYears.map(year => (
                            <option key={year} value={year}>
                                {t('tax:hub.fiscalYearLabel', { year, declarationYear: (parseInt(year) + 1).toString() })}
                            </option>
                        ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
                </div>
            </div>

            {/* Disclaimer Banner */}
            <div className="animate-slide-in-left rounded-xl bg-warning/10 border border-warning/30 p-4 flex gap-3">
                <AlertTriangle size={20} className="text-warning flex-shrink-0 mt-0.5" />
                <div>
                    <h3 className="text-sm font-semibold text-primary mb-1">{t('tax:hub.disclaimerTitle')}</h3>
                    <p className="text-xs text-secondary leading-relaxed">{t('tax:hub.disclaimer')}</p>
                </div>
            </div>

            {/* Fiscal Profile Check */}
            {!hasFiscalProfile && (
                <div className="animate-slide-in-left rounded-xl bg-brand/10 border border-brand/30 p-4 flex flex-col sm:flex-row sm:items-center gap-3" style={{ animationDelay: `${STAGGER_DELAY_MS}ms` }}>
                    <div className="flex-1">
                        <h3 className="text-sm font-semibold text-primary mb-1">{t('tax:hub.profileRequired')}</h3>
                        <p className="text-xs text-secondary">{t('tax:hub.profileRequiredDesc')}</p>
                    </div>
                    <Button
                        size="sm"
                        onClick={() => navigate('/settings?tab=fiscal')}
                    >
                        {t('tax:hub.goToSettings')}
                    </Button>
                </div>
            )}

            {/* Quick Stats */}
            {!isLoading && summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-slide-in-left" style={{ animationDelay: `${STAGGER_DELAY_MS * 2}ms` }}>
                    <div className="rounded-xl bg-card border border-subtle p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp size={16} className="text-success" />
                            <span className="text-xs text-secondary">{t('tax:hub.quickStats.totalTaxableGains')}</span>
                        </div>
                        <p className="text-lg font-bold text-primary">{totalGains.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</p>
                    </div>
                    <div className="rounded-xl bg-card border border-subtle p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingDown size={16} className="text-error" />
                            <span className="text-xs text-secondary">{t('tax:hub.quickStats.totalLosses')}</span>
                        </div>
                        <p className="text-lg font-bold text-primary">{totalLosses.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</p>
                    </div>
                    <div className="rounded-xl bg-card border border-subtle p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Globe size={16} className="text-brand" />
                            <span className="text-xs text-secondary">{t('tax:hub.quickStats.foreignAccounts')}</span>
                        </div>
                        <p className="text-lg font-bold text-primary">{summary.foreignAccounts.length}</p>
                    </div>
                    <div className="rounded-xl bg-card border border-subtle p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <ShieldCheck size={16} className="text-success" />
                            <span className="text-xs text-secondary">{t('tax:hub.quickStats.dataQuality')}</span>
                        </div>
                        <p className="text-lg font-bold text-primary">
                            {summary.dataQuality.totalEvents > 0
                                ? `${Math.round((summary.dataQuality.determinedCount / summary.dataQuality.totalEvents) * 100)}%`
                                : '—'}
                        </p>
                    </div>
                </div>
            )}

            {/* Loading skeleton */}
            {isLoading && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="rounded-xl bg-card border border-subtle p-4 animate-pulse">
                            <div className="h-4 bg-subtle rounded w-2/3 mb-3" />
                            <div className="h-6 bg-subtle rounded w-1/2" />
                        </div>
                    ))}
                </div>
            )}

            {/* Hub Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {cards.map((card, idx) => {
                    const IconComponent = card.icon;
                    return (
                        <div
                            key={card.id}
                            onClick={() => navigate(card.route)}
                            className="animate-slide-in-left group relative rounded-2xl bg-card border border-subtle hover:border-strong p-6 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between overflow-hidden cursor-pointer"
                            style={{ animationDelay: `${(idx + 3) * STAGGER_DELAY_MS}ms` }}
                        >
                            {/* Decorative background glow */}
                            <div className="absolute -top-12 -right-12 w-32 h-32 bg-brand/5 rounded-full blur-2xl group-hover:bg-brand/10 transition-colors pointer-events-none" />

                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 rounded-xl bg-brand/10 text-brand group-hover:scale-105 transition-transform">
                                        <IconComponent size={24} />
                                    </div>
                                </div>

                                <h3 className="text-xl font-bold text-primary mb-2">{t(card.titleKey)}</h3>
                                <p className="text-secondary text-sm leading-relaxed mb-6">{t(card.descKey)}</p>
                            </div>

                            <div className="pt-4 border-t border-subtle flex items-center justify-end">
                                <Button
                                    size="sm"
                                    className="flex items-center gap-2"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(card.route);
                                    }}
                                >
                                    <span>{t('tax:hub.explore')}</span>
                                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TaxHub;
