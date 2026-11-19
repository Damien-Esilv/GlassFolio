import React from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud } from 'lucide-react';
import { useCloudSyncStatus } from '../../hooks/useCloudSyncStatus';
import { VAULT_QUOTA_WARNING_RATIO } from '../../services/storage/vaultQuota';

const BYTES_PER_MB = 1024 * 1024;

/** Settings card displaying encrypted cloud vault quota usage. Renders nothing in local mode. */
export const CloudStorageStatusCard: React.FC = () => {
    const { t, i18n } = useTranslation('security');
    const status = useCloudSyncStatus();

    if (status.mode !== 'cloud') return null;

    const bytesRatio = status.maxBytes > 0 ? status.usageBytes / status.maxBytes : 0;
    const recordsRatio = status.maxRecords > 0 ? status.recordCount / status.maxRecords : 0;
    const clampedPercent = Math.min(100, Math.round(bytesRatio * 100));
    const isExceeded = status.quotaError !== null || bytesRatio >= 1 || recordsRatio >= 1;
    const isWarning = !isExceeded && (bytesRatio >= VAULT_QUOTA_WARNING_RATIO || recordsRatio >= VAULT_QUOTA_WARNING_RATIO);

    const numberFormatter = new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    const usedMb = numberFormatter.format(status.usageBytes / BYTES_PER_MB);
    const maxMb = Math.round(status.maxBytes / BYTES_PER_MB);

    const barClass = isExceeded ? 'bg-negative' : isWarning ? 'bg-warning' : 'bg-primary';
    const healthKey = isExceeded ? 'quotaExceeded' : status.syncError ? 'syncError' : status.pendingCount > 0 ? 'syncing' : 'healthy';
    const healthColorClass = isExceeded || status.syncError ? 'text-negative' : isWarning ? 'text-warning' : 'text-positive';

    return (
        <div className="bg-card rounded-xl p-6 shadow-lg border border-border" data-testid="cloud-storage-status">
            <h2 className="text-xl font-semibold text-primary mb-2 flex items-center gap-2">
                <Cloud size={20} className="text-primary" />
                {t('cloudSync.settings.title')}
            </h2>
            <p className="text-xs text-tertiary mb-4">
                {t('cloudSync.settings.help', { maxMb, maxRecords: status.maxRecords })}
            </p>

            <div className="mb-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-tertiary">{t('cloudSync.settings.storageUsed')}</span>
                    <span className="font-medium text-primary tabular-nums">
                        {t('cloudSync.settings.usageSummary', { usedMb, maxMb, percent: clampedPercent })}
                    </span>
                </div>
                <div
                    role="progressbar"
                    aria-label={t('cloudSync.settings.storageUsed')}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={clampedPercent}
                    className="h-2 w-full rounded-full bg-subtle overflow-hidden"
                >
                    <div
                        className={`h-full rounded-full transition-all ${barClass}`}
                        style={{ width: `${clampedPercent}%` }}
                    />
                </div>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                    <dt className="text-xs text-tertiary">{t('cloudSync.settings.records')}</dt>
                    <dd className="font-medium text-primary tabular-nums">
                        {t('cloudSync.settings.recordsCount', {
                            used: status.recordCount,
                            max: status.maxRecords,
                        })}
                    </dd>
                </div>
                <div>
                    <dt className="text-xs text-tertiary">{t('cloudSync.settings.pending')}</dt>
                    <dd className="font-medium text-primary tabular-nums">{status.pendingCount}</dd>
                </div>
                <div>
                    <dt className="text-xs text-tertiary">{t('cloudSync.settings.statusLabel')}</dt>
                    <dd className={`font-medium ${healthColorClass}`}>
                        {t(`cloudSync.settings.status.${healthKey}`)}
                    </dd>
                </div>
            </dl>
        </div>
    );
};
