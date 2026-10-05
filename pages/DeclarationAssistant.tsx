import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { ChevronLeft, ChevronDown, FileText, Globe, AlertTriangle, CheckCircle, HelpCircle, XCircle, Info } from 'lucide-react';
import { taxService } from '../src/services/fiscal';
import { DEFAULT_FISCAL_YEAR } from '../src/constants/fiscalConstants';
import { TaxSummaryResult, FiscalProfile, TaxableEvent, FiscalConfidence } from '../src/types/types.backend';

// ── Confidence badge ────────────────────────────────────────────────────────
const ConfidenceBadge: React.FC<{ confidence: FiscalConfidence }> = ({ confidence }) => {
    const { t } = useTranslation();
    const config: Record<FiscalConfidence, { icon: React.ReactNode; classes: string }> = {
        determined: { icon: <CheckCircle size={12} />, classes: 'bg-success/10 text-success' },
        estimated: { icon: <HelpCircle size={12} />, classes: 'bg-warning/10 text-warning' },
        insufficient_data: { icon: <XCircle size={12} />, classes: 'bg-error/10 text-error' },
        complex: { icon: <Info size={12} />, classes: 'bg-brand/10 text-brand' },
    };
    const { icon, classes } = config[confidence] ?? config.estimated;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${classes}`}>
            {icon}
            {t(`tax:declaration.confidence.${confidence}`)}
        </span>
    );
};

// ── Amount formatter ────────────────────────────────────────────────────────
const formatEur = (value: number) =>
    value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

// ── Event row ───────────────────────────────────────────────────────────────
const EventRow: React.FC<{ event: TaxableEvent }> = ({ event }) => {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const isNegative = event.taxableAmount < 0;

    return (
        <div className="border border-subtle rounded-lg overflow-hidden">
            <button
                className="w-full flex items-center gap-3 p-3 hover:bg-subtle/50 transition-colors text-left"
                onClick={() => setExpanded(v => !v)}
            >
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-primary">{event.symbol || event.instrumentName}</span>
                        <ConfidenceBadge confidence={event.confidence} />
                    </div>
                    <div className="text-xs text-secondary mt-0.5">{new Date(event.eventDate).toLocaleDateString('fr-FR')}</div>
                </div>
                <div className="text-right shrink-0">
                    <div className={`font-bold text-sm ${isNegative ? 'text-error' : 'text-success'}`}>
                        {isNegative ? '' : '+'}{formatEur(event.taxableAmount)}
                    </div>
                    <div className="text-xs text-secondary">{formatEur(event.grossAmount)}</div>
                </div>
                <ChevronDown size={14} className={`text-secondary shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && (
                <div className="px-3 pb-3 border-t border-subtle bg-subtle/30 text-xs space-y-1.5">
                    <div className="flex justify-between"><span className="text-secondary">{t('tax:declaration.cto.grossAmount')}</span><span className="font-medium text-primary">{formatEur(event.grossAmount)}</span></div>
                    <div className="flex justify-between"><span className="text-secondary">{t('tax:declaration.cto.costBasis')}</span><span className="font-medium text-primary">{formatEur(event.acquisitionCost)}</span></div>
                    <div className="flex justify-between"><span className="text-secondary">{t('common:fees', { ns: 'common' })}</span><span className="font-medium text-primary">{formatEur(event.fees)}</span></div>
                    <div className="flex justify-between border-t border-subtle pt-1.5">
                        <span className="text-secondary font-semibold">{t('tax:declaration.cto.netGain')}</span>
                        <span className={`font-bold ${isNegative ? 'text-error' : 'text-success'}`}>{formatEur(event.taxableAmount)}</span>
                    </div>
                    {event.explanation && <p className="text-secondary mt-1 leading-relaxed">{event.explanation}</p>}
                    {event.legalReference && <p className="text-tertiary italic">{event.legalReference}</p>}
                    {event.missingData && event.missingData.length > 0 && (
                        <div className="flex items-start gap-1 text-warning mt-1">
                            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                            <span>{event.missingData.join(', ')}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ── Stat card ───────────────────────────────────────────────────────────────
const StatCard: React.FC<{ label: string; value: number; isNegative?: boolean; highlight?: boolean }> = ({ label, value, isNegative, highlight }) => (
    <div className={`rounded-xl p-4 border ${highlight ? 'bg-brand/5 border-brand/20' : 'bg-card border-subtle'}`}>
        <p className="text-xs text-secondary mb-1">{label}</p>
        <p className={`text-lg font-bold ${isNegative ? 'text-error' : highlight ? 'text-brand' : 'text-primary'}`}>{formatEur(value)}</p>
    </div>
);

// ── Main component ──────────────────────────────────────────────────────────
const DeclarationAssistant: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { user } = useAuth();

    const fiscalYear = searchParams.get('year') || DEFAULT_FISCAL_YEAR;
    const profile: FiscalProfile = user?.preferences?.fiscalProfile || {};

    type Tab = 'cto' | 'dividends' | 'pea' | 'crypto' | 'foreign' | 'forms';
    const [activeTab, setActiveTab] = useState<Tab>('cto');
    const [summary, setSummary] = useState<TaxSummaryResult | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const tabs: { id: Tab; labelKey: string }[] = [
        { id: 'cto', labelKey: 'tax:declaration.tabs.cto' },
        { id: 'dividends', labelKey: 'tax:declaration.tabs.dividends' },
        { id: 'pea', labelKey: 'tax:declaration.tabs.pea' },
        { id: 'crypto', labelKey: 'tax:declaration.tabs.crypto' },
        { id: 'foreign', labelKey: 'tax:declaration.tabs.foreign' },
        { id: 'forms', labelKey: 'tax:declaration.tabs.forms' },
    ];

    const loadSummary = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await taxService.getTaxSummary(fiscalYear, profile);
            setSummary(result);
        } catch (err) {
            console.error('Failed to load tax summary:', err);
        }
        setIsLoading(false);
    }, [fiscalYear]);

    useEffect(() => { loadSummary(); }, [loadSummary]);

    return (
        <div className="space-y-6 w-full">
            {/* Header */}
            <div>
                <button onClick={() => navigate('/tax')} className="flex items-center gap-1 text-sm text-secondary hover:text-primary mb-4 transition-colors">
                    <ChevronLeft size={16} />{t('tax:declaration.backToHub')}
                </button>
                <h1 className="text-3xl font-bold text-primary mb-1">{t('tax:declaration.title')}</h1>
                <p className="text-secondary text-sm">{t('tax:declaration.subtitle', { year: fiscalYear })}</p>
            </div>

            {/* Disclaimer */}
            <div className="rounded-xl bg-warning/10 border border-warning/30 p-4 flex gap-3">
                <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-secondary leading-relaxed">{t('tax:hub.disclaimer')}</p>
            </div>

            {/* Tab bar */}
            <div className="flex flex-wrap gap-1 bg-subtle p-1 rounded-xl">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 min-w-fit px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === tab.id ? 'bg-card text-primary shadow-sm' : 'text-secondary hover:text-primary'}`}
                    >
                        {t(tab.labelKey)}
                    </button>
                ))}
            </div>

            {/* Loading skeleton */}
            {isLoading && (
                <div className="space-y-3 animate-pulse">
                    {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-card rounded-xl border border-subtle" />)}
                </div>
            )}

            {/* ── CTO Tab ── */}
            {!isLoading && summary && activeTab === 'cto' && (
                <div className="space-y-6 animate-fade-in">
                    <div>
                        <h2 className="text-lg font-semibold text-primary mb-1">{t('tax:declaration.cto.title')}</h2>
                        <p className="text-xs text-secondary">{t('tax:declaration.cto.subtitle')}</p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <StatCard label={t('tax:declaration.cto.totalGains')} value={summary.cto.totalGains} />
                        <StatCard label={t('tax:declaration.cto.totalLosses')} value={summary.cto.totalLosses} isNegative />
                        <StatCard label={t('tax:declaration.cto.netResult')} value={summary.cto.netResult} highlight isNegative={summary.cto.netResult < 0} />
                        {summary.cto.lossCarryforward > 0 && <StatCard label={t('tax:declaration.cto.lossCarryforward')} value={summary.cto.lossCarryforward} />}
                        {summary.cto.lossesApplied > 0 && <StatCard label={t('tax:declaration.cto.lossesApplied')} value={summary.cto.lossesApplied} />}
                        {summary.cto.remainingCarryforward > 0 && <StatCard label={t('tax:declaration.cto.remainingCarryforward')} value={summary.cto.remainingCarryforward} />}
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-primary mb-3">{t('tax:declaration.cto.eventTable')}</h3>
                        {summary.cto.events.length === 0 ? (
                            <p className="text-secondary text-sm text-center py-8">{t('tax:declaration.cto.noEvents')}</p>
                        ) : (
                            <div className="space-y-2">{summary.cto.events.map(e => <EventRow key={e.transactionIds[0]} event={e} />)}</div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Dividends Tab ── */}
            {!isLoading && summary && activeTab === 'dividends' && (
                <div className="space-y-6 animate-fade-in">
                    <div>
                        <h2 className="text-lg font-semibold text-primary mb-1">{t('tax:declaration.dividends.title')}</h2>
                        <p className="text-xs text-secondary">{t('tax:declaration.dividends.subtitle')}</p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <StatCard label={t('tax:declaration.dividends.totalDividends')} value={summary.income.totalDividends} />
                        <StatCard label={t('tax:declaration.dividends.totalInterest')} value={summary.income.totalInterest} />
                        <StatCard label={t('tax:declaration.dividends.totalCoupons')} value={summary.income.totalCoupons} />
                    </div>
                    {summary.income.events.length === 0 ? (
                        <p className="text-secondary text-sm text-center py-8">{t('tax:declaration.dividends.noEvents')}</p>
                    ) : (
                        <div className="space-y-2">{summary.income.events.map(e => <EventRow key={e.transactionIds[0]} event={e} />)}</div>
                    )}
                </div>
            )}

            {/* ── PEA Tab ── */}
            {!isLoading && summary && activeTab === 'pea' && (
                <div className="space-y-6 animate-fade-in">
                    <div>
                        <h2 className="text-lg font-semibold text-primary mb-1">{t('tax:declaration.pea.title')}</h2>
                        <p className="text-xs text-secondary">{t('tax:declaration.pea.subtitle')}</p>
                    </div>
                    <div className="rounded-xl bg-brand/5 border border-brand/20 p-4 flex gap-3">
                        <Info size={16} className="text-brand shrink-0 mt-0.5" />
                        <p className="text-xs text-secondary leading-relaxed">{t('tax:declaration.pea.internalNote')}</p>
                    </div>
                    <p className="text-secondary text-sm text-center py-8">{t('tax:declaration.pea.noEvents')}</p>
                </div>
            )}

            {/* ── Crypto Tab ── */}
            {!isLoading && summary && activeTab === 'crypto' && (
                <div className="space-y-6 animate-fade-in">
                    <div>
                        <h2 className="text-lg font-semibold text-primary mb-1">{t('tax:declaration.crypto.title')}</h2>
                        <p className="text-xs text-secondary">{t('tax:declaration.crypto.subtitle')}</p>
                    </div>
                    {/* Threshold indicator */}
                    <div className={`rounded-xl p-4 border flex items-center gap-3 ${summary.crypto.exceedsThreshold ? 'bg-warning/10 border-warning/30' : 'bg-success/10 border-success/30'}`}>
                        {summary.crypto.exceedsThreshold
                            ? <AlertTriangle size={16} className="text-warning shrink-0" />
                            : <CheckCircle size={16} className="text-success shrink-0" />}
                        <div>
                            <p className="text-sm font-medium text-primary">
                                {summary.crypto.exceedsThreshold ? t('tax:declaration.crypto.thresholdExceeded') : t('tax:declaration.crypto.thresholdNotExceeded')}
                            </p>
                            <p className="text-xs text-secondary">{t('tax:declaration.crypto.threshold')}: {summary.crypto.thresholdAmount} €</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <StatCard label={t('tax:declaration.crypto.totalCessions')} value={summary.crypto.totalCessions} />
                        <StatCard label={t('tax:declaration.crypto.totalGains')} value={summary.crypto.totalGains} />
                        <StatCard label={t('tax:declaration.crypto.totalLosses')} value={summary.crypto.totalLosses} isNegative />
                        <StatCard label={t('tax:declaration.crypto.netResult')} value={summary.crypto.netResult} highlight isNegative={summary.crypto.netResult < 0} />
                    </div>
                    <div className="rounded-xl bg-subtle p-3 flex gap-2">
                        <Info size={14} className="text-secondary shrink-0 mt-0.5" />
                        <p className="text-xs text-secondary">{t('tax:declaration.crypto.cryptoCryptoNote')}</p>
                    </div>
                    <div className="rounded-xl bg-warning/5 border border-warning/20 p-3 flex gap-2">
                        <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
                        <p className="text-xs text-secondary">{t('tax:declaration.crypto.portfolioWarning')}</p>
                    </div>
                    {summary.crypto.events.length === 0 ? (
                        <p className="text-secondary text-sm text-center py-6">{t('tax:declaration.crypto.noEvents')}</p>
                    ) : (
                        <div className="space-y-2">{summary.crypto.events.map(e => <EventRow key={e.transactionIds[0]} event={e} />)}</div>
                    )}
                </div>
            )}

            {/* ── Foreign Accounts Tab ── */}
            {!isLoading && summary && activeTab === 'foreign' && (
                <div className="space-y-6 animate-fade-in">
                    <div>
                        <h2 className="text-lg font-semibold text-primary mb-1">{t('tax:declaration.foreign.title')}</h2>
                        <p className="text-xs text-secondary">{t('tax:declaration.foreign.subtitle')}</p>
                    </div>
                    {summary.foreignAccounts.length === 0 ? (
                        <div className="rounded-xl bg-success/10 border border-success/20 p-6 text-center">
                            <CheckCircle size={32} className="text-success mx-auto mb-2" />
                            <p className="text-sm text-primary font-medium">{t('tax:declaration.foreign.noAccounts')}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {summary.foreignAccounts.map((ob) => (
                                <div key={ob.instituteId} className="rounded-xl bg-card border border-subtle p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Globe size={16} className="text-brand" />
                                            <span className="font-semibold text-primary">{ob.instituteName}</span>
                                            <span className="text-xs text-secondary">({ob.country})</span>
                                        </div>
                                        <span className="px-2 py-0.5 rounded-full bg-warning/10 text-warning text-xs font-medium">
                                            {ob.form}
                                        </span>
                                    </div>
                                    <p className="text-xs text-secondary mb-2">{ob.reason}</p>
                                    <div className="flex flex-wrap gap-1">
                                        {ob.accountNames.map(name => (
                                            <span key={name} className="px-2 py-0.5 bg-subtle rounded text-xs text-secondary">{name}</span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            <div className="rounded-xl bg-error/5 border border-error/20 p-3 flex gap-2">
                                <AlertTriangle size={14} className="text-error shrink-0 mt-0.5" />
                                <p className="text-xs text-secondary">
                                    {t('tax:declaration.foreign.penalty')}: <strong className="text-error">1 500 €</strong> {t('tax:declaration.foreign.perAccount')}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Forms Tab ── */}
            {!isLoading && summary && activeTab === 'forms' && (
                <div className="space-y-6 animate-fade-in">
                    <div>
                        <h2 className="text-lg font-semibold text-primary mb-1">{t('tax:declaration.forms.title')}</h2>
                        <p className="text-xs text-secondary">{t('tax:declaration.forms.subtitle')}</p>
                    </div>
                    <div className="rounded-xl bg-brand/5 border border-brand/20 p-3 flex gap-2">
                        <FileText size={14} className="text-brand shrink-0 mt-0.5" />
                        <p className="text-xs text-secondary">{t('tax:declaration.forms.downloadNote')}</p>
                    </div>
                    {summary.formMappings.length === 0 ? (
                        <p className="text-secondary text-sm text-center py-8">{t('tax:declaration.forms.noMappings')}</p>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-subtle">
                            <table className="w-full text-sm">
                                <thead className="bg-subtle text-secondary text-xs uppercase">
                                    <tr>
                                        <th className="px-4 py-3 text-left">{t('tax:declaration.forms.form')}</th>
                                        <th className="px-4 py-3 text-left">{t('tax:declaration.forms.case')}</th>
                                        <th className="px-4 py-3 text-left">{t('tax:declaration.forms.description')}</th>
                                        <th className="px-4 py-3 text-right">{t('tax:declaration.forms.value')}</th>
                                        <th className="px-4 py-3 text-left">{t('tax:declaration.forms.confidence')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-subtle">
                                    {summary.formMappings.map((fm, idx) => (
                                        <tr key={idx} className="hover:bg-subtle/50 transition-colors">
                                            <td className="px-4 py-3 font-mono font-semibold text-primary text-xs">{fm.form}</td>
                                            <td className="px-4 py-3 font-mono font-bold text-brand text-xs">{fm.caseId}</td>
                                            <td className="px-4 py-3 text-secondary text-xs max-w-xs">{fm.caseDescription}</td>
                                            <td className="px-4 py-3 text-right font-bold text-primary">{fm.value.toLocaleString('fr-FR')} €</td>
                                            <td className="px-4 py-3"><ConfidenceBadge confidence={fm.confidence} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DeclarationAssistant;
