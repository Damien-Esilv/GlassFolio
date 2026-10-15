import React, { useState, useRef } from 'react';
import { Upload, AlertTriangle, CheckCircle, RefreshCw, Layers, Trash2, X } from 'lucide-react';
import Button from './Button';
import { validateBackupContent, restoreBackupReset, mergeBackupData } from '../src/services/import/importManager';
import { useData } from '../context/DataContext';
import { useTranslation } from 'react-i18next';

interface BackupMergeWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (msg: string) => void;
}

export const BackupMergeWizard: React.FC<BackupMergeWizardProps> = ({ isOpen, onClose, onSuccess }) => {
    const { t } = useTranslation(['settings', 'common']);
    const { refreshData } = useData();
    const [fileText, setFileText] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>('');
    const [validationError, setValidationError] = useState<string | null>(null);
    const [backupData, setBackupData] = useState<Record<string, any[]> | null>(null);
    
    // Mode choice
    const [mode, setMode] = useState<'reset' | 'merge'>('merge');
    const [activeEntityTab, setActiveEntityTab] = useState<string>('transactions');
    
    // Editable entities state for merge
    const [stagedEntities, setStagedEntities] = useState<Record<string, any[]>>({});
    const [isImporting, setIsImporting] = useState<boolean>(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        setValidationError(null);

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setFileText(content);

            const res = validateBackupContent(content);
            if (!res.valid || !res.payload) {
                setValidationError(res.error || t('settings:backupWizard.invalidJson'));
                setBackupData(null);
            } else {
                setBackupData(res.payload.data);
                // Initialize editable copy of entities
                const copy: Record<string, any[]> = {};
                Object.entries(res.payload.data).forEach(([key, val]) => {
                    if (Array.isArray(val)) {
                        copy[key] = val.map(item => ({ ...item, _selected: true }));
                    }
                });
                setStagedEntities(copy);
            }
        };
        reader.readAsText(file);
    };

    const handleToggleRowSelect = (entityKey: string, index: number) => {
        setStagedEntities(prev => {
            const list = [...(prev[entityKey] || [])];
            list[index] = { ...list[index], _selected: !list[index]._selected };
            return { ...prev, [entityKey]: list };
        });
    };

    const handleCellChange = (entityKey: string, index: number, field: string, value: any) => {
        setStagedEntities(prev => {
            const list = [...(prev[entityKey] || [])];
            list[index] = { ...list[index], [field]: value };
            return { ...prev, [entityKey]: list };
        });
    };

    const handleDeleteRow = (entityKey: string, index: number) => {
        setStagedEntities(prev => {
            const list = [...(prev[entityKey] || [])];
            list.splice(index, 1);
            return { ...prev, [entityKey]: list };
        });
    };

    const handleExecuteImport = async () => {
        if (!backupData) return;
        setIsImporting(true);

        try {
            if (mode === 'reset') {
                await restoreBackupReset(backupData);
                await refreshData();
                onSuccess(t('settings:backupWizard.restoreSuccess'));
            } else {
                // Filter selected items only
                const finalMergeData: Record<string, any[]> = {};
                Object.entries(stagedEntities).forEach(([key, list]) => {
                    const items = Array.isArray(list) ? list : [];
                    finalMergeData[key] = items.filter(item => item._selected !== false).map(({ _selected, ...rest }) => rest);
                });

                const res = await mergeBackupData(finalMergeData);
                await refreshData();
                onSuccess(t('settings:backupWizard.mergeSuccess', { count: res.importedCount }));
            }
            onClose();
        } catch (err: any) {
            setValidationError(err?.message || t('settings:backupWizard.importError'));
        } finally {
            setIsImporting(false);
        }
    };

    const availableEntityKeys = Object.keys(stagedEntities).filter(k => stagedEntities[k]?.length > 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-card border border-border rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primary/10 text-primary">
                            <Upload size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-primary">{t('settings:backupWizard.title')}</h2>
                            <p className="text-xs text-tertiary">{t('settings:backupWizard.subtitle')}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-card-hover text-secondary">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                    
                    {/* File Upload Box */}
                    {!backupData ? (
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all bg-subtle/50 hover:bg-subtle"
                        >
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                accept=".json" 
                                onChange={handleFileSelect} 
                                className="hidden" 
                            />
                            <Upload size={40} className="text-tertiary mb-3 animate-bounce" />
                            <p className="text-sm font-semibold text-primary">{t('settings:backupWizard.uploadHint')}</p>
                            <p className="text-xs text-tertiary mt-1">{t('settings:backupWizard.uploadSubhint')}</p>
                            {fileName && <p className="text-xs text-primary font-medium mt-3 bg-card px-3 py-1.5 rounded-lg border border-border">{fileName}</p>}
                        </div>
                    ) : (
                        <div className="flex items-center justify-between p-4 bg-subtle rounded-xl border border-border">
                            <div className="flex items-center gap-3">
                                <CheckCircle size={20} className="text-accent-green" />
                                <div>
                                    <p className="text-sm font-semibold text-primary">{fileName}</p>
                                    <p className="text-xs text-tertiary">{availableEntityKeys.length} {t('settings:backupWizard.entitiesReady')}</p>
                                </div>
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => { setBackupData(null); setFileText(null); }}>
                                {t('settings:backupWizard.changeFile')}
                            </Button>
                        </div>
                    )}

                    {validationError && (
                        <div className="p-4 bg-negative-subtle border border-negative/30 rounded-xl flex items-center gap-3 text-negative text-sm">
                            <AlertTriangle size={18} className="shrink-0" />
                            <span>{validationError}</span>
                        </div>
                    )}

                    {/* Mode Choice */}
                    {backupData && (
                        <div className="space-y-4">
                            <label className="block text-xs font-semibold uppercase tracking-wider text-secondary">
                                {t('settings:backupWizard.strategyLabel')}
                            </label>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <button
                                    onClick={() => setMode('merge')}
                                    className={`p-4 rounded-xl border text-left transition-all flex items-start gap-3 ${
                                        mode === 'merge' 
                                            ? 'bg-primary/10 border-primary text-primary shadow-md' 
                                            : 'bg-subtle border-transparent text-secondary hover:border-border'
                                    }`}
                                >
                                    <Layers size={20} className="mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold">{t('settings:backupWizard.modeMergeTitle')}</p>
                                        <p className="text-xs text-tertiary mt-1">{t('settings:backupWizard.modeMergeDesc')}</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => setMode('reset')}
                                    className={`p-4 rounded-xl border text-left transition-all flex items-start gap-3 ${
                                        mode === 'reset' 
                                            ? 'bg-negative-subtle border-negative text-negative shadow-md' 
                                            : 'bg-subtle border-transparent text-secondary hover:border-border'
                                    }`}
                                >
                                    <RefreshCw size={20} className="mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold">{t('settings:backupWizard.modeResetTitle')}</p>
                                        <p className="text-xs text-tertiary mt-1">{t('settings:backupWizard.modeResetDesc')}</p>
                                    </div>
                                </button>
                            </div>

                            {/* Merge Line-by-Line Editor Tabs */}
                            {mode === 'merge' && availableEntityKeys.length > 0 && (
                                <div className="space-y-4 pt-4 border-t border-border">
                                    <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-border">
                                        {availableEntityKeys.map(key => (
                                            <button
                                                key={key}
                                                onClick={() => setActiveEntityTab(key)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition-all ${
                                                    activeEntityTab === key 
                                                        ? 'bg-primary text-white shadow' 
                                                        : 'bg-subtle text-secondary hover:bg-card-hover'
                                                }`}
                                            >
                                                {key} ({stagedEntities[key]?.length || 0})
                                            </button>
                                        ))}
                                    </div>

                                    {/* Entity Table Editor */}
                                    {stagedEntities[activeEntityTab] && (
                                        <div className="border border-border rounded-xl overflow-x-auto max-h-[300px]">
                                            <table className="w-full text-xs text-left border-collapse">
                                                <thead className="bg-subtle text-secondary font-medium sticky top-0 border-b border-border">
                                                    <tr>
                                                        <th className="p-2.5 text-center w-10">{t('common:buttons.import')}</th>
                                                        {Object.keys(stagedEntities[activeEntityTab][0] || {})
                                                            .filter(k => !k.startsWith('_') && k !== 'id')
                                                            .slice(0, 5)
                                                            .map(header => (
                                                                <th key={header} className="p-2.5 capitalize">{header}</th>
                                                            ))}
                                                        <th className="p-2.5 text-right w-16">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border text-primary">
                                                    {stagedEntities[activeEntityTab].map((row, idx) => (
                                                        <tr key={row.id || idx} className={row._selected ? 'hover:bg-subtle/40' : 'opacity-40 bg-subtle/20'}>
                                                            <td className="p-2.5 text-center">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={row._selected ?? true} 
                                                                    onChange={() => handleToggleRowSelect(activeEntityTab, idx)}
                                                                    className="rounded text-primary focus:ring-primary"
                                                                />
                                                            </td>
                                                            {Object.keys(row)
                                                                .filter(k => !k.startsWith('_') && k !== 'id')
                                                                .slice(0, 5)
                                                                .map(field => (
                                                                    <td key={field} className="p-2.5 max-w-[150px] truncate">
                                                                        <input 
                                                                            type="text" 
                                                                            value={typeof row[field] === 'object' ? JSON.stringify(row[field]) : (row[field] ?? '')} 
                                                                            onChange={(e) => handleCellChange(activeEntityTab, idx, field, e.target.value)}
                                                                            className="w-full bg-subtle/80 border border-border/60 rounded p-1 text-xs text-primary focus:ring-1 focus:ring-primary"
                                                                        />
                                                                    </td>
                                                                ))}
                                                            <td className="p-2.5 text-right">
                                                                <button 
                                                                    onClick={() => handleDeleteRow(activeEntityTab, idx)}
                                                                    className="p-1 rounded hover:bg-negative-subtle text-negative"
                                                                    title={t('common:buttons.delete')}
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3 bg-subtle/30">
                    <Button variant="ghost" onClick={onClose}>{t('common:buttons.cancel')}</Button>
                    <Button 
                        disabled={!backupData} 
                        isLoading={isImporting} 
                        onClick={handleExecuteImport}
                        className={mode === 'reset' ? 'bg-negative hover:bg-negative/90 text-white' : 'bg-primary text-white'}
                    >
                        {mode === 'reset' ? t('settings:backupWizard.executeReset') : t('settings:backupWizard.executeMerge')}
                    </Button>
                </div>

            </div>
        </div>
    );
};

