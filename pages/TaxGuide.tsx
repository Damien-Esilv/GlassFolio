import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Search,
    BookOpen,
    Scale,
    Coins,
    Globe,
    TrendingDown,
    CalendarDays,
    PieChart,
    RefreshCw,
    CheckCircle2,
    Clock,
    Sparkles,
    MapPin
} from 'lucide-react';
import { getFiscalRules, DEFAULT_TAX_COUNTRY, taxService } from '../src/services/fiscal';
import { DEFAULT_FISCAL_YEAR } from '../src/constants/fiscalConstants';
import { useAuth } from '../context/AuthContext';
import { FRENCH_DEPARTMENTS, getUserFiscalDeadline, getEffectiveCalendar, getTaxZoneForDepartment } from '../src/services/fiscal/taxCalendarService';
import Button from '../components/Button';
import { ANIMATION_DURATION_MS, STAGGER_DELAY_MS, ANIMATION_EASING } from '../src/constants/animations';

// ── Topic definitions ────────────────────────────────────────────────────────
type TopicId = 'cto' | 'pea' | 'crypto' | 'dividends' | 'foreign' | 'pfuBareme' | 'losses' | 'calendar';

interface Topic {
    id: TopicId;
    icon: React.FC<{ size?: number; className?: string }>;
    category: string;
}

const TOPICS: Topic[] = [
    { id: 'cto', icon: TrendingDown, category: 'securities' },
    { id: 'pea', icon: PieChart, category: 'envelopes' },
    { id: 'crypto', icon: Coins, category: 'digital' },
    { id: 'dividends', icon: Coins, category: 'income' },
    { id: 'foreign', icon: Globe, category: 'compliance' },
    { id: 'pfuBareme', icon: Scale, category: 'regime' },
    { id: 'losses', icon: TrendingDown, category: 'strategy' },
    { id: 'calendar', icon: CalendarDays, category: 'planning' },
];

