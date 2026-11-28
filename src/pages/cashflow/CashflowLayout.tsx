/**
 * Cash flow page (Epic E52 — TGLA-250): one page, its sections in tabs (overview, flows, categories, distribution,
 * recurring, operations). The header, the period carousel, the account filter and the actions are shared; the
 * period summary reaches each tab through the outlet context.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './cashflowI18n';
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Info, Landmark, Plus, Settings2, Upload } from 'lucide-react';
import Button from '../../components/Button';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { cashflowService } from '../../services/cashflow/cashflowService';
import { cashflowCategoryService, type CategoryOption } from '../../services/cashflow/cashflowCategoryService';
import {
    canMoveForward,
    currentBudgetMonth,
    periodMonths,
    shiftPeriodAnchor,
    type CashflowPeriodPreset,
} from '../../services/cashflow/period';
import { connectionService } from '../../services/connectors/connectionService';
import { woobClient } from '../../services/connectors/woobClient';
import { VAULT_QUOTA_WARNING_RATIO } from '../../services/storage/vaultQuota';
import { CASHFLOW_PAGES, cashflowPageOf } from '../../config/cashflowPages';
import type { CashflowSummary, CustomCashflowCategory } from '../../types/cashflow';
import { AppThinkingOrb } from '../../components/ui/AppThinkingOrb';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useCashflowLabels, type CashflowLabels } from '../../components/cashflow/useCashflowLabels';
import { ManualOperationDialog } from '../../components/cashflow/ManualOperationDialog';
import { CashflowSettingsDialog } from '../../components/cashflow/CashflowSettingsDialog';
import { MerchantLogosProvider } from '../../components/cashflow/CategoryBadge';
import { CashflowEmptyState } from '../../components/cashflow/CashflowEmptyState';

export interface CashAccountOption {
    id: string;
    name: string;
    instituteName?: string;
    currency: string;
    included: boolean;
}

export interface CashflowContextValue {
    preset: CashflowPeriodPreset;
    /** Anchor of the period: the month, the last month of a window, a month of the year */
    month: string;
    /** Picks one month (a bar of the trend chart): the period becomes that month */
    setMonth: (month: string) => void;
    /** "October 2026", "Aug – Oct 2026", "2026" */
    periodLabel: string;
    accountIds: string[] | undefined;
    currency: string;
    summary: CashflowSummary | null;
    loading: boolean;
    /** Bumped after every change: sub-pages reload what they fetch themselves */
    version: number;
    refresh: () => void;
    cashAccounts: CashAccountOption[];
    categories: CategoryOption[];
    customCategories: CustomCashflowCategory[];
    labels: CashflowLabels;
    monthStartDay: number;
    openManual: () => void;
    /** Opens the cash flow settings, on "My categories" to add one */
    openCategorySettings: () => void;
}

export const useCashflow = (): CashflowContextValue => useOutletContext<CashflowContextValue>();

const PRESETS: readonly CashflowPeriodPreset[] = ['month', '3m', '6m', '12m', 'ytd'];

/**
 * Finary-like carousel: the period before and after on each side, the chosen one in the middle. It moves by the
 * period chosen: a month, a block of 3, 6 or 12 months, or a year.
 */
