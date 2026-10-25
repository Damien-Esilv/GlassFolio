import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { ChevronLeft, AlertTriangle, TrendingUp, TrendingDown, Lightbulb, Globe, CheckCircle, Info } from 'lucide-react';
import Button from '../components/Button';
import { taxService, OptimizationSuggestion } from '../src/services/fiscal';
import { DEFAULT_FISCAL_YEAR } from '../src/constants/fiscalConstants';
import { FiscalProfile, FiscalConfidence } from '../src/types/types.backend';
import { ANIMATION_DURATION_MS, STAGGER_DELAY_MS, ANIMATION_EASING } from '../src/constants/animations';

// ── Helpers ─────────────────────────────────────────────────────────────────
const formatEur = (v: number) =>
    v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';

// ── PFU vs Barème comparison card ───────────────────────────────────────────
interface PFUComparisonResult {
    pfuTotal: number;
    baremeTotal: number;
    recommendation: 'PFU' | 'BAREME' | 'NEUTRAL';
    confidence: FiscalConfidence;
}

const PFUCard: React.FC<{ data: PFUComparisonResult | null; isLoading: boolean }> = ({ data, isLoading }) => {
    const { t } = useTranslation();

    if (isLoading) return <div className="h-48 bg-card border border-subtle rounded-2xl animate-pulse" />;
    if (!data) return null;

    const savings = Math.abs(data.pfuTotal - data.baremeTotal);
    const isPFUBetter = data.recommendation === 'PFU';
    const isBaremeBetter = data.recommendation === 'BAREME';

    return (
        <div className="bg-card border border-subtle rounded-2xl p-6 space-y-5 animate-fade-in-up">
            <div>
                <h3 className="text-lg font-bold text-primary mb-1">{t('tax:optimization.pfuVsBareme.title')}</h3>
                <p className="text-xs text-secondary">{t('tax:optimization.pfuVsBareme.subtitle')}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className={`rounded-xl p-4 border transition-all ${isPFUBetter ? 'border-success/40 bg-success/5' : 'border-subtle bg-subtle/40'}`}>
                    <p className="text-xs text-secondary mb-1">{t('tax:optimization.pfuVsBareme.pfuAmount')}</p>
                    <p className="text-2xl font-bold text-primary">{formatEur(data.pfuTotal)}</p>
                    <p className="text-xs text-secondary mt-2 leading-relaxed">{t('tax:optimization.pfuVsBareme.pfuDescription')}</p>
                </div>
                <div className={`rounded-xl p-4 border transition-all ${isBaremeBetter ? 'border-success/40 bg-success/5' : 'border-subtle bg-subtle/40'}`}>
                    <p className="text-xs text-secondary mb-1">{t('tax:optimization.pfuVsBareme.baremeAmount')}</p>
                    <p className="text-2xl font-bold text-primary">{formatEur(data.baremeTotal)}</p>
                    <p className="text-xs text-secondary mt-2 leading-relaxed">{t('tax:optimization.pfuVsBareme.baremeDescription')}</p>
                </div>
            </div>

            {data.recommendation !== 'NEUTRAL' && savings > 10 && (
                <div className="flex items-center gap-3 rounded-xl bg-success/10 border border-success/30 p-4">
                    <CheckCircle size={18} className="text-success shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-primary">
                            {isBaremeBetter ? t('tax:optimization.pfuVsBareme.recommendBareme') : t('tax:optimization.pfuVsBareme.recommendPFU')}
                        </p>
                        <p className="text-xs text-secondary">{t('tax:optimization.suggestions.impact')}: ~{formatEur(savings)}</p>
                    </div>
                </div>
            )}

            {data.recommendation === 'NEUTRAL' && (
                <div className="flex items-center gap-3 rounded-xl bg-subtle p-4">
                    <Info size={18} className="text-secondary shrink-0" />
                    <p className="text-sm text-secondary">{t('tax:optimization.pfuVsBareme.recommendNeutral')}</p>
                </div>
            )}

            {data.confidence === 'insufficient_data' && (
                <div className="flex items-center gap-2 rounded-xl bg-warning/10 border border-warning/20 p-3">
                    <AlertTriangle size={14} className="text-warning shrink-0" />
                    <p className="text-xs text-secondary">{t('tax:optimization.pfuVsBareme.needsProfile')}</p>
                </div>
            )}
        </div>
    );
};

