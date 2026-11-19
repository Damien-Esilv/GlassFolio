import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CloudOff } from 'lucide-react';
import { useCloudSyncStatus } from '../../hooks/useCloudSyncStatus';
import {
    VAULT_MAX_HEADER_BYTES,
    VAULT_MAX_RECORD_BYTES,
    VAULT_MAX_RECORDS,
    VAULT_MAX_TOTAL_BYTES,
    VAULT_QUOTA_WARNING_RATIO,
} from '../../services/storage/vaultQuota';

const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_KB = 1024;

/**
 * Persistent banner shown in cloud mode when the encrypted vault approaches (>= 80%) or exceeds
 * its server-side storage quota (Epic E38 — TGLA-214). Renders nothing in local mode.
 */
export const CloudSyncNotice: React.FC = () => {
    const { t } = useTranslation('security');
    const status = useCloudSyncStatus();

    if (status.mode !== 'cloud') return null;

    const bytesRatio = status.maxBytes > 0 ? status.usageBytes / status.maxBytes : 0;
    const recordsRatio = status.maxRecords > 0 ? status.recordCount / status.maxRecords : 0;
    const nearLimit = bytesRatio >= VAULT_QUOTA_WARNING_RATIO || recordsRatio >= VAULT_QUOTA_WARNING_RATIO;

    if (status.quotaError === null && !nearLimit) return null;

    const isError = status.quotaError !== null;
    const kind = status.quotaError ?? 'nearLimit';
    const Icon = isError ? CloudOff : AlertTriangle;
    const percentUsed = Math.min(100, Math.round(Math.max(bytesRatio, recordsRatio) * 100));
    const interpolationVars = {
        maxMb: Math.round(VAULT_MAX_TOTAL_BYTES / BYTES_PER_MB),
        maxRecordMb: Math.round(VAULT_MAX_RECORD_BYTES / BYTES_PER_MB),
        maxHeaderKb: Math.round(VAULT_MAX_HEADER_BYTES / BYTES_PER_KB),
        maxRecords: VAULT_MAX_RECORDS,
        percent: percentUsed,
    };

    return (
        <div
            role={isError ? 'alert' : 'status'}
            data-testid="cloud-sync-notice"
            className={`mb-4 flex items-start gap-3 rounded-xl border p-4 ${
                isError
                    ? 'bg-negative/10 border-negative/30 text-negative'
                    : 'bg-warning-subtle border-warning/30 text-warning'
            }`}
        >
            <Icon size={20} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
                <p className="text-sm font-semibold">
                    {t(`cloudSync.notice.${kind}.title`, interpolationVars)}
                </p>
                <p className="text-xs mt-1 text-secondary">
                    {t(`cloudSync.notice.${kind}.description`, interpolationVars)}
                </p>
            </div>
        </div>
    );
};
