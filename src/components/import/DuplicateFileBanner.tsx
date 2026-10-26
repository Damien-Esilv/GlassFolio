import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ImportBatch } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../utils/date';

/**
 * Warns that this exact file (same content hash) was already imported.
 */
const DuplicateFileBanner: React.FC<{ batch: ImportBatch | null }> = ({ batch }) => {
    const { t } = useTranslation('transactions');
    const { user } = useAuth();
    if (!batch) return null;

    return (
        <div role="alert" className="bg-warning/10 border border-warning/20 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="text-warning shrink-0 mt-0.5" size={20} />
            <div className="text-sm">
                <p className="text-warning font-medium">
                    {t('importFormat.duplicateFile.title', {
                        date: formatDate(batch.importedAt, user?.preferences?.dateFormat || 'DD/MM/YYYY'),
                        count: batch.transactionCount
                    })}
                </p>
                <p className="text-secondary mt-1">
                    {t('importFormat.duplicateFile.description')}{' '}
                    <Link to="/import-history" className="text-brand hover:underline">
                        {t('importFormat.duplicateFile.viewHistory')}
                    </Link>
                </p>
            </div>
        </div>
    );
};

export default DuplicateFileBanner;
