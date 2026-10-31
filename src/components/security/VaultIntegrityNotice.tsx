import React from 'react';
import { useTranslation } from 'react-i18next';
import { DatabaseZap, ShieldAlert } from 'lucide-react';
import { useVaultIntegrityStatus } from '../../hooks/useVaultIntegrityStatus';

/**
 * Banner shown while part of the vault is unreadable (writes to it are refused so it is never
 * overwritten) or while encrypted changes could not be saved (they stay queued).
 */
export const VaultIntegrityNotice: React.FC = () => {
    const { t } = useTranslation('security');
    const { corruptedKeys, writeFailed } = useVaultIntegrityStatus();

    const kind = corruptedKeys.length > 0 ? 'corrupted' : writeFailed ? 'writeFailed' : null;
    if (kind === null) return null;
    const Icon = kind === 'corrupted' ? ShieldAlert : DatabaseZap;

    return (
        <div
            role="alert"
            data-testid="vault-integrity-notice"
            className="mb-4 flex items-start gap-3 rounded-xl border p-4 bg-negative/10 border-negative/30 text-negative"
        >
            <Icon size={20} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
                <p className="text-sm font-semibold">{t(`vaultIntegrity.${kind}.title`)}</p>
                <p className="text-xs mt-1 text-secondary">{t(`vaultIntegrity.${kind}.description`, { count: corruptedKeys.length })}</p>
            </div>
        </div>
    );
};
