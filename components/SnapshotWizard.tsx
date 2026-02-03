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
    const snapshot = useSnapshotImport(accountId, rawCSVText, headers, previewRows);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Camera className="text-purple-500" size={28} />
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Snapshot Import</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">Import positions for {accountName}</p>
                </div>
            </div>

            {/* Error Banner */}
            {snapshot.error && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-center gap-3">
                    <AlertCircle className="text-rose-500" size={20} />
                    <span className="text-rose-400">{snapshot.error}</span>
                </div>
            )}

            {/* Loading */}
            {snapshot.isLoading && (
                <div className="fixed inset-0 bg-white/80 dark:bg-slate-900/80 z-50 flex items-center justify-center">
                    <div className="text-center">
                        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-slate-900 dark:text-white">Processing...</p>
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
                <div className="flex justify-between pt-8 border-t border-slate-200 dark:border-slate-800">
                    <Button
                        variant="secondary"
                        onClick={snapshot.step === 'mapping' ? onBack : snapshot.goBack}
                    >
                        Back
                    </Button>

                    {snapshot.step === 'mapping' && (
                        <Button onClick={snapshot.proceedToOptions} disabled={!snapshot.isValidMapping}>
                            Next <ArrowRight size={18} className="ml-2" />
                        </Button>
                    )}

                    {snapshot.step === 'options' && (
                        <Button onClick={snapshot.analyzeAndPreview}>
                            Analyze <ArrowRight size={18} className="ml-2" />
                        </Button>
                    )}

                    {snapshot.step === 'preview' && (
                        <Button onClick={snapshot.commitImport} disabled={!snapshot.canCommit}>
                            Import Positions
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

    const getMappedValue = (row: string[], field: string): string => {
        const mapping = snapshot.mappings[field as keyof typeof snapshot.mappings];
        if (mapping === undefined) return '—';
        const idx = typeof mapping === 'number' ? mapping : headers.indexOf(mapping as string);
        return idx >= 0 && row[idx] ? row[idx] : '—';
    };

    return (
        <div className="space-y-6">
            {/* Info Banner */}
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                <h3 className="text-purple-600 dark:text-purple-400 font-medium mb-2">Snapshot Mode</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm">
                    Map your columns to import current holdings. You need at least an <strong className="text-slate-900 dark:text-white">Asset Symbol or ISIN</strong>,
                    plus <strong className="text-slate-900 dark:text-white">Quantity</strong> and <strong className="text-slate-900 dark:text-white">Average Price</strong>.
                </p>
            </div>

            {/* Mapping Grid */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Position Fields</h3>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {SNAPSHOT_MAPPABLE_FIELDS.map(field => (
                        <div key={field.key} className="space-y-1">
                            <label className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase">
                                {field.label}
                                {field.required && <span className="text-rose-500">*</span>}
                            </label>
                            <select
                                value={snapshot.mappings[field.key as keyof typeof snapshot.mappings] as string || ''}
                                onChange={e => snapshot.setMapping(field.key as keyof typeof snapshot.mappings, e.target.value || undefined)}
                                className={`w-full bg-white dark:bg-slate-800 border text-slate-900 dark:text-white text-sm rounded-lg p-2.5 ${field.required && !snapshot.mappings[field.key as keyof typeof snapshot.mappings]
                                    ? 'border-rose-500/50'
                                    : 'border-slate-300 dark:border-slate-600'
                                    }`}
                            >
                                <option value="">— Not mapped —</option>
                                {headers.map(h => (
                                    <option key={h} value={h}>{h}</option>
                                ))}
                            </select>
                            {field.hint && (
                                <p className="text-xs text-slate-500">{field.hint}</p>
                            )}
                        </div>
                    ))}
                </div>

                {/* Validation message */}
                {!snapshot.isValidMapping && (
                    <p className="text-amber-400 text-sm mt-4">
                        <AlertTriangle size={14} className="inline mr-1" />
                        Map at least one identifier (Symbol or ISIN), Quantity, and Average Price
                    </p>
                )}
            </div>

            {/* Preview */}
            {previewRows.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm dark:shadow-none">
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Preview</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-4 py-2">Symbol</th>
                                    <th className="px-4 py-2">ISIN</th>
                                    <th className="px-4 py-2 text-right">Quantity</th>
                                    <th className="px-4 py-2 text-right">Avg Price</th>
                                    <th className="px-4 py-2">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                {previewRows.slice(0, 5).map((row, idx) => (
                                    <tr key={idx} className="text-slate-600 dark:text-slate-300">
                                        <td className="px-4 py-2 font-bold text-slate-900 dark:text-white">{getMappedValue(row, 'assetSymbol')}</td>
                                        <td className="px-4 py-2 font-mono text-xs">{getMappedValue(row, 'assetIsin')}</td>
                                        <td className="px-4 py-2 text-right font-mono">{getMappedValue(row, 'quantity')}</td>
                                        <td className="px-4 py-2 text-right font-mono">{getMappedValue(row, 'avgPrice')}</td>
                                        <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{getMappedValue(row, 'purchaseDate')}</td>
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

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">How do you want to import?</h3>

                <div className="space-y-4">
                    {/* Snapshot Only */}
                    <button
                        onClick={() => snapshot.setGenerateSyntheticTransactions(false)}
                        className={`w-full p-6 rounded-xl border-2 transition-all text-left ${!snapshot.generateSyntheticTransactions
                            ? 'border-purple-500 bg-purple-500/10'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                            }`}
                    >
                        <div className="flex items-start gap-4">
                            <div className={`p-2 rounded-lg ${!snapshot.generateSyntheticTransactions ? 'bg-purple-500/20' : 'bg-slate-100 dark:bg-slate-700'}`}>
                                <Camera className={!snapshot.generateSyntheticTransactions ? 'text-purple-500 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400'} size={24} />
                            </div>
                            <div>
                                <h4 className="text-slate-900 dark:text-white font-bold">Snapshot Only</h4>
                                <p className="text-slate-400 text-sm mt-1">
                                    Just track my current positions. No transaction history will be generated.
                                </p>
                                <p className="text-slate-500 text-xs mt-2">
                                    Best for: Quick portfolio setup, simple tracking
                                </p>
                            </div>
                        </div>
                    </button>

                    {/* Generate Transactions */}
                    <button
                        onClick={() => snapshot.setGenerateSyntheticTransactions(true)}
                        className={`w-full p-6 rounded-xl border-2 transition-all text-left ${snapshot.generateSyntheticTransactions
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                            }`}
                    >
                        <div className="flex items-start gap-4">
                            <div className={`p-2 rounded-lg ${snapshot.generateSyntheticTransactions ? 'bg-blue-500/20' : 'bg-slate-100 dark:bg-slate-700'}`}>
                                <ListChecks className={snapshot.generateSyntheticTransactions ? 'text-blue-500 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'} size={24} />
                            </div>
                            <div>
                                <h4 className="text-slate-900 dark:text-white font-bold">Generate Synthetic Transactions</h4>
                                <p className="text-slate-400 text-sm mt-1">
                                    Calculate and create BUY/SELL transactions to reconcile with existing history.
                                </p>
                                <p className="text-slate-500 text-xs mt-2">
                                    Best for: Maintaining transaction history, accurate P&L tracking
                                </p>
                            </div>
                        </div>
                    </button>
                </div>
            </div>

            {/* Info */}
            {snapshot.generateSyntheticTransactions && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-blue-400 text-sm">
                    <AlertTriangle size={16} className="inline mr-2" />
                    The system will compare your snapshot with existing positions and create synthetic
                    BUY/SELL transactions to reconcile the differences.
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

    // Snapshot Only Mode - just show positions
    if (!snapshot.generateSyntheticTransactions) {
        return (
            <div className="space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm dark:shadow-none">
                        <span className="text-xs font-bold text-slate-500 uppercase">Total Positions</span>
                        <div className="text-2xl font-bold text-blue-500 mt-1">{snapshot.parseStats.total}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm dark:shadow-none">
                        <span className="text-xs font-bold text-slate-500 uppercase">Valid</span>
                        <div className="text-2xl font-bold text-emerald-500 mt-1">{snapshot.parseStats.valid}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm dark:shadow-none">
                        <span className="text-xs font-bold text-slate-500 uppercase">Errors</span>
                        <div className="text-2xl font-bold text-rose-500 mt-1">{snapshot.parseStats.errors}</div>
                    </div>
                </div>

                {/* Position List */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm dark:shadow-none">
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Positions to Import</h3>
                    </div>
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400">
                            <tr>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Asset</th>
                                <th className="px-4 py-3 text-right">Quantity</th>
                                <th className="px-4 py-3 text-right">Avg Price</th>
                                <th className="px-4 py-3 text-right">Total Value</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {snapshot.parsedPositions.map(pos => {
                                const qty = parseFloat(pos.position.quantity);
                                const price = parseFloat(pos.position.avgPrice);
                                const total = qty * price;

                                return (
                                    <tr key={pos.id} className={pos.status === 'error' ? 'bg-rose-500/5' : ''}>
                                        <td className="px-4 py-3">
                                            {pos.status === 'valid' ? (
                                                <CheckCircle className="text-emerald-500" size={16} />
                                            ) : (
                                                <AlertCircle className="text-rose-500" size={16} />
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="font-bold text-slate-900 dark:text-white">{pos.position.displayName}</span>
                                            {pos.position.assetIsin && (
                                                <span className="block text-xs text-slate-500 font-mono">{pos.position.assetIsin}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-900 dark:text-white">{qty.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-600 dark:text-slate-300">${price.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
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
                <StatCard label="New Assets" value={stats.newAssets} icon={Plus} color="blue" />
                <StatCard label="Increased" value={stats.increasePositions} icon={TrendingUp} color="emerald" />
                <StatCard label="Decreased" value={stats.decreasePositions} icon={TrendingDown} color="amber" />
                <StatCard label="Unchanged" value={stats.unchangedPositions} icon={Minus} color="slate" />
                <StatCard label="Needs Input" value={stats.requiresInput} icon={DollarSign} color="rose" />
            </div>

            {/* Reconciliation Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm dark:shadow-none">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Reconciliation Preview</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase text-slate-500 dark:text-slate-400">
                            <tr>
                                <th className="px-4 py-3">Asset</th>
                                <th className="px-4 py-3 text-right">Old Qty</th>
                                <th className="px-4 py-3 text-right">New Qty</th>
                                <th className="px-4 py-3 text-center">Delta</th>
                                <th className="px-4 py-3 text-center">Action</th>
                                <th className="px-4 py-3 text-right">Price</th>
                                <th className="px-4 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
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
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-amber-400 text-sm">
                    <AlertTriangle size={16} className="inline mr-2" />
                    {stats.requiresInput} position(s) require a sell price. Please enter the price at which you sold.
                </div>
            )}
        </div>
    );
};

const StatCard: React.FC<{ label: string; value: number; icon: React.ElementType; color: string }> = ({
    label, value, icon: Icon, color
}) => {
    const colorClasses: Record<string, string> = {
        blue: 'text-blue-500',
        emerald: 'text-emerald-500',
        amber: 'text-amber-500',
        rose: 'text-rose-500',
        slate: 'text-slate-400'
    };

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm dark:shadow-none">
            <span className="text-xs font-bold text-slate-500 uppercase">{label}</span>
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
        <tr className={!diff.isValid ? 'bg-rose-500/5' : diff.requiresUserInput ? 'bg-amber-500/5' : ''}>
            <td className="px-4 py-3">
                <span className="font-bold text-slate-900 dark:text-white">{diff.displayName}</span>
                {diff.assetIsin && (
                    <span className="block text-xs text-slate-500 font-mono">{diff.assetIsin}</span>
                )}
            </td>
            <td className="px-4 py-3 text-right font-mono text-slate-400 dark:text-slate-500">
                {parseFloat(diff.oldQty) === 0 ? '—' : diff.oldQty}
            </td>
            <td className="px-4 py-3 text-right font-mono text-slate-900 dark:text-white">{diff.newQty}</td>
            <td className="px-4 py-3 text-center">
                <span className={`font-mono font-bold ${isIncrease ? 'text-emerald-500' : isDecrease ? 'text-amber-500' : 'text-slate-400'}`}>
                    {isIncrease ? '+' : ''}{deltaNum.toFixed(2)}
                </span>
            </td>
            <td className="px-4 py-3 text-center">
                {diff.syntheticType === 'BUY' && (
                    <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs font-bold">
                        BUY {diff.syntheticQty}
                    </span>
                )}
                {diff.syntheticType === 'SELL' && (
                    <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs font-bold">
                        SELL {Math.abs(parseFloat(diff.syntheticQty)).toFixed(2)}
                    </span>
                )}
                {diff.syntheticType === 'NONE' && (
                    <span className="text-slate-500 text-xs">—</span>
                )}
            </td>
            <td className="px-4 py-3 text-right">
                {diff.syntheticType === 'BUY' && (
                    <span className="font-mono text-slate-900 dark:text-white">${parseFloat(diff.syntheticPrice).toFixed(2)}</span>
                )}
                {diff.syntheticType === 'SELL' && isEditing && (
                    <div className="flex items-center gap-2 justify-end">
                        <span className="text-slate-400">$</span>
                        <input
                            type="number"
                            value={editPrice}
                            onChange={e => setEditPrice(e.target.value)}
                            onBlur={handleSavePrice}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            placeholder="Enter price"
                            className="w-24 bg-white dark:bg-slate-800 border border-amber-500/50 text-slate-900 dark:text-white rounded px-2 py-1 text-sm text-right"
                        />
                    </div>
                )}
                {diff.syntheticType === 'SELL' && !isEditing && (
                    <button
                        onClick={() => setIsEditing(true)}
                        className="font-mono text-slate-900 dark:text-white hover:text-primary transition-colors cursor-pointer group flex items-center gap-1 justify-end"
                        title="Click to edit"
                    >
                        ${parseFloat(diff.syntheticPrice).toFixed(2)}
                        <Edit2 size={12} className="opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                    </button>
                )}
                {diff.syntheticType === 'NONE' && (
                    <span className="text-slate-500">—</span>
                )}
            </td>
            <td className="px-4 py-3">
                {diff.isValid && !isEditing && !diff.requiresUserInput && (
                    <CheckCircle className="text-emerald-500" size={16} />
                )}
                {(isEditing || diff.requiresUserInput) && (
                    <AlertTriangle className="text-amber-500" size={16} />
                )}
                {!diff.isValid && !isEditing && !diff.requiresUserInput && (
                    <AlertCircle className="text-rose-500" size={16} />
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

    return (
        <div className="max-w-2xl mx-auto text-center space-y-8">
            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="text-emerald-500" size={48} />
            </div>

            <div>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Snapshot Import Complete!</h2>
                <p className="text-slate-500 dark:text-slate-400">
                    {snapshot.completedBatch?.transactionCount || 0} positions imported successfully
                </p>
            </div>

            {snapshot.completedBatch && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 text-left shadow-sm dark:shadow-none">
                    <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Import Summary</h3>
                    <dl className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-slate-500 dark:text-slate-400">Batch ID</dt>
                            <dd className="text-slate-900 dark:text-white font-mono">{snapshot.completedBatch.id}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-slate-500 dark:text-slate-400">Positions</dt>
                            <dd className="text-slate-900 dark:text-white">{snapshot.completedBatch.transactionCount}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-slate-500 dark:text-slate-400">Mode</dt>
                            <dd className="text-slate-900 dark:text-white">
                                {snapshot.generateSyntheticTransactions ? 'With Synthetic Transactions' : 'Snapshot Only'}
                            </dd>
                        </div>
                    </dl>
                </div>
            )}

            <div className="flex justify-center gap-4">
                <Link to="/">
                    <Button size="lg">Go to Dashboard</Button>
                </Link>
                <Button variant="secondary" size="lg" onClick={onComplete}>
                    Import More
                </Button>
            </div>
        </div>
    );
};

export default SnapshotWizard;
