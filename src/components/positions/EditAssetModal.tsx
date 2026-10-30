import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Info, X } from 'lucide-react';
import Button from '../Button';
import type { InstrumentType, Position } from '../../types';
import {
    INSTRUMENT_TYPES,
    InstrumentIssue,
    InstrumentPatch,
    InstrumentValidationError,
    instrumentService,
} from '../../services/instrumentService';
import { saveManualPrice } from '../../services/priceService';

interface EditAssetModalProps {
    position: Position;
    onClose: () => void;
    /** Called after a successful save, to reload the positions. */
    onSaved: () => Promise<void> | void;
}

const fieldClass =
    'w-full bg-subtle text-primary border border-subtle text-sm rounded-lg p-2.5 focus:ring-primary focus:border-primary';

/**
 * Edits every metadata field of the asset behind a position (name, symbol, ISIN, type, exchange, network,
 * contract, currency) with live integrity checks, plus its manual price. A duplicate can be merged into.
 */
export const EditAssetModal: React.FC<EditAssetModalProps> = ({ position, onClose, onSaved }) => {
    const { t } = useTranslation('portfolio');
    const instrument = useMemo(() => instrumentService.findInstrumentForPosition(position), [position]);

    const [name, setName] = useState(instrument?.name ?? position.instrument);
    const [symbol, setSymbol] = useState(instrument?.marketIdentifier.symbol ?? position.symbol);
    const [type, setType] = useState<InstrumentType>(instrument?.type ?? 'stock');
    const [isin, setIsin] = useState(instrument?.marketIdentifier.isin ?? '');
    const [exchange, setExchange] = useState(instrument?.marketIdentifier.exchange ?? '');
    const [network, setNetwork] = useState(instrument?.marketIdentifier.network ?? '');
    const [contractAddress, setContractAddress] = useState(instrument?.marketIdentifier.contractAddress ?? '');
    const [currency, setCurrency] = useState(instrument?.denominationCurrency ?? position.currency);
    const [price, setPrice] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveIssues, setSaveIssues] = useState<InstrumentIssue[]>([]);
    const [failed, setFailed] = useState(false);

    const patch: InstrumentPatch = { name, symbol, type, isin, exchange, network, contractAddress, denominationCurrency: currency };
    const liveIssues = useMemo(
        () => (instrument ? instrumentService.previewInstrumentIssues(instrument.id, patch) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- patch is rebuilt from these fields
        [instrument, name, symbol, type, isin, exchange, network, contractAddress, currency]
    );
    const issues = saveIssues.length > 0 ? saveIssues : liveIssues;
    const duplicates = issues.filter(i => i.code === 'INSTRUMENT_DUPLICATE');
    const blocking = issues.some(i => i.severity === 'error' && i.code !== 'INSTRUMENT_DUPLICATE');

    const describe = (issue: InstrumentIssue): string =>
        t(`positions.editAsset.issues.${issue.code}`, issue.params);

    const save = async (mergeInto?: string): Promise<void> => {
        setSaving(true);
        setFailed(false);
        setSaveIssues([]);
        try {
            let finalSymbol = symbol.trim() || position.symbol;
            if (instrument) {
                const res = await instrumentService.updateInstrument(instrument.id, patch, { mergeInto });
                finalSymbol = res.instrument.marketIdentifier.symbol;
            }
            const newPrice = parseFloat(price);
            if (!isNaN(newPrice) && newPrice > 0) saveManualPrice(finalSymbol, newPrice);
            await onSaved();
            onClose();
        } catch (err: unknown) {
            if (err instanceof InstrumentValidationError) setSaveIssues(err.issues);
            else setFailed(true);
        } finally {
            setSaving(false);
        }
    };

    const field = (id: string, label: string, value: string, set: (v: string) => void, opts?: { mono?: boolean; placeholder?: string }) => (
        <div>
            <label htmlFor={id} className="block text-xs font-medium text-secondary mb-1">{label}</label>
            <input
                id={id}
                type="text"
                value={value}
                placeholder={opts?.placeholder}
                onChange={e => set(e.target.value)}
                className={`${fieldClass} ${opts?.mono ? 'font-mono' : ''}`}
            />
        </div>
    );

    if (typeof document === 'undefined') return null;
    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div role="dialog" aria-modal="true" aria-label={t('positions.editAsset.title')} className="bg-card border border-subtle rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-subtle pb-3">
                    <div>
                        <h3 className="text-lg font-bold text-primary">{t('positions.editAsset.title')}</h3>
                        <p className="text-xs text-tertiary">{position.instrument} ({position.symbol})</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-subtle text-secondary" aria-label={t('positions.manualModal.cancel')}>
                        <X size={18} />
                    </button>
                </div>

                {instrument ? (
                    <div className="space-y-3">
                        {field('asset-name', t('positions.editAsset.name'), name, setName)}
                        <div className="grid grid-cols-2 gap-3">
                            {field('asset-symbol', t('positions.editAsset.symbol'), symbol, setSymbol, { mono: true })}
                            <div>
                                <label htmlFor="asset-type" className="block text-xs font-medium text-secondary mb-1">{t('positions.editAsset.type')}</label>
                                <select id="asset-type" value={type} onChange={e => setType(e.target.value as InstrumentType)} className={fieldClass}>
                                    {INSTRUMENT_TYPES.map(value => (
                                        <option key={value} value={value}>{t(`positions.editAsset.types.${value}`)}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {field('asset-isin', t('positions.editAsset.isin'), isin, setIsin, { mono: true })}
                            {field('asset-currency', t('positions.editAsset.currency'), currency, setCurrency, { mono: true })}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {field('asset-exchange', t('positions.editAsset.exchange'), exchange, setExchange)}
                            {field('asset-network', t('positions.editAsset.network'), network, setNetwork)}
                        </div>
                        {field('asset-contract', t('positions.editAsset.contractAddress'), contractAddress, setContractAddress, { mono: true })}
                    </div>
                ) : (
                    <p className="text-xs text-warning flex items-start gap-2">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <span>{t('positions.editAsset.noInstrument')}</span>
                    </p>
                )}

                <div>
                    <label htmlFor="asset-price" className="block text-xs font-medium text-secondary mb-1">
                        {t('positions.manualModal.priceLabel', { currency: position.currency || 'EUR' })}
                    </label>
                    <input
                        id="asset-price"
                        type="number"
                        step="any"
                        min="0"
                        placeholder={position.lastPrice.toString()}
                        value={price}
                        onChange={e => setPrice(e.target.value)}
                        className={`${fieldClass} font-mono`}
                    />
                    {type === 'other' && <p className="text-[11px] text-tertiary mt-1">{t('positions.editAsset.otherPriceHint')}</p>}
                </div>

                {issues.length > 0 && (
                    <ul className="space-y-1.5" aria-live="polite">
                        {issues.map((issue, idx) => (
                            <li
                                key={`${issue.code}-${idx}`}
                                className={`flex items-start gap-2 text-xs ${issue.severity === 'error' ? 'text-error' : issue.severity === 'warning' ? 'text-warning' : 'text-tertiary'}`}
                            >
                                {issue.severity === 'info' ? <Info size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
                                <span>{describe(issue)}</span>
                            </li>
                        ))}
                    </ul>
                )}
                {failed && <p className="text-xs text-error">{t('positions.editAsset.saveFailed')}</p>}

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-subtle">
                    {duplicates.map(dup => (
                        <Button key={dup.params?.id} variant="secondary" size="sm" disabled={saving || blocking} onClick={() => void save(dup.params?.id)}>
                            {t('positions.editAsset.mergeInto', { name: dup.params?.name, symbol: dup.params?.symbol })}
                        </Button>
                    ))}
                    <Button variant="ghost" size="sm" onClick={onClose}>{t('positions.manualModal.cancel')}</Button>
                    <Button size="sm" disabled={saving || blocking || duplicates.length > 0} onClick={() => void save()}>
                        {t('positions.editAsset.save')}
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
};
