/**
 * Import History Page
 * 
 * View past imports and rollback capability for batch deletion.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button';
import {
    History,
    Undo2,
    FileText,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Trash2,
    ChevronRight
} from 'lucide-react';
import { ImportBatch, Account, Institute } from '../src/types';
import { importService } from '../src/services/importService';
import { instituteService, accountService } from '../src/services/instituteService';
import { useTranslation } from 'react-i18next';

const ImportHistory: React.FC = () => {
    const { t } = useTranslation('transactions');
    const [batches, setBatches] = useState<ImportBatch[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [institutes, setInstitutes] = useState<Institute[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [rollbackId, setRollbackId] = useState<string | null>(null);
    const [confirmRollback, setConfirmRollback] = useState<string | null>(null);

    // Load data
    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const [batchData, accountData, instituteData] = await Promise.all([
                    importService.getImportHistory(),
                    accountService.getAccounts(),
                    instituteService.getInstitutes()
                ]);
                setBatches(batchData);
                setAccounts(accountData);
                setInstitutes(instituteData);
            } catch (err) {
                console.error('Failed to load import history', err);
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    // Get account and institute names
    const getAccountInfo = (accountId: string) => {
        const account = accounts.find(a => a.id === accountId);
        if (!account) return { accountName: t('importHistory.unknown'), instituteName: t('importHistory.unknown') };

        const institute = institutes.find(i => i.id === account.instituteId);
        return {
            accountName: account.name,
            instituteName: institute?.name || 'Unknown'
        };
    };

    // Handle rollback
    const handleRollback = async (batchId: string) => {
        setRollbackId(batchId);
        try {
            const result = await importService.rollbackBatch(batchId);

            // Refresh batches
            const updatedBatches = await importService.getImportHistory();
            setBatches(updatedBatches);

            setConfirmRollback(null);
        } catch (err) {
            console.error('Rollback failed', err);
        } finally {
            setRollbackId(null);
        }
    };

    // Format date
    const formatDate = (isoDate: string) => {
        const date = new Date(isoDate);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Status badge
    const StatusBadge: React.FC<{ status: ImportBatch['status'] }> = ({ status }) => {
        const config = {
            completed: { icon: CheckCircle, color: 'text-emerald-500 bg-emerald-500/10', label: t('importHistory.status.completed') },
            partial: { icon: AlertTriangle, color: 'text-amber-500 bg-amber-500/10', label: t('importHistory.status.partial') },
            rolled_back: { icon: XCircle, color: 'text-secondary bg-subtle', label: t('importHistory.status.rolledBack') }
        }[status];

        const Icon = config.icon;

        return (
            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
                <Icon size={12} />
                {config.label}
            </span>
        );
    };

    return (
        <div className="py-8">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-primary flex items-center gap-3">
                        <History className="text-brand" />
                        {t('importHistory.title')}
                    </h1>
                    <p className="text-secondary mt-1">{t('importHistory.subtitle')}</p>
                </div>
                <Link to="/import">
                    <Button>
                        {t('importHistory.newImport')} <ChevronRight size={16} className="ml-1" />
                    </Button>
                </Link>
            </div>

            {/* Loading State */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : batches.length === 0 ? (
                // Empty State
                <div className="text-center py-20">
                    <FileText className="text-tertiary mx-auto mb-4" size={48} />
                    <h2 className="text-xl font-bold text-primary mb-2">{t('importHistory.emptyTitle')}</h2>
                    <p className="text-secondary mb-6">{t('importHistory.emptySubtitle')}</p>
                    <Link to="/import">
                        <Button>{t('importHistory.importData')}</Button>
                    </Link>
                </div>
            ) : (
                // Batches Table
                <div className="bg-card border border-subtle rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-subtle text-xs uppercase text-secondary font-bold">
                            <tr>
                                <th className="px-6 py-4">{t('importHistory.table.date')}</th>
                                <th className="px-6 py-4">{t('importHistory.table.account')}</th>
                                <th className="px-6 py-4">{t('importHistory.table.file')}</th>
                                <th className="px-6 py-4 text-center">{t('importHistory.table.mode')}</th>
                                <th className="px-6 py-4 text-center">{t('importHistory.table.transactions')}</th>
                                <th className="px-6 py-4 text-center">{t('importHistory.table.status')}</th>
                                <th className="px-6 py-4 text-right">{t('importHistory.table.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-subtle">
                            {batches.map(batch => {
                                const { accountName, instituteName } = getAccountInfo(batch.accountId);
                                const isRollingBack = rollbackId === batch.id;
                                const showConfirm = confirmRollback === batch.id;

                                return (
                                    <tr key={batch.id} className="hover:bg-card-hover">
                                        <td className="px-6 py-4">
                                            <span className="text-primary">{formatDate(batch.importedAt)}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-primary font-medium">{accountName}</span>
                                                <span className="text-secondary text-xs">{instituteName}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-secondary font-mono text-sm">{batch.fileName}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`text-xs font-medium px-2 py-1 rounded ${batch.importMode === 'history'
                                                ? 'bg-purple-500/20 text-purple-400'
                                                : 'bg-brand/20 text-brand'
                                                }`}>
                                                {batch.importMode === 'history'
                                                    ? t('importHistory.mode.history')
                                                    : t('importHistory.mode.snapshot')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-primary font-bold">{batch.transactionCount}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <StatusBadge status={batch.status} />
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {batch.status === 'completed' && !showConfirm && (
                                                <button
                                                    onClick={() => setConfirmRollback(batch.id)}
                                                    className="inline-flex items-center gap-1.5 text-secondary hover:text-error text-sm transition-colors"
                                                    disabled={isRollingBack}
                                                >
                                                    <Undo2 size={14} />
                                                    {t('importHistory.undo')}
                                                </button>
                                            )}

                                            {showConfirm && (
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className="text-error text-xs">{t('importHistory.confirmDelete', { count: batch.transactionCount })}</span>
                                                    <button
                                                        onClick={() => handleRollback(batch.id)}
                                                        className="px-2 py-1 bg-error text-white text-xs rounded hover:bg-error/80"
                                                        disabled={isRollingBack}
                                                    >
                                                        {isRollingBack ? t('importHistory.rollingBack') : t('importHistory.confirm')}
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmRollback(null)}
                                                        className="px-2 py-1 bg-subtle text-secondary text-xs rounded hover:bg-card-hover"
                                                    >
                                                        {t('common:buttons.cancel')}
                                                    </button>
                                                </div>
                                            )}

                                            {batch.status === 'rolled_back' && (
                                                <span className="text-secondary text-sm">{t('importHistory.rolledBack')}</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Info Banner */}
            <div className="mt-8 bg-subtle border border-subtle rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="text-warning flex-shrink-0 mt-0.5" size={18} />
                <div className="text-sm text-secondary">
                    <strong className="text-primary">{t('importHistory.rollbackTitle')}</strong> {t('importHistory.rollbackDescription')}
                </div>
            </div>
        </div>
    );
};

export default ImportHistory;