// ── Suggestion card ──────────────────────────────────────────────────────────
const SuggestionCard: React.FC<{ suggestion: OptimizationSuggestion; index?: number }> = ({ suggestion, index = 0 }) => {
    const { t } = useTranslation();
    const categoryColors: Record<OptimizationSuggestion['category'], string> = {
        regime: 'text-brand bg-brand/10',
        harvesting: 'text-success bg-success/10',
        compliance: 'text-error bg-error/10',
        crypto: 'text-warning bg-warning/10',
        envelope: 'text-accent-purple bg-accent-purple/10',
    };
    const categoryIcons: Record<OptimizationSuggestion['category'], React.ReactNode> = {
        regime: <TrendingUp size={16} />,
        harvesting: <TrendingDown size={16} />,
        compliance: <Globe size={16} />,
        crypto: <AlertTriangle size={16} />,
        envelope: <Lightbulb size={16} />,
    };

    return (
        <div 
            className="bg-card border border-subtle rounded-xl p-5 flex gap-4 hover:border-strong transition-all animate-fade-in-up"
            style={{ animationDelay: `${index * STAGGER_DELAY_MS}ms` }}
        >
            <div className={`p-2 rounded-lg shrink-0 h-fit ${categoryColors[suggestion.category]}`}>
                {categoryIcons[suggestion.category]}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="font-semibold text-primary text-sm">{suggestion.title}</h4>
                    {suggestion.impact > 0 && (
                        <span className="shrink-0 text-xs font-bold text-success bg-success/10 px-2 py-0.5 rounded-full">
                            ~{formatEur(suggestion.impact)}
                        </span>
                    )}
                </div>
                <p className="text-xs text-secondary leading-relaxed">{suggestion.recommendation}</p>
                <p className="text-xs text-tertiary mt-1">{t(`tax:optimization.suggestions.categories.${suggestion.category}`)}</p>
            </div>
        </div>
    );
};