const PeriodCarousel: React.FC<{
    preset: CashflowPeriodPreset;
    anchor: string;
    current: string;
    onChange: (anchor: string) => void;
    labels: CashflowLabels;
}> = ({ preset, anchor, current, onChange, labels }) => {
    const { t } = useTranslation();
    const name = (value: string): string => {
        const { first, last } = periodMonths(preset, value, current);
        return labels.periodName(preset, first, last);
    };
    const previous = shiftPeriodAnchor(preset, anchor, -1, current);
    const canNext = canMoveForward(preset, anchor, current);
    const next = canNext ? shiftPeriodAnchor(preset, anchor, 1, current) : anchor;
    const wide = preset !== 'month' && preset !== 'ytd';
    return (
        <div className="flex items-center gap-1 sm:gap-3 min-w-0" role="group" aria-label={t('cashflow:monthPicker.label')}>
            <button type="button" onClick={() => onChange(previous)} className="p-2 rounded-lg text-secondary hover:bg-subtle hover:text-primary" aria-label={t('cashflow:monthPicker.previous')}>
                <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={() => onChange(previous)} className={`hidden ${wide ? '2xl:block' : 'md:block'} text-lg font-semibold text-tertiary hover:text-secondary capitalize whitespace-nowrap`}>
                {name(previous)}
            </button>
            <span className={`text-xl sm:text-2xl font-bold text-brand capitalize text-center whitespace-nowrap ${wide ? 'min-w-[12rem]' : 'min-w-[9rem]'}`} aria-live="polite">
                {name(anchor)}
            </span>
            <button type="button" onClick={() => canNext && onChange(next)} disabled={!canNext} className={`hidden ${wide ? '2xl:block' : 'md:block'} text-lg font-semibold text-tertiary hover:text-secondary capitalize whitespace-nowrap disabled:opacity-0`}>
                {canNext ? name(next) : ''}
            </button>
            <button type="button" onClick={() => canNext && onChange(next)} disabled={!canNext} className="p-2 rounded-lg text-secondary hover:bg-subtle hover:text-primary disabled:opacity-30" aria-label={t('cashflow:monthPicker.next')}>
                <ChevronRight size={18} />
            </button>
        </div>
    );
};