// ── Official sources — country-driven registry ───────────────────────────────
// To add a new country: add a new key in SOURCES_BY_COUNTRY. Nothing else changes.
const SOURCES_BY_COUNTRY: Record<string, Array<{ labelKey: string; url: string }>> = {
    FR: [
        { labelKey: 'tax:guide.sources.legifrance', url: 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006069577/' },
        { labelKey: 'tax:guide.sources.bofip', url: 'https://bofip.impots.gouv.fr/' },
        { labelKey: 'tax:guide.sources.impots', url: 'https://www.impots.gouv.fr/' },
        { labelKey: 'tax:guide.sources.formulaires', url: 'https://www.impots.gouv.fr/formulaire' },
    ],
    BE: [
        { labelKey: 'tax:guide.sources.be.spf', url: 'https://finances.belgium.be/' },
        { labelKey: 'tax:guide.sources.be.myminfin', url: 'https://myminfin.be/' },
    ],
    DE: [
        { labelKey: 'tax:guide.sources.de.bzst', url: 'https://www.bzst.de/' },
        { labelKey: 'tax:guide.sources.de.elster', url: 'https://www.elster.de/' },
    ],
    CH: [
        { labelKey: 'tax:guide.sources.ch.estv', url: 'https://www.estv.admin.ch/' },
    ],
    // Add more countries here — the UI adapts automatically
};

// ── Category badge ───────────────────────────────────────────────────────────
const CategoryBadge: React.FC<{ label: string }> = ({ label }) => (
    <span className="px-2 py-0.5 rounded-full bg-brand/10 text-brand text-xs font-medium">{label}</span>
);

// ── Dynamic Fiscal Calendar Section ──────────────────────────────────────────
const DynamicCalendarSection: React.FC = () => {
    const { t } = useTranslation();
    const { user, updateProfile } = useAuth();
    const [selectedYear, setSelectedYear] = useState<string>(DEFAULT_FISCAL_YEAR);
    const [department, setDepartment] = useState<string>(user?.preferences?.fiscalProfile?.department || '75');
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<'online' | 'computed'>('computed');
    const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

    const supportedYears = taxService.getSupportedYears(DEFAULT_TAX_COUNTRY);
    const effectiveCalendar = getEffectiveCalendar(selectedYear);
    const userDeadlines = getUserFiscalDeadline(effectiveCalendar, department);

    const handleSyncOnline = async () => {
        setIsSyncing(true);
        try {
            const res = await taxService.syncTaxCalendarOnline(selectedYear, department);
            setSyncStatus(res.calendar.source || 'online');
            setLastSyncTime(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDepartmentChange = async (newDept: string) => {
        setDepartment(newDept);
        const newZone = getTaxZoneForDepartment(newDept);
        if (user && updateProfile) {
            await updateProfile({
                preferences: {
                    ...user.preferences,
                    fiscalProfile: {
                        ...user.preferences?.fiscalProfile,
                        department: newDept,
                        taxZone: newZone,
                    }
                }
            });
        }
    };

    const formatDate = (iso: string) => {
        try {
            return new Date(iso).toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        } catch {
            return iso;
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Top controls: Year, Department, Internet refresh */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-subtle p-5 rounded-2xl shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-secondary uppercase tracking-wider">
                            {t('tax:guide.calendar.yearSelector')}
                        </label>
                        <select
                            value={selectedYear}
                            onChange={e => setSelectedYear(e.target.value)}
                            className="bg-subtle text-primary border border-subtle rounded-lg px-3 py-1.5 text-sm font-medium focus:ring-primary focus:border-primary"
                        >
                            {supportedYears.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-brand shrink-0" />
                        <select
                            value={department}
                            onChange={e => handleDepartmentChange(e.target.value)}
                            className="bg-subtle text-primary border border-subtle rounded-lg px-3 py-1.5 text-sm font-medium focus:ring-primary focus:border-primary max-w-[260px]"
                        >
                            {FRENCH_DEPARTMENTS.map(d => (
                                <option key={d.code} value={d.code}>
                                    {d.code} - {d.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSyncOnline}
                    disabled={isSyncing}
                    className="flex items-center gap-2 shrink-0 self-start sm:self-auto"
                >
                    <RefreshCw size={14} className={isSyncing ? 'animate-spin text-brand' : 'text-secondary'} />
                    <span>{isSyncing ? t('tax:guide.calendar.syncing') : t('tax:guide.calendar.syncOnline')}</span>
                </Button>
            </div>

            {/* Personalized Deadline Hero Banner */}
            <div className="relative overflow-hidden rounded-2xl border border-subtle bg-gradient-to-br from-card via-card to-brand/5 p-6 shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full bg-brand/10 text-brand text-xs font-bold uppercase tracking-wider">
                                {t('tax:guide.calendar.yourZone')}: {userDeadlines.userZone.replace('_', ' ').toUpperCase()}
                            </span>
                            <span className="text-xs text-secondary">
                                • {userDeadlines.departmentName}
                            </span>
                        </div>
                        <h3 className="text-lg font-bold text-primary">
                            {t('tax:guide.calendar.yourDeadline')}
                        </h3>
                        <p className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight capitalize">
                            {formatDate(userDeadlines.userDeadline)}
                        </p>
                        <p className="text-xs text-secondary">
                            {t('tax:guide.calendar.subtitle')}
                        </p>
                    </div>

                    <div className="shrink-0 flex flex-col sm:items-end gap-2">
                        {userDeadlines.isPassed ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-error/10 text-error border border-error/20 text-sm font-semibold">
                                <Clock size={16} />
                                {t('tax:guide.calendar.passed')}
                            </span>
                        ) : (
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-semibold ${
                                userDeadlines.daysRemaining <= 15
                                    ? 'bg-warning/10 text-warning border-warning/20'
                                    : 'bg-success/10 text-success border-success/20'
                            }`}>
                                <Clock size={16} />
                                {t('tax:guide.calendar.daysRemaining', { count: userDeadlines.daysRemaining })}
                            </span>
                        )}

                        <span className="text-[11px] text-tertiary flex items-center gap-1">
                            {syncStatus === 'online' ? (
                                <>
                                    <CheckCircle2 size={12} className="text-success" />
                                    {t('tax:guide.calendar.syncedOnline')}
                                    {lastSyncTime && ` (${lastSyncTime})`}
                                </>
                            ) : (
                                <>
                                    <Sparkles size={12} className="text-brand" />
                                    {t('tax:guide.calendar.computedAutonomous')}
                                </>
                            )}
                        </span>
                    </div>
                </div>
            </div>

            {/* Official 3 Zones breakdown grid */}
            <div>
                <h4 className="text-sm font-bold text-primary mb-3">
                    {t('tax:guide.calendar.zoneBreakdown')}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className={`p-4 rounded-xl border transition-all ${
                        userDeadlines.userZone === 'zone_1'
                            ? 'bg-brand/10 border-brand shadow-sm ring-1 ring-brand'
                            : 'bg-card border-subtle'
                    }`}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold uppercase text-primary">Zone 1</span>
                            {userDeadlines.userZone === 'zone_1' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand text-white">
                                    {t('tax:guide.calendar.activeZoneBadge')}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-secondary mb-2">{t('tax:guide.calendar.zone1')}</p>
                        <p className="text-sm font-bold text-primary capitalize">
                            {formatDate(effectiveCalendar.zoneDeadlines.zone1)}
                        </p>
                    </div>

                    <div className={`p-4 rounded-xl border transition-all ${
                        userDeadlines.userZone === 'zone_2'
                            ? 'bg-brand/10 border-brand shadow-sm ring-1 ring-brand'
                            : 'bg-card border-subtle'
                    }`}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold uppercase text-primary">Zone 2</span>
                            {userDeadlines.userZone === 'zone_2' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand text-white">
                                    {t('tax:guide.calendar.activeZoneBadge')}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-secondary mb-2">{t('tax:guide.calendar.zone2')}</p>
                        <p className="text-sm font-bold text-primary capitalize">
                            {formatDate(effectiveCalendar.zoneDeadlines.zone2)}
                        </p>
                    </div>

                    <div className={`p-4 rounded-xl border transition-all ${
                        userDeadlines.userZone === 'zone_3'
                            ? 'bg-brand/10 border-brand shadow-sm ring-1 ring-brand'
                            : 'bg-card border-subtle'
                    }`}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold uppercase text-primary">Zone 3</span>
                            {userDeadlines.userZone === 'zone_3' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand text-white">
                                    {t('tax:guide.calendar.activeZoneBadge')}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-secondary mb-2">{t('tax:guide.calendar.zone3')}</p>
                        <p className="text-sm font-bold text-primary capitalize">
                            {formatDate(effectiveCalendar.zoneDeadlines.zone3)}
                        </p>
                    </div>

                    <div className="p-4 rounded-xl border bg-card border-subtle">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold uppercase text-secondary">Papier</span>
                        </div>
                        <p className="text-xs text-secondary mb-2">{t('tax:guide.calendar.paperDeclaration')}</p>
                        <p className="text-sm font-bold text-primary capitalize">
                            {formatDate(effectiveCalendar.paperDeclarationDeadline)}
                        </p>
                    </div>
                </div>
            </div>

            {/* Key Milestones Timeline */}
            <div className="space-y-3 pt-2">
                <h4 className="text-sm font-bold text-primary">
                    {t('tax:guide.calendar.title', { year: selectedYear })}
                </h4>
                <div className="space-y-2">
                    {[
                        {
                            label: t('tax:guide.calendar.ifuReception'),
                            date: `${new Date(effectiveCalendar.ifuReceptionStart).toLocaleDateString('fr-FR')} → ${new Date(effectiveCalendar.ifuReceptionEnd).toLocaleDateString('fr-FR')}`
                        },
                        {
                            label: t('tax:guide.calendar.declarationOpening'),
                            date: formatDate(effectiveCalendar.declarationOpening)
                        },
                        {
                            label: `${t('tax:guide.calendar.declarationDeadline')} (${userDeadlines.departmentName})`,
                            date: `${formatDate(userDeadlines.userDeadline)} à 23h59`
                        },
                        {
                            label: t('tax:guide.calendar.taxNotice'),
                            date: formatDate(effectiveCalendar.taxNoticeDate)
                        },
                        {
                            label: t('tax:guide.calendar.yearEndPlanning'),
                            date: formatDate(effectiveCalendar.yearEndDeadline)
                        },
                    ].map((step, idx) => (
                        <div key={idx} className="flex items-center gap-4 rounded-xl bg-card border border-subtle p-4">
                            <div className="p-2.5 rounded-lg bg-brand/10 shrink-0">
                                <CalendarDays size={16} className="text-brand" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-primary">{step.label}</p>
                                <p className="text-xs text-secondary capitalize mt-0.5">{step.date}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ── Topic detail content ─────────────────────────────────────────────────────
const TopicDetail: React.FC<{ topicId: TopicId; onBack: () => void }> = ({ topicId, onBack }) => {
    const { t } = useTranslation();
    const rules = getFiscalRules(DEFAULT_FISCAL_YEAR, DEFAULT_TAX_COUNTRY);

    // Render topic-specific content
    const renderContent = () => {
        switch (topicId) {
            case 'cto':
                return (
                    <div className="space-y-5">
                        <h2 className="text-xl font-bold text-primary">{t('tax:guide.topics.cto.title')}</h2>
                        <div className="space-y-3">
                            <h3 className="font-semibold text-primary text-sm">{t('tax:guide.topicDetail.keyRules')}</h3>
                            <ul className="space-y-2 text-sm text-secondary">
                                <li className="flex gap-2"><ChevronRight size={14} className="text-brand shrink-0 mt-0.5" />Imposition au PFU (30 %) ou sur option au barème progressif</li>
                                <li className="flex gap-2"><ChevronRight size={14} className="text-brand shrink-0 mt-0.5" />Prix de revient calculé selon la méthode du Prix Moyen Pondéré (PMP)</li>
                                <li className="flex gap-2"><ChevronRight size={14} className="text-brand shrink-0 mt-0.5" />Moins-values imputables sur les plus-values de même nature, reportables pendant 10 ans</li>
                                <li className="flex gap-2"><ChevronRight size={14} className="text-brand shrink-0 mt-0.5" />Formulaire 2074 pour le détail des cessions, 2042 cases 3VG / 3VH</li>
                            </ul>
                        </div>
                        {rules && (
                            <div className="space-y-3">
                                <h3 className="font-semibold text-primary text-sm">{t('tax:guide.topicDetail.examples')}</h3>
                                <div className="bg-subtle rounded-xl p-4 text-xs font-mono space-y-1">
                                    <p className="text-secondary">// Achat: 100 actions @ 50 € = 5 000 € (PMP: 50 €)</p>
                                    <p className="text-secondary">// Achat: 50 actions @ 80 € = 4 000 € (PMP: 60 €)</p>
                                    <p className="text-secondary">// Vente: 80 actions @ 70 € = 5 600 €</p>
                                    <p className="text-primary font-semibold">// PV = 5 600 - (60 × 80) = 5 600 - 4 800 = <span className="text-success">+800 €</span></p>
                                    <p className="text-secondary">// Impôt PFU: 800 × 30% = <span className="text-error">240 €</span></p>
                                </div>
                            </div>
                        )}
                        <div className="space-y-1 text-xs text-tertiary">
                            <p className="font-semibold text-secondary">{t('tax:guide.topicDetail.legalReferences')}</p>
                            <p>Art. 150-0 A et 150-0 D du CGI — BOI-RPPM-PVBMI</p>
                        </div>
                    </div>
                );

            case 'pea':
                return (
                    <div className="space-y-5">
                        <h2 className="text-xl font-bold text-primary">{t('tax:guide.topics.pea.title')}</h2>
                        <div className="space-y-3">
                            <h3 className="font-semibold text-primary text-sm">{t('tax:guide.topicDetail.keyRules')}</h3>
                            {rules && (
                                <div className="overflow-x-auto rounded-xl border border-subtle">
                                    <table className="w-full text-xs">
                                        <thead className="bg-subtle text-secondary uppercase">
                                            <tr>
                                                <th className="px-4 py-2 text-left">Âge du plan</th>
                                                <th className="px-4 py-2 text-left">IR sur gains</th>
                                                <th className="px-4 py-2 text-left">Prélèvements sociaux</th>
                                                <th className="px-4 py-2 text-left">Clôture ?</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-subtle">
                                            {rules.pea.taxByAge.map((rule, i) => (
                                                <tr key={i} className="hover:bg-subtle/50">
                                                    <td className="px-4 py-2 text-primary">
                                                        {rule.maxAgeYears === Infinity
                                                            ? `> ${rule.minAgeYears} ans`
                                                            : `${rule.minAgeYears}–${rule.maxAgeYears} ans`}
                                                    </td>
                                                    <td className={`px-4 py-2 font-semibold ${rule.incomeTaxRate === 0 ? 'text-success' : 'text-error'}`}>
                                                        {rule.incomeTaxRate === 0 ? 'Exonéré' : `${(rule.incomeTaxRate * 100).toFixed(1)} %`}
                                                    </td>
                                                    <td className="px-4 py-2 text-secondary">{(rule.socialRate * 100).toFixed(1)} %</td>
                                                    <td className={`px-4 py-2 font-medium ${rule.closesOnWithdrawal ? 'text-error' : 'text-success'}`}>
                                                        {rule.closesOnWithdrawal ? 'Oui' : 'Non (partiel possible)'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <ul className="space-y-2 text-sm text-secondary">
                                <li className="flex gap-2"><ChevronRight size={14} className="text-brand shrink-0 mt-0.5" />Plafond versements: {rules?.pea.maxDeposit.toLocaleString('fr-FR')} € (PEA), {rules?.pea.maxDepositPME.toLocaleString('fr-FR')} € (PEA-PME)</li>
                                <li className="flex gap-2"><ChevronRight size={14} className="text-brand shrink-0 mt-0.5" />Les dividendes et plus-values internes ne sont pas imposables</li>
                                <li className="flex gap-2"><ChevronRight size={14} className="text-brand shrink-0 mt-0.5" />Après 5 ans: retraits partiels sans clôture, seuls les PS s'appliquent</li>
                            </ul>
                        </div>
                        <div className="text-xs text-tertiary"><p className="font-semibold text-secondary mb-1">{t('tax:guide.topicDetail.legalReferences')}</p><p>Art. 163 quinquies D du CGI — BOI-RPPM-RCM-40-50</p></div>
                    </div>
                );

            case 'crypto':
                return (
                    <div className="space-y-5">
                        <h2 className="text-xl font-bold text-primary">{t('tax:guide.topics.crypto.title')}</h2>
                        <div className="space-y-3">
                            <h3 className="font-semibold text-primary text-sm">{t('tax:guide.topicDetail.keyRules')}</h3>
                            <ul className="space-y-2 text-sm text-secondary">
                                <li className="flex gap-2"><ChevronRight size={14} className="text-brand shrink-0 mt-0.5" />Seuil d'exonération: {rules?.crypto.exemptionThreshold} € de cessions annuelles</li>
                                <li className="flex gap-2"><ChevronRight size={14} className="text-brand shrink-0 mt-0.5" />Échanges crypto-crypto: <strong className="text-success">fiscalement neutres</strong> (pas d'imposition)</li>
                                <li className="flex gap-2"><ChevronRight size={14} className="text-brand shrink-0 mt-0.5" />Cessions vers monnaie fiduciaire (€, $) ou bien réel: imposables à 30 %</li>
                                <li className="flex gap-2"><ChevronRight size={14} className="text-brand shrink-0 mt-0.5" />Moins-values non reportables (contrairement au CTO)</li>
                                <li className="flex gap-2"><ChevronRight size={14} className="text-brand shrink-0 mt-0.5" />Formulaire 2042-C cases 3AN (gain) / 3BN (perte)</li>
                            </ul>
                            <div className="space-y-3">
                                <h3 className="font-semibold text-primary text-sm">{t('tax:guide.topicDetail.examples')}</h3>
                                <div className="bg-subtle rounded-xl p-4 text-xs font-mono space-y-1">
                                    <p className="text-secondary">// Formule (Art. 150 VH bis):</p>
                                    <p className="text-primary">// PV = Prix cession − (Coût total portefeuille × Prix cession / Valeur totale portefeuille)</p>
                                    <p className="text-secondary mt-2">// Cession 0.5 BTC @ 50k€ = 25 000 €</p>
                                    <p className="text-secondary">// Coût total portefeuille: 30 000 €</p>
                                    <p className="text-secondary">// Valeur totale portefeuille: 75 000 €</p>
                                    <p className="text-primary">// PV = 25k − (30k × 25k / 75k) = 25k − 10k = <span className="text-success">+15 000 €</span></p>
                                </div>
                            </div>
                        </div>
                        <div className="text-xs text-tertiary"><p className="font-semibold text-secondary mb-1">{t('tax:guide.topicDetail.legalReferences')}</p><p>Art. 150 VH bis du CGI</p></div>
                    </div>
                );

            case 'calendar':
                return <DynamicCalendarSection />;

            default:
                return (
                    <div className="space-y-4">
                        <h2 className="text-xl font-bold text-primary">{t(`tax:guide.topics.${topicId}.title`)}</h2>
                        <p className="text-secondary text-sm">{t(`tax:guide.topics.${topicId}.desc`)}</p>
                        <div className="rounded-xl bg-subtle p-4 text-xs text-secondary">
                            <p>Contenu détaillé à venir pour ce sujet.</p>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <button onClick={onBack} className="flex items-center gap-1 text-sm text-secondary hover:text-primary transition-colors">
                <ChevronLeft size={16} />{t('tax:guide.topicDetail.backToGuide')}
            </button>
            <div className="bg-card border border-subtle rounded-2xl p-6">
                {renderContent()}
            </div>
        </div>
    );
};

// ── Main component ──────────────────────────────────────────────────────────
const TaxGuide: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [search, setSearch] = useState('');
    const [activeTopic, setActiveTopic] = useState<TopicId | null>(null);

    // Multi-country: read from fiscal profile, default to ['FR']
    const countries: string[] = user?.preferences?.fiscalProfile?.taxResidenceCountries?.length
        ? user.preferences.fiscalProfile.taxResidenceCountries
        : ['FR'];
    const [activeCountry, setActiveCountry] = useState<string>(countries[0]);

    const filtered = TOPICS.filter(topic => {
        if (!search) return true;
        const title = t(`tax:guide.topics.${topic.id}.title`).toLowerCase();
        const desc = t(`tax:guide.topics.${topic.id}.desc`).toLowerCase();
        return title.includes(search.toLowerCase()) || desc.includes(search.toLowerCase());
    });

    // Sources for the active country (fallback to FR if unknown)
    const activeSources = SOURCES_BY_COUNTRY[activeCountry] ?? SOURCES_BY_COUNTRY['FR'] ?? [];

    if (activeTopic) {
        return (
            <div className="w-full">
                <TopicDetail topicId={activeTopic} onBack={() => setActiveTopic(null)} />
            </div>
        );
    }

    return (
        <div className="space-y-8 w-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 pb-4 border-b border-subtle">
                <div>
                    <button onClick={() => navigate('/tax')} className="flex items-center gap-1 text-sm text-secondary hover:text-primary mb-3 transition-colors">
                        <ChevronLeft size={16} />{t('tax:guide.backToHub')}
                    </button>
                    <h1 className="text-3xl font-bold text-primary mb-1">{t('tax:guide.title')}</h1>
                    <p className="text-secondary text-sm">{t('tax:guide.subtitle')}</p>
                </div>

                {/* Country tab selector — visible only when multi-country */}
                {countries.length > 1 && (
                    <div className="flex gap-1 bg-subtle p-1 rounded-xl self-start sm:self-auto">
                        {countries.map(c => (
                            <button
                                key={c}
                                onClick={() => setActiveCountry(c)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeCountry === c ? 'bg-card text-primary shadow-sm' : 'text-secondary hover:text-primary'}`}
                            >
                                {t(`tax:common.country.${c}`, { defaultValue: c })}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Disclaimer */}
            <div className="rounded-xl bg-brand/5 border border-brand/20 p-4 flex gap-3">
                <BookOpen size={18} className="text-brand shrink-0 mt-0.5" />
                <p className="text-xs text-secondary leading-relaxed">{t('tax:guide.disclaimer')}</p>
            </div>

            {/* Search */}
            <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={t('tax:guide.searchPlaceholder')}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-subtle border border-subtle text-primary placeholder:text-tertiary text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-all"
                />
            </div>

            {/* Topic grid — full width, 4 cols on xl, adapts down */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((topic, idx) => {
                    const Icon = topic.icon;
                    return (
                        <button
                            key={topic.id}
                            onClick={() => setActiveTopic(topic.id)}
                            className="text-left bg-card border border-subtle hover:border-strong rounded-2xl p-5 group transition-all hover:shadow-lg animate-slide-in-left flex flex-col"
                            style={{ animationDelay: `${idx * STAGGER_DELAY_MS}ms` }}
                        >
                            <div className="p-2.5 rounded-xl bg-brand/10 text-brand mb-4 w-fit group-hover:scale-105 transition-transform">
                                <Icon size={20} />
                            </div>
                            <CategoryBadge label={t(`tax:guide.topics.${topic.id}.category`)} />
                            <h3 className="text-sm font-bold text-primary mt-2 mb-1">{t(`tax:guide.topics.${topic.id}.title`)}</h3>
                            <p className="text-xs text-secondary leading-relaxed flex-1">{t(`tax:guide.topics.${topic.id}.desc`)}</p>
                            <div className="flex items-center gap-1 mt-3 text-xs text-brand font-medium">
                                <span>{t('common:buttons.read', { defaultValue: 'Lire' })}</span>
                                <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
                            </div>
                        </button>
                    );
                })}
                {filtered.length === 0 && (
                    <div className="col-span-full text-center py-12 text-secondary text-sm">
                        {t('tax:common.noData')}
                    </div>
                )}
            </div>

            {/* Official sources — country-aware, tabs if multi-country */}
            <div className="bg-card border border-subtle rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                    <h2 className="text-base font-bold text-primary">{t('tax:guide.sources.title')}</h2>

                    {/* Country tabs for sources — only if multiple countries */}
                    {countries.length > 1 && (
                        <div className="flex gap-1 bg-subtle p-1 rounded-xl">
                            {countries.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setActiveCountry(c)}
                                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${activeCountry === c ? 'bg-card text-primary shadow-sm' : 'text-secondary hover:text-primary'}`}
                                >
                                    {t(`tax:common.country.${c}`, { defaultValue: c })}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Single-country: simple 2-col grid. Multi-country: flagged section */}
                {countries.length === 1 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {activeSources.map(({ labelKey, url }) => (
                            <a
                                key={url}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 rounded-xl bg-subtle border border-subtle hover:border-brand/40 p-3 transition-all group"
                            >
                                <ExternalLink size={14} className="text-brand shrink-0" />
                                <span className="text-sm text-primary group-hover:text-brand transition-colors">{t(labelKey, { defaultValue: labelKey.split('.').pop() })}</span>
                            </a>
                        ))}
                    </div>
                ) : (
                    /* Multi-country: show active country sources with slide animation */
                    <div key={activeCountry} className="animate-fade-in">
                        <div className="flex items-center gap-2 mb-3">
                            <Globe size={14} className="text-brand" />
                            <span className="text-xs font-semibold text-secondary uppercase tracking-wide">
                                {t(`tax:common.country.${activeCountry}`, { defaultValue: activeCountry })}
                            </span>
                        </div>
                        {activeSources.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {activeSources.map(({ labelKey, url }) => (
                                    <a
                                        key={url}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 rounded-xl bg-subtle border border-subtle hover:border-brand/40 p-3 transition-all group"
                                    >
                                        <ExternalLink size={14} className="text-brand shrink-0" />
                                        <span className="text-sm text-primary group-hover:text-brand transition-colors">{t(labelKey, { defaultValue: labelKey.split('.').pop() })}</span>
                                    </a>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-secondary">{t('tax:common.noData')}</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TaxGuide;

