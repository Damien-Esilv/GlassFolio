import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Button from './Button';
import {
    History,
    Undo2,
    CheckCircle,
    XCircle,
    AlertTriangle,
    ChevronRight,
    AlertCircle
} from 'lucide-react';
import { ImportBatch, Account, Institute } from '../src/types';
import { importService } from '../src/services/importService';
import { instituteService, accountService } from '../src/services/instituteService';
import { useTranslation } from 'react-i18next';

interface ImportBatchListProps {
    compact?: boolean;
    limit?: number;
    showTitle?: boolean;
}

const ImportBatchList: React.FC<ImportBatchListProps> = ({
    compact = false,
    limit,
    showTitle = false
}) => {
    const { t, i18n } = useTranslation('transactions');
    const [batches, setBatches] = useState<ImportBatch[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [institutes, setInstitutes] = useState<Institute[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [rollbackId, setRollbackId] = useState<string | null>(null);
    const [confirmRollback, setConfirmRollback] = useState<string | null>(null);
    const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

    useEffect(() => {
        loadData();
    }, []);

    const getAccountInfo = (accountId: string) => {
        const account = accounts.find(a => a.id === accountId);
        if (!account) return { accountName: t('importHistory.unknown'), instituteName: t('importHistory.unknown') };

        const institute = institutes.find(i => i.id === account.instituteId);
        return {
            accountName: account.name,
            instituteName: institute?.name || t('importHistory.unknown')
        };
    };

    const handleRollback = async (batchId: string, count: number) => {
        setRollbackId(batchId);
        setFeedbackMessage(null);
        try {
            const result = await importService.rollbackBatch(batchId);
            if (result.success) {
                setFeedbackMessage({
                    type: 'success',
                    message: t('importHistory.rollbackSuccess', { count: result.deleted || count })
                });
                await loadData();
            } else {
                setFeedbackMessage({
                    type: 'error',
                    message: result.error || t('importHistory.rollbackError')
                });
            }
        } catch (err) {
            console.error('Rollback failed', err);
            setFeedbackMessage({
                type: 'error',
                message: t('importHistory.rollbackError')
            });
        } finally {
            setRollbackId(null);
            setConfirmRollback(null);
        }
    };

    const formatDate = (isoDate: string) => {
        try {
            const date = new Date(isoDate);
            return date.toLocaleDateString(i18n.language || undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return isoDate;
        }
    };

    const StatusBadge: React.FC<{ status: ImportBatch['status'] }> = ({ status }) => {
        const config = {
            completed: { icon: CheckCircle, color: 'text-success bg-success/10', label: t('importHistory.status.completed') },
            partial: { icon: AlertTriangle, color: 'text-warning bg-warning/10', label: t('importHistory.status.partial') },
            rolled_back: { icon: XCircle, color: 'text-secondary bg-subtle', label: t('importHistory.status.rolledBack') },
            pending: { icon: AlertTriangle, color: 'text-warning bg-warning/10', label: t('importHistory.status.partial') },
            failed: { icon: XCircle, color: 'text-error bg-error/10', label: t('importHistory.status.rolledBack') }
        }[status] || { icon: CheckCircle, color: 'text-secondary bg-subtle', label: status };

        const Icon = config.icon;

        return (
            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
                <Icon size={12} />
                {config.label}
            </span>
        );
    };

    const displayedBatches = limit ? batches.slice(0, limit) : batches;

    return (
        <div className="space-y-4">
            {showTitle && (
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                        <History size={20} className="text-brand" />
                        {t('importHistory.title')}
                    </h3>
                    {compact && (
                        <Link to="/import-history" className="text-sm text-brand hover:underline flex items-center gap-1">
                            {t('importHistory.viewAll')} <ChevronRight size={16} />
                        </Link>
                    )}
                </div>
            )}

            {/* Inline Feedback Banner */}
            {feedbackMessage && (
                <div className={`p-4 rounded-xl text-sm flex items-center gap-3 ${
                    feedbackMessage.type === 'success'
                        ? 'bg-success/10 text-success border border-success/20'
                        : 'bg-error/10 text-error border border-error/20'
                }`}>
                    {feedbackMessage.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                    <span>{feedbackMessage.message}</span>
                </div>
            )}

            {/* Loading State */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
                </div>
            ) : batches.length === 0 ? (
                /* Empty State */
                <div className="text-center py-12 bg-card rounded-xl border border-subtle">
                    <History className="mx-auto text-tertiary mb-3" size={40} />
                    <h4 className="text-base font-semibold text-primary mb-1">{t('importHistory.emptyTitle')}</h4>
                    <p className="text-secondary text-sm mb-4">{t('importHistory.emptySubtitle')}</p>
                    <Link to="/import">
                        <Button>{t('importHistory.importData')}</Button>
                    </Link>
                </div>
            ) : (
                /* Table */
                <div className="bg-card border border-subtle rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-subtle text-xs uppercase text-secondary font-bold">
                            <tr>
                                <th className="px-4 py-3">{t('importHistory.table.date')}</th>
                                <th className="px-4 py-3">{t('importHistory.table.account')}</th>
                                <th className="px-4 py-3">{t('importHistory.table.file')}</th>
                                {!compact && <th className="px-4 py-3 text-center">{t('importHistory.table.mode')}</th>}
                                <th className="px-4 py-3 text-center">{t('importHistory.table.transactions')}</th>
                                <th className="px-4 py-3 text-center">{t('importHistory.table.status')}</th>
                                <th className="px-4 py-3 text-right">{t('importHistory.table.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-subtle">
                            {displayedBatches.map(batch => {
                                const { accountName, instituteName } = getAccountInfo(batch.accountId);
                                const isRollingBack = rollbackId === batch.id;
                                const showConfirm = confirmRollback === batch.id;

                                return (
                                    <tr key={batch.id} className="hover:bg-card-hover text-sm">
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className="text-primary">{formatDate(batch.importedAt)}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col">
                                                <span className="text-primary font-medium">{accountName}</span>
                                                <span className="text-secondary text-xs">{instituteName}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 max-w-[200px] truncate">
                                            <span className="text-secondary font-mono text-xs">{batch.fileName}</span>
                                        </td>
                                        {!compact && (
                                            <td className="px-4 py-3 text-center whitespace-nowrap">
                                                <span className={`text-xs font-medium px-2 py-1 rounded ${
                                                    batch.importMode === 'history'
                                                        ? 'bg-purple-500/20 text-purple-400'
                                                        : 'bg-brand/20 text-brand'
                                                }`}>
                                                    {batch.importMode === 'history'
                                                        ? t('importHistory.mode.history')
                                                        : t('importHistory.mode.snapshot')}
                                                </span>
                                            </td>
                                        )}
                                        <td className="px-4 py-3 text-center font-bold text-primary">
                                            {batch.transactionCount}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <StatusBadge status={batch.status} />
                                        </td>
                                        <td className="px-4 py-3 text-right whitespace-nowrap">
                                            {batch.status === 'completed' && !showConfirm && (
                                                <button
                                                    onClick={() => setConfirmRollback(batch.id)}
                                                    className="inline-flex items-center gap-1.5 text-secondary hover:text-error text-xs font-medium transition-colors"
                                                    disabled={isRollingBack}
                                                >
                                                    <Undo2 size={14} />
                                                    {t('importHistory.undo')}
                                                </button>
                                            )}

                                            {showConfirm && (
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className="text-error text-xs hidden sm:inline">
                                                        {t('importHistory.confirmDelete', { count: batch.transactionCount })}
                                                    </span>
                                                    <button
                                                        onClick={() => handleRollback(batch.id, batch.transactionCount)}
                                                        className="px-2 py-1 bg-error text-white text-xs rounded hover:bg-error/80 disabled:opacity-50"
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
                                                <span className="text-secondary text-xs">{t('importHistory.rolledBack')}</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default ImportBatchList;
