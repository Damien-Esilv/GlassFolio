/**
 * Import History Page
 * 
 * View past imports and rollback capability for batch deletion.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button';
import ImportBatchList from '../components/ImportBatchList';
import { History, AlertTriangle, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ImportHistory: React.FC = () => {
    const { t } = useTranslation('transactions');

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

            {/* Batch List */}
            <ImportBatchList compact={false} />

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
