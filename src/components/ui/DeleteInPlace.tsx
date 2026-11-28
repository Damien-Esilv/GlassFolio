/**
 * The app's way to confirm a deletion: a bin button that turns, in place, into the warning with "Cancel" and a red
 * confirm button. Never the browser's own `window.confirm` (AI_CODING_STANDARDS.md §1.5).
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Trash2 } from 'lucide-react';
import Button from '../Button';

export const DeleteInPlace: React.FC<{
    /** Accessible name of the bin button */
    label: string;
    /** What the deletion does, shown before confirming */
    warning: string;
    /** Text of the confirm button */
    confirmLabel: string;
    onDelete: () => Promise<void>;
}> = ({ label, warning, confirmLabel, onDelete }) => {
    const { t } = useTranslation();
    const [confirming, setConfirming] = useState(false);
    const [deleting, setDeleting] = useState(false);
    if (!confirming) {
        return (
            <Button size="sm" variant="ghost" aria-label={label} title={label} onClick={() => setConfirming(true)}>
                <Trash2 size={14} aria-hidden="true" />
            </Button>
        );
    }
    return (
        <div className="flex flex-wrap items-center justify-end gap-2 basis-full">
            <p className="flex items-start gap-1.5 text-xs text-negative flex-1 min-w-0" role="alert">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                {warning}
            </p>
            <Button size="sm" variant="ghost" disabled={deleting} onClick={() => setConfirming(false)}>{t('common:buttons.cancel')}</Button>
            <Button size="sm" variant="danger" isLoading={deleting} disabled={deleting}
                onClick={() => { setDeleting(true); void onDelete().finally(() => { setDeleting(false); setConfirming(false); }); }}>
                <Trash2 size={14} className="mr-1.5" aria-hidden="true" />
                {confirmLabel}
            </Button>
        </div>
    );
};
