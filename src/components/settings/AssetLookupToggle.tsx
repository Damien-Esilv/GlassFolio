import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { isAssetLookupEnabled, setAssetLookupEnabled } from '../../services/assetClassifier';

/** Device preference: let the import look up unknown assets (symbol or ISIN) with the market-data providers. */
export const AssetLookupToggle: React.FC = () => {
    const { t } = useTranslation('settings');
    const [enabled, setEnabled] = useState<boolean>(() => isAssetLookupEnabled());

    const toggle = (): void => {
        const next = !enabled;
        setAssetLookupEnabled(next);
        setEnabled(next);
    };

    return (
        <div className="flex items-center justify-between gap-4 border-t border-border pt-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-subtle rounded-lg text-secondary"><Search size={20} /></div>
                <div>
                    <p className="text-sm font-medium text-primary">{t('preferences.assetLookup')}</p>
                    <p className="text-xs text-tertiary">{t('preferences.assetLookupInfo')}</p>
                </div>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={t('preferences.assetLookup')}
                onClick={toggle}
                className={`w-10 h-5 rounded-full transition-colors relative p-0.5 inline-flex items-center shrink-0 ${enabled ? 'bg-primary' : 'bg-subtle border border-subtle'}`}
            >
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${enabled ? 'translate-x-[20px]' : 'translate-x-0'}`} />
            </button>
        </div>
    );
};
