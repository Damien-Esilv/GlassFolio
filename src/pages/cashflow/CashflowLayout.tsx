/**
 * Cash flow section (Epic E52 — TGLA-250): header, month carousel, period, account filter and tabs
 * shared by every sub-page. Sub-pages read the period summary from the outlet context.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './cashflowI18n';
import {
    AlertTriangle, ChartPie, ChevronDown, ChevronLeft, ChevronRight, LayoutDashboard, ListOrdered,
    Plus, Settings2, Upload, Waypoints, ChartNoAxesColumn,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { cashflowService } from '../../services/cashflow/cashflowService';
import { cashflowCategoryService, type CategoryOption } from '../../services/cashflow/cashflowCategoryService';
import { currentBudgetMonth, shiftBudgetMonth, type CashflowPeriodPreset } from '../../services/cashflow/period';
import { VAULT_QUOTA_WARNING_RATIO } from '../../services/storage/vaultQuota';
import type { CashflowSummary, CustomCashflowCategory } from '../../types/cashflow';
import { AppThinkingOrb } from '../../components/ui/AppThinkingOrb';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useCashflowLabels, type CashflowLabels } from '../../components/cashflow/useCashflowLabels';
import { ManualOperationDialog } from '../../components/cashflow/ManualOperationDialog';
import { CashflowSettingsDialog } from '../../components/cashflow/CashflowSettingsDialog';
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
    month: string;
    setMonth: (month: string) => void;
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
}

export const useCashflow = (): CashflowContextValue => useOutletContext<CashflowContextValue>();

const PRESETS: readonly CashflowPeriodPreset[] = ['month', '3m', '6m', '12m', 'ytd'];

const TABS = [
    { to: '/cashflow', end: true, key: 'overview', icon: LayoutDashboard },
    { to: '/cashflow/flows', end: false, key: 'flows', icon: Waypoints },
    { to: '/cashflow/categories', end: false, key: 'categories', icon: ChartPie },
    { to: '/cashflow/distribution', end: false, key: 'distribution', icon: ChartNoAxesColumn },
    { to: '/cashflow/operations', end: false, key: 'operations', icon: ListOrdered },
] as const;

/** Finary-like month carousel: previous and next months on each side, the selected one in the middle. */
const MonthCarousel: React.FC<{ month: string; maxMonth: string; onChange: (month: string) => void; labels: CashflowLabels }> = ({ month, maxMonth, onChange, labels }) => {
    const { t } = useTranslation();
    const previous = shiftBudgetMonth(month, -1);
    const next = shiftBudgetMonth(month, 1);
    const canNext = next <= maxMonth;
    return (
        <div className="flex items-center gap-1 sm:gap-3" role="group" aria-label={t('cashflow:monthPicker.label')}>
            <button
                type="button"
                onClick={() => onChange(previous)}
                className="p-2 rounded-lg text-secondary hover:bg-subtle hover:text-primary"
                aria-label={t('cashflow:monthPicker.previous')}
            >
                <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={() => onChange(previous)} className="hidden md:block text-lg font-semibold text-tertiary hover:text-secondary capitalize">
                {labels.monthName(previous)}
            </button>
            <span className="text-xl sm:text-2xl font-bold text-brand capitalize min-w-[9rem] text-center" aria-live="polite">
                {labels.monthName(month)}
            </span>
            <button
                type="button"
                onClick={() => canNext && onChange(next)}
                disabled={!canNext}
                className="hidden md:block text-lg font-semibold text-tertiary hover:text-secondary capitalize disabled:opacity-0"
            >
                {labels.monthName(next)}
            </button>
            <button
                type="button"
                onClick={() => canNext && onChange(next)}
                disabled={!canNext}
                className="p-2 rounded-lg text-secondary hover:bg-subtle hover:text-primary disabled:opacity-30"
                aria-label={t('cashflow:monthPicker.next')}
            >
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
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-subtle text-primary border border-subtle text-sm font-semibold"
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

const CashflowLayout: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { transactions } = useData();
    const currency = user?.preferences?.currency || 'EUR';

    const [settingsMonthStart, setSettingsMonthStart] = useState(1);
    const currentMonth = useMemo(() => currentBudgetMonth(new Date(), settingsMonthStart), [settingsMonthStart]);
    const [month, setMonth] = useState<string>(currentMonth);
    const [preset, setPreset] = useState<CashflowPeriodPreset>('month');
    const [accountIds, setAccountIds] = useState<string[] | undefined>(undefined);
    const [summary, setSummary] = useState<CashflowSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [version, setVersion] = useState(0);
    const [cashAccounts, setCashAccounts] = useState<CashAccountOption[]>([]);
    const [categories, setCategories] = useState<CategoryOption[]>([]);
    const [hasOperations, setHasOperations] = useState<boolean | null>(null);
    const [vaultUsage, setVaultUsage] = useState(0);
    const [manualOpen, setManualOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const autoPicked = useRef(false);

    const customCategories = useMemo<CustomCashflowCategory[]>(() => categories
        .filter(c => c.custom)
        .map(c => ({ id: c.id, ownerId: '', parentId: c.parentId as CustomCashflowCategory['parentId'], name: c.name ?? c.id, createdAt: '', updatedAt: '' })), [categories]);
    const labels = useCashflowLabels(customCategories);

    const refresh = useCallback(() => setVersion(v => v + 1), []);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const [accounts, options, settings, firstOps] = await Promise.all([
                cashflowService.listCashAccounts(),
                cashflowCategoryService.listCategories(),
                cashflowCategoryService.getSettings(),
                cashflowService.listOperations({ limit: 1, currency }),
            ]);
            if (cancelled) return;
            setCashAccounts(accounts);
            setCategories(options);
            setSettingsMonthStart(settings.monthStartDay);
            setHasOperations(firstOps.length > 0);
            setVaultUsage(cashflowService.getVaultUsage());
        })();
        return () => { cancelled = true; };
    }, [version, transactions, currency]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);
        cashflowService.getSummary({ preset, month, accountIds, currency })
            .then(result => {
                if (cancelled) return;
                // First visit: open on the latest month that already has income (the current one usually
                // waits for the salary), like a statement that is complete
                if (!autoPicked.current && preset === 'month') {
                    autoPicked.current = true;
                    const index = result.months.findIndex(m => m.month === month);
                    const previous = index > 0 ? result.months[index - 1] : undefined;
                    if (index >= 0 && previous && previous.income > 0 && result.months[index].income < previous.income / 2) {
                        setMonth(previous.month);
                        return;
                    }
                }
                setSummary(result);
            })
            .catch(() => { if (!cancelled) setError(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [preset, month, accountIds, currency, version, transactions]);

    const context: CashflowContextValue = {
        preset,
        month,
        setMonth: (next: string) => { setMonth(next); setPreset('month'); },
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
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 pb-4 border-b border-subtle">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-primary">{t('cashflow:title')}</h1>
                        <p className="text-secondary text-sm">{t('cashflow:subtitle')}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => navigate('/import?kind=bank')}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-subtle text-primary border border-subtle text-sm font-semibold hover:border-primary"
                        >
                            <Upload size={16} /> {t('cashflow:actions.import')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setManualOpen(true)}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90"
                        >
                            <Plus size={16} /> {t('cashflow:actions.create')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setSettingsOpen(true)}
                            className="p-2 rounded-xl bg-subtle text-secondary border border-subtle hover:text-primary"
                            aria-label={t('cashflow:actions.settings')}
                            title={t('cashflow:actions.settings')}
                        >
                            <Settings2 size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
                    <MonthCarousel month={month} maxMonth={currentMonth} onChange={next => { setMonth(next); setPreset('month'); }} labels={labels} />
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex gap-1 bg-subtle p-1 rounded-xl" role="group" aria-label={t('cashflow:periods.label')}>
                            {PRESETS.map(option => (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => setPreset(option)}
                                    aria-pressed={preset === option}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        preset === option ? 'bg-card text-brand shadow-sm border border-subtle' : 'text-secondary hover:text-primary'
                                    }`}
                                >
                                    {t(`cashflow:periods.${option}`)}
                                </button>
                            ))}
                        </div>
                        <AccountFilter accounts={cashAccounts} selected={accountIds} onChange={setAccountIds} />
                    </div>
                </div>

                <nav className="flex gap-1 overflow-x-auto -mb-4" aria-label={t('cashflow:tabs.label')}>
                    {TABS.map(tab => (
                        <NavLink
                            key={tab.key}
                            to={tab.to}
                            end={tab.end}
                            className={({ isActive }) => `flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                                isActive ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-primary'
                            }`}
                        >
                            <tab.icon size={16} /> {t(`cashflow:tabs.${tab.key}`)}
                        </NavLink>
                    ))}
                </nav>
            </div>

            {vaultUsage >= VAULT_QUOTA_WARNING_RATIO && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-warning-subtle border border-warning text-sm text-primary" role="status">
                    <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
                    <span>{t('cashflow:quota.warning', { percent: Math.round(vaultUsage * 100) })}</span>
                </div>
            )}

            {hasOperations === false ? (
                <CashflowEmptyState onCreate={() => setManualOpen(true)} />
            ) : error ? (
                <p className="text-sm text-negative" role="alert">{t('cashflow:errors.load')}</p>
            ) : !summary && loading ? (
                <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3" role="status">
                    <AppThinkingOrb state="searching" size={72} label={t('cashflow:loading')} />
                    <span className="text-sm font-semibold text-secondary">{t('cashflow:loading')}</span>
                </div>
            ) : (
                <React.Suspense fallback={<div className="min-h-[40vh] flex items-center justify-center" role="status"><AppThinkingOrb state="searching" size={64} label={t('cashflow:loading')} /></div>}>
                    <Outlet context={context} />
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
                />
            )}
        </div>
    );
};

export default CashflowLayout;