// ── Envelope comparison table ────────────────────────────────────────────────
const EnvelopeTable: React.FC = () => {
    const { t } = useTranslation();
    const rows = ['cto', 'pea', 'av'] as const;
    const cols = ['gains', 'dividends', 'flexibility', 'ceiling'] as const;

    return (
        <div className="bg-card border border-subtle rounded-2xl p-6">
            <h3 className="text-lg font-bold text-primary mb-1">{t('tax:optimization.envelope.title')}</h3>
            <p className="text-xs text-secondary mb-5">{t('tax:optimization.envelope.subtitle')}</p>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-subtle text-xs text-secondary uppercase">
                            <th className="text-left pb-3 pr-4">{t('tax:optimization.envelope.wrapper')}</th>
                            <th className="text-left pb-3 pr-4">{t('tax:optimization.envelope.taxOnGains')}</th>
                            <th className="text-left pb-3 pr-4">{t('tax:optimization.envelope.taxOnDividends')}</th>
                            <th className="text-left pb-3 pr-4">{t('tax:optimization.envelope.flexibility')}</th>
                            <th className="text-left pb-3">{t('tax:optimization.envelope.ceiling')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-subtle">
                        {rows.map(row => (
                            <tr key={row} className="hover:bg-subtle/40 transition-colors">
                                <td className="py-3 pr-4 font-semibold text-primary">{t(`tax:optimization.envelope.${row}.name`)}</td>
                                {cols.map(col => (
                                    <td key={col} className="py-3 pr-4 text-xs text-secondary">{t(`tax:optimization.envelope.${row}.${col}`)}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const EMPTY_FISCAL_PROFILE: FiscalProfile = Object.freeze({});

// ── Main component ──────────────────────────────────────────────────────────
const TaxOptimization: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user } = useAuth();

    const fiscalYear = searchParams.get('year') || DEFAULT_FISCAL_YEAR;
    const profile: FiscalProfile = user?.preferences?.fiscalProfile || EMPTY_FISCAL_PROFILE;
    const profileKey = JSON.stringify(profile);
    const hasFiscalProfile = !!(profile.taxResidenceCountries?.length && profile.familyStatus && profile.fiscalShares);

    const [pfuComparison, setPFUComparison] = useState<PFUComparisonResult | null>(null);
    const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const prevFetchKeyRef = useRef<string>('');

    useEffect(() => {
        const fetchKey = `${fiscalYear}:${profileKey}`;
        if (prevFetchKeyRef.current === fetchKey) return;
        prevFetchKeyRef.current = fetchKey;

        let isMounted = true;
        setIsLoading(true);

        (async () => {
            try {
                const summary = await taxService.getTaxSummary(fiscalYear, profile);
                const [pfuResult, sugResult] = await Promise.all([
                    taxService.comparePFUvsBareme(fiscalYear, profile, undefined, summary),
                    taxService.getOptimizationSuggestions(fiscalYear, profile, undefined, summary),
                ]);
                if (isMounted) {
                    setPFUComparison(pfuResult);
                    setSuggestions(sugResult);
                }
            } catch (err) {
                console.error('Failed to load optimization data:', err);
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        })();

        return () => {
            isMounted = false;
        };
    }, [fiscalYear, profileKey]);

    return (
        <div className="space-y-6 w-full animate-fade-in">
            {/* Header */}
            <div>
                <button onClick={() => navigate('/tax')} className="flex items-center gap-1 text-sm text-secondary hover:text-primary mb-4 transition-colors">
                    <ChevronLeft size={16} />{t('tax:optimization.backToHub')}
                </button>
                <h1 className="text-3xl font-bold text-primary mb-1">{t('tax:optimization.title')}</h1>
                <p className="text-secondary text-sm">{t('tax:optimization.subtitle', { year: fiscalYear })}</p>
            </div>

            {/* Disclaimer */}
            <div className="rounded-xl bg-warning/10 border border-warning/30 p-4 flex gap-3">
                <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-secondary leading-relaxed">{t('tax:hub.disclaimer')}</p>
            </div>

            {/* Incomplete Fiscal Profile Warning Banner */}
            {!hasFiscalProfile && (
                <div className="rounded-xl bg-brand/10 border border-brand/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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

            {/* PFU vs Barème */}
            <PFUCard data={pfuComparison} isLoading={isLoading} />

            {/* Personalized suggestions */}
            <div className="space-y-4">
                <h2 className="text-lg font-bold text-primary">{t('tax:optimization.suggestions.title')}</h2>
                {isLoading ? (
                    <div className="space-y-3 animate-pulse">
                        {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-card border border-subtle rounded-xl" />)}
                    </div>
                ) : suggestions.length === 0 ? (
                    <div className="rounded-xl bg-subtle p-8 text-center">
                        <CheckCircle size={32} className="text-success mx-auto mb-2" />
                        <p className="text-sm text-secondary">{t('tax:optimization.suggestions.noSuggestions')}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {suggestions.map((s, idx) => <SuggestionCard key={s.id} suggestion={s} index={idx} />)}
                    </div>
                )}
            </div>

            {/* Tax-Loss Harvesting info */}
            <div className="bg-card border border-subtle rounded-2xl p-6 space-y-3">
                <h3 className="text-lg font-bold text-primary">{t('tax:optimization.harvesting.title')}</h3>
                <p className="text-xs text-secondary">{t('tax:optimization.harvesting.subtitle')}</p>
                <div className="rounded-xl bg-brand/5 border border-brand/20 p-3 flex gap-2">
                    <Info size={14} className="text-brand shrink-0 mt-0.5" />
                    <p className="text-xs text-secondary">{t('tax:optimization.harvesting.note')}</p>
                </div>
            </div>

            {/* Envelope comparison */}
            <EnvelopeTable />
        </div>
    );
};

export default TaxOptimization;
