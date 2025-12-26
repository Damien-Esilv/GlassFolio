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

const ImportHistory: React.FC = () => {
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
        if (!account) return { accountName: 'Unknown', instituteName: 'Unknown' };

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
            completed: { icon: CheckCircle, color: 'text-emerald-500 bg-emerald-500/10', label: 'Completed' },
            partial: { icon: AlertTriangle, color: 'text-amber-500 bg-amber-500/10', label: 'Partial' },
            rolled_back: { icon: XCircle, color: 'text-slate-500 bg-slate-500/10', label: 'Rolled Back' }
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
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <History className="text-blue-500" />
                        Import History
                    </h1>
                    <p className="text-slate-400 mt-1">View and manage past data imports</p>
                </div>
                <Link to="/import">
                    <Button>
                        New Import <ChevronRight size={16} className="ml-1" />
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
                    <FileText className="text-slate-600 mx-auto mb-4" size={48} />
                    <h2 className="text-xl font-bold text-white mb-2">No imports yet</h2>
                    <p className="text-slate-400 mb-6">Start by importing your first file</p>
                    <Link to="/import">
                        <Button>Import Data</Button>
                    </Link>
                </div>
            ) : (
                // Batches Table
                <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-slate-800 text-xs uppercase text-slate-400 font-bold">
                            <tr>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Account</th>
                                <th className="px-6 py-4">File</th>
                                <th className="px-6 py-4 text-center">Mode</th>
                                <th className="px-6 py-4 text-center">Transactions</th>
                                <th className="px-6 py-4 text-center">Status</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {batches.map(batch => {
                                const { accountName, instituteName } = getAccountInfo(batch.accountId);
                                const isRollingBack = rollbackId === batch.id;
                                const showConfirm = confirmRollback === batch.id;

                                return (
                                    <tr key={batch.id} className="hover:bg-slate-800/50">
                                        <td className="px-6 py-4">
                                            <span className="text-white">{formatDate(batch.importedAt)}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-white font-medium">{accountName}</span>
                                                <span className="text-slate-500 text-xs">{instituteName}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-slate-300 font-mono text-sm">{batch.fileName}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`text-xs font-medium px-2 py-1 rounded ${batch.importMode === 'history'
                                                    ? 'bg-purple-500/20 text-purple-400'
                                                    : 'bg-blue-500/20 text-blue-400'
                                                }`}>
                                                {batch.importMode === 'history' ? 'History' : 'Snapshot'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-white font-bold">{batch.transactionCount}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <StatusBadge status={batch.status} />
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {batch.status === 'completed' && !showConfirm && (
                                                <button
                                                    onClick={() => setConfirmRollback(batch.id)}
                                                    className="inline-flex items-center gap-1.5 text-slate-400 hover:text-rose-400 text-sm transition-colors"
                                                    disabled={isRollingBack}
                                                >
                                                    <Undo2 size={14} />
                                                    Undo
                                                </button>
                                            )}

                                            {showConfirm && (
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className="text-rose-400 text-xs">Delete {batch.transactionCount} transactions?</span>
                                                    <button
                                                        onClick={() => handleRollback(batch.id)}
                                                        className="px-2 py-1 bg-rose-600 text-white text-xs rounded hover:bg-rose-500"
                                                        disabled={isRollingBack}
                                                    >
                                                        {isRollingBack ? 'Rolling back...' : 'Confirm'}
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmRollback(null)}
                                                        className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded hover:bg-slate-600"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            )}

                                            {batch.status === 'rolled_back' && (
                                                <span className="text-slate-500 text-sm">Rolled back</span>
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
            <div className="mt-8 bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
                <div className="text-sm text-slate-400">
                    <strong className="text-white">About Rollback:</strong> Undoing an import will permanently delete all
                    transactions associated with that batch. This action cannot be undone. Other imports and data will not be affected.
                </div>
            </div>
        </div>
    );
};

export default ImportHistory;
