import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Info, Pencil } from 'lucide-react';
import Button from '../Button';
import type { Instrument, InstrumentType } from '../../types';
import type { ImportInstrumentSummary } from '../../services/import/importManager';
import {
    INSTRUMENT_TYPES,
    InstrumentIssue,
    InstrumentPatch,
    InstrumentValidationError,
} from '../../services/instrumentService';

interface ImportAssetsTableProps {
    instruments: ImportInstrumentSummary[];
    onUpdate: (instrumentId: string, patch: InstrumentPatch, mergeInto?: string) => Promise<void>;
    preview: (instrumentId: string, patch: InstrumentPatch) => InstrumentIssue[];
}

const inputClass =
    'w-full bg-subtle text-primary border border-subtle text-sm rounded-lg p-2 focus:ring-primary focus:border-primary';

/** Form state of one asset being edited: every field of the patch, as text. */
const toForm = (i: Instrument) => ({
    name: i.name,
    symbol: i.marketIdentifier.symbol,
    isin: i.marketIdentifier.isin ?? '',
    exchange: i.marketIdentifier.exchange ?? '',
    network: i.marketIdentifier.network ?? '',
    contractAddress: i.marketIdentifier.contractAddress ?? '',
    denominationCurrency: i.denominationCurrency,
});

const AssetEditor: React.FC<{
    summary: ImportInstrumentSummary;
    onUpdate: ImportAssetsTableProps['onUpdate'];
    preview: ImportAssetsTableProps['preview'];
    onDone: () => void;
}> = ({ summary, onUpdate, preview, onDone }) => {
    const { t } = useTranslation(['transactions', 'portfolio']);
    const { instrument } = summary;
    const [form, setForm] = useState(() => toForm(instrument));
    const [saveIssues, setSaveIssues] = useState<InstrumentIssue[]>([]);
    const [busy, setBusy] = useState(false);

    const patch: InstrumentPatch = { ...form };
    const issues = saveIssues.length > 0 ? saveIssues : preview(instrument.id, patch);
    const duplicates = issues.filter(i => i.code === 'INSTRUMENT_DUPLICATE');
    const blocking = issues.some(i => i.severity === 'error' && i.code !== 'INSTRUMENT_DUPLICATE');

    const save = async (mergeInto?: string): Promise<void> => {
        setBusy(true);
        setSaveIssues([]);
        try {
            await onUpdate(instrument.id, patch, mergeInto);
            onDone();
        } catch (err: unknown) {
            if (err instanceof InstrumentValidationError) setSaveIssues(err.issues);
        } finally {
            setBusy(false);
        }
    };

    const field = (key: keyof typeof form, label: string, mono = false) => (
        <div>
            <label htmlFor={`${instrument.id}-${String(key)}`} className="block text-xs font-medium text-secondary mb-1">{label}</label>
            <input
                id={`${instrument.id}-${String(key)}`}
                value={form[key]}
                onChange={e => { setSaveIssues([]); setForm({ ...form, [key]: e.target.value }); }}
                className={`${inputClass} ${mono ? 'font-mono' : ''}`}
            />
        </div>
    );

    return (
        <div className="space-y-3 p-4 bg-subtle/50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {field('name', t('portfolio:positions.editAsset.name'))}
                {field('symbol', t('portfolio:positions.editAsset.symbol'), true)}
                {field('isin', t('portfolio:positions.editAsset.isin'), true)}
                {field('exchange', t('portfolio:positions.editAsset.exchange'))}
                {field('network', t('portfolio:positions.editAsset.network'))}
                {field('contractAddress', t('portfolio:positions.editAsset.contractAddress'), true)}
                {field('denominationCurrency', t('portfolio:positions.editAsset.currency'), true)}
            </div>
            {!summary.isNew && (
                <p className="text-xs text-tertiary flex items-start gap-2">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    <span>{t('transactions:importWizard.assets.existingNote')}</span>
                </p>
            )}
            {issues.length > 0 && (
                <ul className="space-y-1" aria-live="polite">
                    {issues.map((issue, idx) => (
                        <li key={`${issue.code}-${idx}`} className={`flex items-start gap-2 text-xs ${issue.severity === 'error' ? 'text-error' : issue.severity === 'warning' ? 'text-warning' : 'text-tertiary'}`}>
                            {issue.severity === 'info' ? <Info size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
                            <span>{t(`portfolio:positions.editAsset.issues.${issue.code}`, issue.params)}</span>
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex flex-wrap justify-end gap-2">
                {duplicates.map(dup => (
                    <Button key={dup.params?.id} size="sm" variant="secondary" disabled={busy || blocking} onClick={() => void save(dup.params?.id)}>
                        {t('portfolio:positions.editAsset.mergeInto', { name: dup.params?.name, symbol: dup.params?.symbol })}
                    </Button>
                ))}
                <Button size="sm" variant="ghost" onClick={onDone}>{t('transactions:importWizard.assets.cancel')}</Button>
                <Button size="sm" disabled={busy || blocking || duplicates.length > 0} onClick={() => void save()}>
                    {t('transactions:importWizard.assets.apply')}
                </Button>
            </div>
        </div>
    );
};

/** Review of the assets an import creates or uses: every metadata field can be corrected before confirming. */
export const ImportAssetsTable: React.FC<ImportAssetsTableProps> = ({ instruments, onUpdate, preview }) => {
    const { t } = useTranslation(['transactions', 'portfolio']);
    const [editingId, setEditingId] = useState<string | null>(null);

    if (instruments.length === 0) return null;

    const changeType = async (summary: ImportInstrumentSummary, type: InstrumentType): Promise<void> => {
        try {
            await onUpdate(summary.instrument.id, { type });
        } catch {
            // The detail editor shows why an edit is refused
            setEditingId(summary.instrument.id);
        }
    };

    return (
        <div className="bg-card border border-subtle rounded-xl overflow-hidden shadow-sm" data-testid="import-assets">
            <div className="px-4 py-3 border-b border-subtle">
                <h3 className="text-sm font-semibold text-primary">{t('transactions:importWizard.assets.title')}</h3>
                <p className="text-xs text-tertiary mt-0.5">{t('transactions:importWizard.assets.subtitle')}</p>
            </div>
            <div className="max-h-[360px] overflow-y-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-subtle text-xs uppercase text-secondary sticky top-0 z-10">
                        <tr>
                            <th className="px-4 py-2">{t('transactions:importWizard.assets.columns.asset')}</th>
                            <th className="px-4 py-2">{t('transactions:importWizard.assets.columns.type')}</th>
                            <th className="px-4 py-2">{t('transactions:importWizard.assets.columns.identifiers')}</th>
                            <th className="px-4 py-2">{t('transactions:importWizard.assets.columns.price')}</th>
                            <th className="px-4 py-2 text-right">{t('transactions:importWizard.assets.columns.rows')}</th>
                            <th className="px-4 py-2 w-12" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-subtle">
                        {instruments.map(summary => {
                            const { instrument } = summary;
                            const id = instrument.marketIdentifier;
                            const manualPrice = instrument.type === 'other' || !instrument.isMarketReady;
                            return (
                                <React.Fragment key={instrument.id}>
                                    <tr>
                                        <td className="px-4 py-2.5">
                                            <div className="font-semibold text-primary">{id.symbol}</div>
                                            <div className="text-xs text-tertiary">
                                                {instrument.name !== id.symbol ? `${instrument.name} · ` : ''}
                                                {summary.isNew ? t('transactions:importWizard.assets.badgeNew') : t('transactions:importWizard.assets.badgeExisting')}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <select
                                                aria-label={`${t('transactions:importWizard.assets.columns.type')} ${id.symbol}`}
                                                value={instrument.type}
                                                onChange={e => void changeType(summary, e.target.value as InstrumentType)}
                                                className="bg-subtle text-primary border border-subtle text-xs rounded-lg p-1.5 focus:ring-primary focus:border-primary"
                                            >
                                                {INSTRUMENT_TYPES.map(type => (
                                                    <option key={type} value={type}>{t(`portfolio:positions.editAsset.types.${type}`)}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-4 py-2.5 text-xs text-secondary font-mono">
                                            {[id.isin, id.exchange, id.network].filter(Boolean).join(' · ') || t('transactions:importWizard.common.emptyValue')}
                                        </td>
                                        <td className="px-4 py-2.5 text-xs">
                                            <span className={`inline-flex items-center gap-1 ${manualPrice ? 'text-warning' : 'text-positive'}`}>
                                                {manualPrice ? <AlertTriangle size={12} /> : <Check size={12} />}
                                                {manualPrice ? t('transactions:importWizard.assets.priceManual') : t('transactions:importWizard.assets.priceAuto')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-mono text-secondary">{summary.rowCount}</td>
                                        <td className="px-4 py-2.5 text-right">
                                            <button
                                                onClick={() => setEditingId(editingId === instrument.id ? null : instrument.id)}
                                                className="p-1.5 text-brand hover:text-brand/80"
                                                title={t('transactions:importWizard.assets.editDetails')}
                                                aria-label={`${t('transactions:importWizard.assets.editDetails')} ${id.symbol}`}
                                            >
                                                <Pencil size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                    {editingId === instrument.id && (
                                        <tr>
                                            <td colSpan={6} className="p-0">
                                                <AssetEditor summary={summary} onUpdate={onUpdate} preview={preview} onDone={() => setEditingId(null)} />
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