/** Multi-select of the counted accounts (none ticked = all). */
const AccountFilter: React.FC<{
    accounts: CashAccountOption[];
    selected: string[] | undefined;
    onChange: (ids: string[] | undefined) => void;
}> = ({ accounts, selected, onChange }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEscapeKey(() => setOpen(false), open);
    useEffect(() => {
        if (!open) return undefined;
        const close = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);
    const counted = accounts.filter(a => a.included);
    const label = !selected || selected.length === 0
        ? t('cashflow:accounts.all')
        : t('cashflow:accounts.selected', { count: selected.length });
    const toggle = (id: string) => {
        const current = new Set(selected ?? []);
        if (current.has(id)) current.delete(id);
        else current.add(id);
        onChange(current.size === 0 ? undefined : [...current]);
    };
    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                aria-haspopup="true"
                className="flex items-center gap-2 h-10 px-3 rounded-xl bg-subtle text-primary border border-subtle text-sm font-semibold"
            >
                <span className="text-tertiary">{t('cashflow:accounts.filter')}</span>
                <span className="truncate max-w-[10rem]">{label}</span>
                <ChevronDown size={14} />
            </button>
            {open && (
                <div className="absolute right-0 z-30 mt-2 w-72 bg-card border border-border rounded-xl shadow-xl p-2 space-y-1">
                    {counted.map(account => (
                        <label key={account.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-subtle cursor-pointer text-sm text-primary">
                            <input
                                type="checkbox"
                                checked={selected?.includes(account.id) ?? false}
                                onChange={() => toggle(account.id)}
                                className="rounded border-subtle bg-subtle text-primary focus:ring-primary focus:border-primary"
                            />
                            <span className="flex-1 min-w-0">
                                <span className="block truncate font-medium">{account.name}</span>
                                {account.instituteName && <span className="block truncate text-xs text-tertiary">{account.instituteName}</span>}
                            </span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

/**
 * No bank synced: says where operations come from, a statement imported (CSV, OFX) or a bank connected (desktop app,
 * Docker), with the way to each.
 */
const NoBankConnected: React.FC<{ woobAvailable: boolean }> = ({ woobAvailable }) => {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col md:flex-row md:items-center gap-3 p-4 rounded-xl bg-subtle border border-subtle text-sm" role="note">
            <Info size={18} className="text-brand shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0 space-y-0.5">
                <p className="font-semibold text-primary">{t('cashflow:noBank.title')}</p>
                <p className="text-secondary">{t(woobAvailable ? 'cashflow:noBank.bodyLocal' : 'cashflow:noBank.bodyOnline')}</p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
                <Link to="/import" className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-card border border-subtle text-primary font-semibold hover:border-primary">
                    <Upload size={14} aria-hidden="true" /> {t('cashflow:noBank.import')}
                </Link>
                {woobAvailable && (
                    <Link to="/settings?tab=connections" className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-card border border-subtle text-primary font-semibold hover:border-primary">
                        <Landmark size={14} aria-hidden="true" /> {t('cashflow:noBank.connect')}
                    </Link>
                )}
            </div>
        </div>
    );
};

const CashflowLayout: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const { transactions } = useData();
    const currency = user?.preferences?.currency || 'EUR';
    const page = cashflowPageOf(location.pathname);

    const [settingsMonthStart, setSettingsMonthStart] = useState(1);
    const [merchantLogos, setMerchantLogos] = useState(true);
    const currentMonth = useMemo(() => currentBudgetMonth(new Date(), settingsMonthStart), [settingsMonthStart]);
    const [month, setMonth] = useState<string>(currentMonth);
    const [chosenPreset, setPreset] = useState<CashflowPeriodPreset>('month');
    // The recurring calendar shows one month at a time; the other pages keep the period chosen
    const preset: CashflowPeriodPreset = page.periods === 'month' ? 'month' : chosenPreset;
    const [accountIds, setAccountIds] = useState<string[] | undefined>(undefined);
    const [summary, setSummary] = useState<CashflowSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [version, setVersion] = useState(0);
    const [cashAccounts, setCashAccounts] = useState<CashAccountOption[]>([]);
    const [categories, setCategories] = useState<CategoryOption[]>([]);
    const [hasOperations, setHasOperations] = useState<boolean | null>(null);
    const [bankSynced, setBankSynced] = useState(true);
    const [woobAvailable, setWoobAvailable] = useState(false);
    const [vaultUsage, setVaultUsage] = useState(0);
    const [manualOpen, setManualOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState<false | 'top' | 'categories'>(false);

    const customCategories = useMemo<CustomCashflowCategory[]>(() => categories
        .filter(c => c.custom)
        .map(c => ({ id: c.id, ownerId: '', parentId: c.parentId as CustomCashflowCategory['parentId'], name: c.name ?? c.id, createdAt: '', updatedAt: '' })), [categories]);
    const labels = useCashflowLabels(customCategories);

    const refresh = useCallback(() => setVersion(v => v + 1), []);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const [accounts, options, settings, firstOps, connections] = await Promise.all([
                cashflowService.listCashAccounts(),
                cashflowCategoryService.listCategories(),
                cashflowCategoryService.getSettings(),
                cashflowService.listOperations({ limit: 1, currency }),
                connectionService.listConnections(),
            ]);
            if (cancelled) return;
            setCashAccounts(accounts);
            setCategories(options);
            setSettingsMonthStart(settings.monthStartDay);
            setMerchantLogos(settings.merchantLogos !== false);
            setHasOperations(firstOps.length > 0);
            const counted = new Set(accounts.filter(account => account.included).map(account => account.id));
            setBankSynced(connections.some(connection => Object.values(connection.accountMap).some(id => counted.has(id))));
            setVaultUsage(cashflowService.getVaultUsage());
        })();
        return () => { cancelled = true; };
    }, [version, transactions, currency]);

    useEffect(() => {
        let cancelled = false;
        woobClient.status()
            .then(status => { if (!cancelled) setWoobAvailable(status.available); })
            .catch(() => { if (!cancelled) setWoobAvailable(false); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);
        cashflowService.getSummary({ preset, month, accountIds, currency })
            .then(result => {
                if (cancelled) return;
                setSummary(result);
            })
            .catch(() => { if (!cancelled) setError(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [preset, month, accountIds, currency, version, transactions]);

    const { first, last } = periodMonths(preset, month, currentMonth);
    const periodLabel = labels.periodName(preset, first, last);

    const context: CashflowContextValue = {
        preset,
        month,
        setMonth: (next: string) => { setMonth(next); setPreset('month'); },
        periodLabel,
        accountIds,
        currency,
        summary,
        loading,
        version,
        refresh,
        cashAccounts,
        categories,
        customCategories,
        labels,
        monthStartDay: settingsMonthStart,
        openManual: () => setManualOpen(true),
        openCategorySettings: () => setSettingsOpen('categories'),
    };

    return (
        <MerchantLogosProvider value={merchantLogos}>
        <div className="space-y-6">
            <div className="flex flex-col gap-4 pb-4 border-b border-subtle">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-subtle">
                    <div className="min-w-0">
                        <h1 className="text-3xl font-bold text-primary">{t('cashflow:title')}</h1>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="secondary" onClick={() => navigate('/import')} className="flex items-center gap-2">
                            <Upload size={16} /> {t('cashflow:actions.import')}
                        </Button>
                        <Button onClick={() => setManualOpen(true)} className="flex items-center gap-2">
                            <Plus size={16} /> {t('cashflow:actions.create')}
                        </Button>
                        <Button variant="secondary" onClick={() => setSettingsOpen('top')} aria-label={t('cashflow:actions.settings')} title={t('cashflow:actions.settings')}>
                            <Settings2 size={18} />
                        </Button>
                    </div>
                </div>

                {hasOperations !== false && (
                    <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
                        <PeriodCarousel
                            preset={preset}
                            anchor={month}
                            current={currentMonth}
                            onChange={setMonth}
                            labels={labels}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            {page.periods === 'any' && (
                                <div className="flex gap-1 bg-subtle p-1 rounded-xl h-10" role="group" aria-label={t('cashflow:periods.label')}>
                                    {PRESETS.map(option => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setPreset(option)}
                                            aria-pressed={preset === option}
                                            className={`px-3 rounded-lg text-xs font-bold transition-all ${
                                                preset === option ? 'bg-card text-brand shadow-sm border border-subtle' : 'text-secondary hover:text-primary'
                                            }`}
                                        >
                                            {t(`cashflow:periods.${option}`)}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <AccountFilter accounts={cashAccounts} selected={accountIds} onChange={setAccountIds} />
                        </div>
                    </div>
                )}

                <nav className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mb-4" aria-label={t('cashflow:tabsLabel')}>
                    {CASHFLOW_PAGES.map(tab => (
                        <NavLink
                            key={tab.key}
                            to={tab.path}
                            end={tab.key === 'overview'}
                            className={({ isActive }) => `flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                                isActive ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-primary'
                            }`}
                        >
                            <tab.icon size={16} /> {t(`cashflow:pages.${tab.key}.title`)}
                        </NavLink>
                    ))}
                </nav>
            </div>

            {!bankSynced && hasOperations !== false && <NoBankConnected woobAvailable={woobAvailable} />}

            {vaultUsage >= VAULT_QUOTA_WARNING_RATIO && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-warning-subtle border border-warning text-sm text-primary" role="status">
                    <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
                    <span>{t('cashflow:quota.warning', { percent: Math.round(vaultUsage * 100) })}</span>
                </div>
            )}

            {hasOperations === false ? (
                <CashflowEmptyState onCreate={() => setManualOpen(true)} woobAvailable={woobAvailable} />
            ) : error ? (
                <p className="text-sm text-negative" role="alert">{t('cashflow:errors.load')}</p>
            ) : !summary && loading ? (
                <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3" role="status">
                    <AppThinkingOrb state="searching" size={72} label={t('cashflow:loading')} />
                    <span className="text-sm font-semibold text-secondary">{t('cashflow:loading')}</span>
                </div>
            ) : (
                <React.Suspense fallback={<div className="min-h-[40vh] flex items-center justify-center" role="status"><AppThinkingOrb state="searching" size={64} label={t('cashflow:loading')} /></div>}>
                    {/* Keyed by page: every page plays the entrance, like the rest of the app */}
                    <div key={location.pathname} className="animate-fade-in-up">
                        <Outlet context={context} />
                    </div>
                </React.Suspense>
            )}

            {manualOpen && (
                <ManualOperationDialog
                    accounts={cashAccounts}
                    categories={categories}
                    labels={labels}
                    onClose={() => setManualOpen(false)}
                    onSaved={() => { setManualOpen(false); refresh(); }}
                />
            )}
            {settingsOpen && (
                <CashflowSettingsDialog
                    categories={categories}
                    customCategories={customCategories}
                    labels={labels}
                    onClose={() => setSettingsOpen(false)}
                    onChanged={refresh}
                    focus={settingsOpen === 'categories' ? 'categories' : undefined}
                />
            )}
        </div>
        </MerchantLogosProvider>
    );
};

export default CashflowLayout;
