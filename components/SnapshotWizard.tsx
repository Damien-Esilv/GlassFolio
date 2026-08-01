/**
 * Snapshot Wizard Components
 * 
 * Snapshot-specific UI for importing positions with optional reconciliation.
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button';
import {
    AlertCircle,
    CheckCircle,
    ArrowRight,
    AlertTriangle,
    Camera,
    ListChecks,
    TrendingUp,
    TrendingDown,
    Minus,
    Plus,
    Edit2,
    DollarSign
} from 'lucide-react';
import { useSnapshotImport, SNAPSHOT_MAPPABLE_FIELDS } from '../hooks/useSnapshotImport';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, CURRENCY_SYMBOLS } from '../utils/currency';

// ============================================================================
// MAIN SNAPSHOT WIZARD
// ============================================================================

interface SnapshotWizardProps {
    accountId: string;
    accountName: string;
    rawCSVText: string;
    headers: string[];
    previewRows: string[][];
    onBack: () => void;
    onComplete: () => void;
}

const SnapshotWizard: React.FC<SnapshotWizardProps> = ({
    accountId,
    accountName,
    rawCSVText,
    headers,
    previewRows,
    onBack,
    onComplete
}) => {
    const { t } = useTranslation('transactions');
    const snapshot = useSnapshotImport(accountId, rawCSVText, headers, previewRows);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Camera className="text-brand" size={28} />
                <div>
                    <h2 className="text-xl font-bold text-primary">{t('snapshotWizard.title')}</h2>
                    <p className="text-secondary text-sm">{t('snapshotWizard.subtitle', { accountName })}</p>
                </div>
            </div>

            {/* Error Banner */}
            {snapshot.error && (
                <div className="bg-error/10 border border-error/20 rounded-xl p-4 flex items-center gap-3">
                    <AlertCircle className="text-error" size={20} />
                    <span className="text-error">{snapshot.error}</span>
                </div>
            )}

            {/* Loading */}
            {snapshot.isLoading && (
                <div className="fixed inset-0 bg-canvas/80 z-50 flex items-center justify-center backdrop-blur-sm">
                    <div className="text-center">
                        <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-primary">{t('common:labels.processing')}</p>
                    </div>
                </div>
            )}

            {/* Step Content */}
            {snapshot.step === 'mapping' && (
                <SnapshotMappingStep snapshot={snapshot} headers={headers} previewRows={previewRows} />
            )}

            {snapshot.step === 'options' && (
                <SnapshotOptionsStep snapshot={snapshot} />
            )}

            {snapshot.step === 'preview' && (
                <SnapshotPreviewStep snapshot={snapshot} />
            )}

            {snapshot.step === 'complete' && (
                <SnapshotCompleteStep snapshot={snapshot} onComplete={onComplete} />
            )}

            {/* Navigation */}
            {snapshot.step !== 'complete' && (
                <div className="flex justify-between pt-8 border-t border-subtle">
                    <Button
                        variant="secondary"
                        onClick={snapshot.step === 'mapping' ? onBack : snapshot.goBack}
                    >
                        {t('common:buttons.back')}
                    </Button>

                    {snapshot.step === 'mapping' && (
                        <Button onClick={snapshot.proceedToOptions} disabled={!snapshot.isValidMapping}>
                            {t('common:buttons.next')} <ArrowRight size={18} className="ml-2" />
                        </Button>
                    )}

                    {snapshot.step === 'options' && (
                        <Button onClick={snapshot.analyzeAndPreview}>
                            {t('snapshotWizard.buttons.analyze')} <ArrowRight size={18} className="ml-2" />
                        </Button>
                    )}

                    {snapshot.step === 'preview' && (
                        <Button onClick={snapshot.commitImport} disabled={!snapshot.canCommit}>
                            {t('snapshotWizard.buttons.importPositions')}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// STEP 1: MAPPING
// ============================================================================

const SnapshotMappingStep: React.FC<{
    snapshot: ReturnType<typeof useSnapshotImport>;
    headers: string[];
    previewRows: string[][];
}> = ({ snapshot, headers, previewRows }) => {
    const { t } = useTranslation('transactions');

    const getMappedValue = (row: string[], field: string): string => {
        const mapping = snapshot.mappings[field as keyof typeof snapshot.mappings];
        if (mapping === undefined) return t('snapshotWizard.common.emptyValue');
        const idx = typeof mapping === 'number' ? mapping : headers.indexOf(mapping as string);
        return idx >= 0 && row[idx] ? row[idx] : t('snapshotWizard.common.emptyValue');
    };

    return (
        <div className="space-y-6">
            {/* Info Banner */}
            <div className="bg-brand/10 border border-brand/20 rounded-xl p-4">
                <h3 className="text-brand font-medium mb-2">{t('snapshotWizard.mapping.title')}</h3>
                <p className="text-secondary text-sm">
                    {t('snapshotWizard.mapping.description')}
                </p>
            </div>

            {/* Mapping Grid */}
            <div className="bg-card border border-subtle rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-bold text-primary mb-4">{t('snapshotWizard.mapping.fieldsTitle')}</h3>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {SNAPSHOT_MAPPABLE_FIELDS.map(field => (
                        <div key={field.key} className="space-y-1">
                            <label className="flex items-center gap-1 text-xs font-bold text-secondary uppercase">
                                {t(field.labelKey)}
                                {field.required && <span className="text-error">*</span>}
                            </label>
                            <select
                                value={snapshot.mappings[field.key as keyof typeof snapshot.mappings] as string || ''}
                                onChange={e => snapshot.setMapping(field.key as keyof typeof snapshot.mappings, e.target.value || undefined)}
                                className={`w-full bg-subtle border text-primary text-sm rounded-lg p-2.5 ${field.required && !snapshot.mappings[field.key as keyof typeof snapshot.mappings]
                                    ? 'border-error/50'
                                    : 'border-subtle'
                                    }`}
                            >
                                <option value="">{t('snapshotWizard.mapping.notMappedOption')}</option>
                                {headers.map(h => (
                                    <option key={h} value={h}>{h}</option>
                                ))}
                            </select>
                            {field.hintKey && (
                                <p className="text-xs text-secondary">{t(field.hintKey)}</p>
                            )}
                        </div>
                    ))}
                </div>

                {/* Validation message */}
                {!snapshot.isValidMapping && (
                    <p className="text-warning text-sm mt-4">
                        <AlertTriangle size={14} className="inline mr-1" />
                        {t('snapshotWizard.mapping.validation')}
                    </p>
                )}
            </div>

            {/* Preview */}
            {previewRows.length > 0 && (
                <div className="bg-card border border-subtle rounded-xl overflow-hidden shadow-sm">
                    <div className="px-4 py-3 border-b border-subtle bg-subtle/50">
                        <h3 className="text-sm font-bold text-primary">{t('snapshotWizard.preview.title')}</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-subtle text-xs uppercase text-secondary">
                                <tr>
                                    <th className="px-4 py-2">{t('snapshotWizard.preview.table.symbol')}</th>
                                    <th className="px-4 py-2">{t('snapshotWizard.preview.table.isin')}</th>
                                    <th className="px-4 py-2 text-right">{t('snapshotWizard.preview.table.quantity')}</th>
                                    <th className="px-4 py-2 text-right">{t('snapshotWizard.preview.table.avgPrice')}</th>
                                    <th className="px-4 py-2">{t('snapshotWizard.preview.table.date')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-subtle">
                                {previewRows.slice(0, 5).map((row, idx) => (
                                    <tr key={idx} className="text-secondary">
                                        <td className="px-4 py-2 font-bold text-primary">{getMappedValue(row, 'assetSymbol')}</td>
                                        <td className="px-4 py-2 font-mono text-xs">{getMappedValue(row, 'assetIsin')}</td>
                                        <td className="px-4 py-2 text-right font-mono">{getMappedValue(row, 'quantity')}</td>
                                        <td className="px-4 py-2 text-right font-mono">{getMappedValue(row, 'avgPrice')}</td>
                                        <td className="px-4 py-2 text-secondary">{getMappedValue(row, 'purchaseDate')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// STEP 2: OPTIONS
// ============================================================================

const SnapshotOptionsStep: React.FC<{
    snapshot: ReturnType<typeof useSnapshotImport>;
}> = ({ snapshot }) => {
    const { t } = useTranslation('transactions');

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-card border border-subtle rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-bold text-primary mb-4">{t('snapshotWizard.options.title')}</h3>

                <div className="space-y-4">
                    {/* Snapshot Only */}
                    <button
                        onClick={() => snapshot.setGenerateSyntheticTransactions(false)}
                        className={`w-full p-6 rounded-xl border-2 transition-all text-left ${!snapshot.generateSyntheticTransactions
                            ? 'border-brand bg-brand/10'
                            : 'border-subtle bg-subtle hover:bg-card-hover'
                            }`}
                    >
                        <div className="flex items-start gap-4">
                            <div className={`p-2 rounded-lg ${!snapshot.generateSyntheticTransactions ? 'bg-brand/20' : 'bg-card-hover'}`}>
                                <Camera className={!snapshot.generateSyntheticTransactions ? 'text-brand' : 'text-secondary'} size={24} />
                            </div>
                            <div>
                                <h4 className="text-primary font-bold">{t('snapshotWizard.options.snapshotOnlyTitle')}</h4>
                                <p className="text-secondary text-sm mt-1">
                                    {t('snapshotWizard.options.snapshotOnlyDescription')}
                                </p>
                                <p className="text-secondary text-xs mt-2">
                                    {t('snapshotWizard.options.snapshotOnlyBestFor')}
                                </p>
                            </div>
                        </div>
                    </button>

                    {/* Generate Transactions */}
                    <button
                        onClick={() => snapshot.setGenerateSyntheticTransactions(true)}
                        className={`w-full p-6 rounded-xl border-2 transition-all text-left ${snapshot.generateSyntheticTransactions
                            ? 'border-brand bg-brand/10'
                            : 'border-subtle bg-subtle hover:bg-card-hover'
                            }`}
                    >
                        <div className="flex items-start gap-4">
                            <div className={`p-2 rounded-lg ${snapshot.generateSyntheticTransactions ? 'bg-brand/20' : 'bg-card-hover'}`}>
                                <ListChecks className={snapshot.generateSyntheticTransactions ? 'text-brand' : 'text-secondary'} size={24} />
                            </div>
                            <div>
                                <h4 className="text-primary font-bold">{t('snapshotWizard.options.syntheticTitle')}</h4>
                                <p className="text-secondary text-sm mt-1">
                                    {t('snapshotWizard.options.syntheticDescription')}
                                </p>
                                <p className="text-secondary text-xs mt-2">
                                    {t('snapshotWizard.options.syntheticBestFor')}
                                </p>
                            </div>
                        </div>
                    </button>
                </div>
            </div>

            {/* Info */}
            {snapshot.generateSyntheticTransactions && (
                <div className="bg-info/10 border border-info/20 rounded-xl p-4 text-info text-sm">
                    <AlertTriangle size={16} className="inline mr-2" />
                    {t('snapshotWizard.options.syntheticInfo')}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// STEP 3: PREVIEW
// ============================================================================

const SnapshotPreviewStep: React.FC<{
    snapshot: ReturnType<typeof useSnapshotImport>;
}> = ({ snapshot }) => {
    const { t } = useTranslation('transactions');
    const { user } = useAuth();
    const locale = user?.preferences?.language === 'fr' ? 'fr-FR' : 'en-US';
    const currency = user?.preferences?.currency || 'USD';

    // Snapshot Only Mode - just show positions
    if (!snapshot.generateSyntheticTransactions) {
        return (
            <div className="space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-card border border-subtle rounded-xl p-4 shadow-sm">
                        <span className="text-xs font-bold text-secondary uppercase">{t('snapshotWizard.preview.stats.totalPositions')}</span>
                        <div className="text-2xl font-bold text-brand mt-1">{snapshot.parseStats.total}</div>
                    </div>
                    <div className="bg-card border border-subtle rounded-xl p-4 shadow-sm">
                        <span className="text-xs font-bold text-secondary uppercase">{t('snapshotWizard.preview.stats.valid')}</span>
                        <div className="text-2xl font-bold text-success mt-1">{snapshot.parseStats.valid}</div>
                    </div>
                    <div className="bg-card border border-subtle rounded-xl p-4 shadow-sm">
                        <span className="text-xs font-bold text-secondary uppercase">{t('snapshotWizard.preview.stats.errors')}</span>
                        <div className="text-2xl font-bold text-error mt-1">{snapshot.parseStats.errors}</div>
                    </div>
                </div>

                {/* Position List */}
                <div className="bg-card border border-subtle rounded-xl overflow-hidden shadow-sm">
                    <div className="px-4 py-3 border-b border-subtle bg-subtle/50">
                        <h3 className="text-sm font-bold text-primary">{t('snapshotWizard.preview.positionsTitle')}</h3>
                    </div>
                    <table className="w-full text-left text-sm">
                        <thead className="bg-subtle text-xs uppercase text-secondary">
                            <tr>
                                <th className="px-4 py-3">{t('snapshotWizard.preview.table.status')}</th>
                                <th className="px-4 py-3">{t('snapshotWizard.preview.table.asset')}</th>
                                <th className="px-4 py-3 text-right">{t('snapshotWizard.preview.table.quantity')}</th>
                                <th className="px-4 py-3 text-right">{t('snapshotWizard.preview.table.avgPrice')}</th>
                                <th className="px-4 py-3 text-right">{t('snapshotWizard.preview.table.totalValue')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-subtle">
                            {snapshot.parsedPositions.map(pos => {
                                const qty = parseFloat(pos.position.quantity);
                                const price = parseFloat(pos.position.avgPrice);
                                const total = qty * price;

                                return (
                                    <tr key={pos.id} className={pos.status === 'error' ? 'bg-error/5' : ''}>
                                        <td className="px-4 py-3">
                                            {pos.status === 'valid' ? (
                                                <CheckCircle className="text-success" size={16} />
                                            ) : (
                                                <AlertCircle className="text-error" size={16} />
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="font-bold text-primary">{pos.position.displayName}</span>
                                            {pos.position.assetIsin && (
                                                <span className="block text-xs text-secondary font-mono">{pos.position.assetIsin}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-primary">{qty.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-mono text-secondary">{formatCurrency(price, currency, locale)}</td>
                                        <td className="px-4 py-3 text-right font-mono font-bold text-primary">{formatCurrency(total, currency, locale)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    // Generate Transactions Mode - show reconciliation diff
    if (!snapshot.reconciliationResult) return null;

    const { diffs, stats } = snapshot.reconciliationResult;

    return (
        <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard label={t('snapshotWizard.reconciliation.stats.newAssets')} value={stats.newAssets} icon={Plus} color="blue" />
                <StatCard label={t('snapshotWizard.reconciliation.stats.increased')} value={stats.increasePositions} icon={TrendingUp} color="emerald" />
                <StatCard label={t('snapshotWizard.reconciliation.stats.decreased')} value={stats.decreasePositions} icon={TrendingDown} color="amber" />
                <StatCard label={t('snapshotWizard.reconciliation.stats.unchanged')} value={stats.unchangedPositions} icon={Minus} color="slate" />
                <StatCard label={t('snapshotWizard.reconciliation.stats.needsInput')} value={stats.requiresInput} icon={DollarSign} color="rose" />
            </div>

            {/* Reconciliation Table */}
            <div className="bg-card border border-subtle rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b border-subtle bg-subtle/50">
                    <h3 className="text-sm font-bold text-primary">{t('snapshotWizard.reconciliation.title')}</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-subtle text-xs uppercase text-secondary">
                            <tr>
                                <th className="px-4 py-3">{t('snapshotWizard.reconciliation.table.asset')}</th>
                                <th className="px-4 py-3 text-right">{t('snapshotWizard.reconciliation.table.oldQty')}</th>
                                <th className="px-4 py-3 text-right">{t('snapshotWizard.reconciliation.table.newQty')}</th>
                                <th className="px-4 py-3 text-center">{t('snapshotWizard.reconciliation.table.delta')}</th>
                                <th className="px-4 py-3 text-center">{t('snapshotWizard.reconciliation.table.action')}</th>
                                <th className="px-4 py-3 text-right">{t('snapshotWizard.reconciliation.table.price')}</th>
                                <th className="px-4 py-3">{t('snapshotWizard.reconciliation.table.status')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-subtle">
                            {diffs.map(diff => (
                                <ReconciliationRow
                                    key={diff.assetKey}
                                    diff={diff}
                                    onUpdatePrice={snapshot.updateSellPrice}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Validation message */}
            {stats.requiresInput > 0 && (
                <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 text-warning text-sm">
                    <AlertTriangle size={16} className="inline mr-2" />
                    {t('snapshotWizard.reconciliation.requiresInput', { count: stats.requiresInput })}
                </div>
            )}
        </div>
    );
};

const StatCard: React.FC<{ label: string; value: number; icon: React.ElementType; color: string }> = ({
    label, value, icon: Icon, color
}) => {
    const colorClasses: Record<string, string> = {
        blue: 'text-brand',
        emerald: 'text-success',
        amber: 'text-warning',
        rose: 'text-error',
        slate: 'text-secondary'
    };

    return (
        <div className="bg-card border border-subtle rounded-xl p-4 shadow-sm">
            <span className="text-xs font-bold text-secondary uppercase">{label}</span>
            <div className="flex items-center gap-2 mt-1">
                <Icon className={colorClasses[color]} size={20} />
                <span className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</span>
            </div>
        </div>
    );
};

const ReconciliationRow: React.FC<{
    diff: ReturnType<typeof useSnapshotImport>['reconciliationResult'] extends { diffs: infer D } ? D extends (infer T)[] ? T : never : never;
    onUpdatePrice: (assetKey: string, price: string) => void;
}> = ({ diff, onUpdatePrice }) => {
    const { t } = useTranslation('transactions');
    const { user } = useAuth();
    const locale = user?.preferences?.language === 'fr' ? 'fr-FR' : 'en-US';
    const currency = user?.preferences?.currency || 'USD';
    const symbol = CURRENCY_SYMBOLS[currency] || currency;
    const [editPrice, setEditPrice] = useState(diff.userProvidedSellPrice || '');
    const [isEditing, setIsEditing] = useState(diff.requiresUserInput);

    const deltaNum = parseFloat(diff.deltaQty);
    const isIncrease = deltaNum > 0;
    const isDecrease = deltaNum < 0;

    const handleSavePrice = () => {
        if (editPrice.trim()) {
            onUpdatePrice(diff.assetKey, editPrice);
            setIsEditing(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSavePrice();
        }
    };

    return (
        <tr className={!diff.isValid ? 'bg-error/5' : diff.requiresUserInput ? 'bg-warning/5' : ''}>
            <td className="px-4 py-3">
                <span className="font-bold text-primary">{diff.displayName}</span>
                {diff.assetIsin && (
                    <span className="block text-xs text-secondary font-mono">{diff.assetIsin}</span>
                )}
            </td>
            <td className="px-4 py-3 text-right font-mono text-secondary">
                {parseFloat(diff.oldQty) === 0 ? t('snapshotWizard.common.emptyValue') : diff.oldQty}
            </td>
            <td className="px-4 py-3 text-right font-mono text-primary">{diff.newQty}</td>
            <td className="px-4 py-3 text-center">
                <span className={`font-mono font-bold ${isIncrease ? 'text-success' : isDecrease ? 'text-warning' : 'text-secondary'}`}>
                    {isIncrease ? '+' : ''}{deltaNum.toFixed(2)}
                </span>
            </td>
            <td className="px-4 py-3 text-center">
                {diff.syntheticType === 'BUY' && (
                    <span className="px-2 py-1 bg-success/20 text-success rounded text-xs font-bold">
                        {t('snapshotWizard.reconciliation.actions.buy')} {diff.syntheticQty}
                    </span>
                )}
                {diff.syntheticType === 'SELL' && (
                    <span className="px-2 py-1 bg-warning/20 text-warning rounded text-xs font-bold">
                        {t('snapshotWizard.reconciliation.actions.sell')} {Math.abs(parseFloat(diff.syntheticQty)).toFixed(2)}
                    </span>
                )}
                {diff.syntheticType === 'NONE' && (
                    <span className="text-secondary text-xs">{t('snapshotWizard.common.emptyValue')}</span>
                )}
            </td>
            <td className="px-4 py-3 text-right">
                {diff.syntheticType === 'BUY' && (
                    <span className="font-mono text-primary">{formatCurrency(parseFloat(diff.syntheticPrice), currency, locale)}</span>
                )}
                {diff.syntheticType === 'SELL' && isEditing && (
                    <div className="flex items-center gap-2 justify-end">
                        <span className="text-secondary">{symbol}</span>
                        <input
                            type="number"
                            value={editPrice}
                            onChange={e => setEditPrice(e.target.value)}
                            onBlur={handleSavePrice}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            placeholder={t('snapshotWizard.reconciliation.enterPrice')}
                            className="w-24 bg-subtle border border-warning/50 text-primary rounded px-2 py-1 text-sm text-right"
                        />
                    </div>
                )}
                {diff.syntheticType === 'SELL' && !isEditing && (
                    <button
                        onClick={() => setIsEditing(true)}
                        className="font-mono text-primary hover:text-brand transition-colors cursor-pointer group flex items-center gap-1 justify-end"
                        title={t('snapshotWizard.reconciliation.clickToEdit')}
                    >
                        {formatCurrency(parseFloat(diff.syntheticPrice), currency, locale)}
                        <Edit2 size={12} className="opacity-0 group-hover:opacity-100 text-brand transition-opacity" />
                    </button>
                )}
                {diff.syntheticType === 'NONE' && (
                    <span className="text-secondary">{t('snapshotWizard.common.emptyValue')}</span>
                )}
            </td>
            <td className="px-4 py-3">
                {diff.isValid && !isEditing && !diff.requiresUserInput && (
                    <CheckCircle className="text-success" size={16} />
                )}
                {(isEditing || diff.requiresUserInput) && (
                    <AlertTriangle className="text-warning" size={16} />
                )}
                {!diff.isValid && !isEditing && !diff.requiresUserInput && (
                    <AlertCircle className="text-error" size={16} />
                )}
            </td>
        </tr>
    );
};

// ============================================================================
// STEP 4: COMPLETE
// ============================================================================

const SnapshotCompleteStep: React.FC<{
    snapshot: ReturnType<typeof useSnapshotImport>;
    onComplete: () => void;
}> = ({ snapshot, onComplete }) => {
    const { t } = useTranslation('transactions');

    return (
        <div className="max-w-2xl mx-auto text-center space-y-8">
            <div className="w-20 h-20 bg-success/20 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="text-success" size={48} />
            </div>

            <div>
                <h2 className="text-3xl font-bold text-primary mb-2">{t('snapshotWizard.complete.title')}</h2>
                <p className="text-secondary">
                    {t('snapshotWizard.complete.success', { count: snapshot.completedBatch?.transactionCount || 0 })}
                </p>
            </div>

            {snapshot.completedBatch && (
                <div className="bg-card border border-subtle rounded-xl p-6 text-left shadow-sm">
                    <h3 className="text-sm font-bold text-secondary uppercase mb-4">{t('snapshotWizard.complete.summaryTitle')}</h3>
                    <dl className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-secondary">{t('snapshotWizard.complete.batchId')}</dt>
                            <dd className="text-primary font-mono">{snapshot.completedBatch.id}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-secondary">{t('snapshotWizard.complete.positions')}</dt>
                            <dd className="text-primary">{snapshot.completedBatch.transactionCount}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-secondary">{t('snapshotWizard.complete.mode')}</dt>
                            <dd className="text-primary">
                                {snapshot.generateSyntheticTransactions
                                    ? t('snapshotWizard.complete.withSynthetic')
                                    : t('snapshotWizard.complete.snapshotOnly')}
                            </dd>
                        </div>
                    </dl>
                </div>
            )}

            <div className="flex justify-center gap-4">
                <Link to="/">
                    <Button size="lg">{t('snapshotWizard.complete.goToDashboard')}</Button>
                </Link>
                <Button variant="secondary" size="lg" onClick={onComplete}>
                    {t('snapshotWizard.complete.importMore')}
                </Button>
            </div>
        </div>
    );
};

export default SnapshotWizard;
