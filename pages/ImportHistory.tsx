/**
 * Import History Page
 * 
 * View past imports and rollback capability for batch deletion.
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import ImportBatchList from '../components/ImportBatchList';
import { History, AlertTriangle, ChevronRight, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ImportHistory: React.FC = () => {
    const { t } = useTranslation(['transactions', 'common']);
    const navigate = useNavigate();

    return (
        <div className="py-8">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2.5 rounded-xl bg-subtle hover:bg-subtle/80 text-secondary hover:text-primary transition-colors"
                        title={t('common:buttons.back')}
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-primary flex items-center gap-3">
                            <History className="text-brand" />
                            {t('transactions:importHistory.title')}
                        </h1>
                        <p className="text-secondary mt-1">{t('transactions:importHistory.subtitle')}</p>
                    </div>
                </div>
                <Link to="/import">
                    <Button>
                        {t('transactions:importHistory.newImport')} <ChevronRight size={16} className="ml-1" />
                    </Button>
                </Link>
            </div>

            {/* Batch List */}
            <ImportBatchList compact={false} />

            {/* Info Banner */}
            <div className="mt-8 bg-subtle border border-subtle rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="text-warning flex-shrink-0 mt-0.5" size={18} />
                <div className="text-sm text-secondary">
                    <strong className="text-primary">{t('transactions:importHistory.rollbackTitle')}</strong> {t('transactions:importHistory.rollbackDescription')}
                </div>
            </div>
        </div>
    );
};

export default ImportHistory;
