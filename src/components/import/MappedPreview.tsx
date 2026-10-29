import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { MAPPED_PREVIEW_ROWS } from '../../hooks/importHooks';
import type { MappedPreviewEntry } from '../../hooks/importHooks';

interface MappedPreviewProps {
    /** The first rows as the import will store them (already limited by the hook, limited again here) */
    rows: MappedPreviewEntry[][];
    /** The mapping holds the date, an amount and an asset: the result is meaningful */
    ready: boolean;
}

/**
 * "This is what will be stored": one or two example rows, target field by target field,
 * so a wrong column shows up before anything is imported.
 */
const MappedPreview: React.FC<MappedPreviewProps> = ({ rows, ready }) => {
    const { t } = useTranslation('transactions');
    const headingId = useId();
    const shown = rows.slice(0, MAPPED_PREVIEW_ROWS);

    return (
        <section aria-labelledby={headingId} className="bg-card border border-subtle rounded-xl p-4 sm:p-6 space-y-4 shadow-sm">
            <header>
                <h2 id={headingId} className="text-lg font-bold text-primary">{t('importWizard.mappedPreview.title')}</h2>
                <p className="text-secondary text-sm mt-1">{t('importWizard.mappedPreview.hint')}</p>
            </header>

            {!ready || shown.length === 0 ? (
                <p role="status" className="text-sm font-medium text-primary">{t('importWizard.mappedPreview.incomplete')}</p>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {shown.map((entries, index) => (
                        <div
                            key={index}
                            role="group"
                            aria-label={t('importWizard.mappedPreview.row', { index: index + 1 })}
                            className="rounded-xl border border-subtle bg-subtle p-4"
                        >
                            <p className="text-xs font-bold uppercase text-primary mb-3">{t('importWizard.mappedPreview.row', { index: index + 1 })}</p>
                            <dl className="space-y-2 text-sm">
                                {entries.map(entry => (
                                    <div key={entry.field} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3">
                                        <dt className="text-primary">{t(`importWizard.fields.${entry.field}`)}</dt>
                                        <dd className="font-mono text-xs text-primary break-all">{entry.value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};

export default MappedPreview;
