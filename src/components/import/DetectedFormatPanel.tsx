import React from 'react';
import { FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CsvEncoding } from '../../services/import/types';
import type { DateFormatHint } from '../../services/import/typeNormalizer';

const DELIMITERS: { value: string; labelKey: string }[] = [
    { value: ',', labelKey: 'importFormat.delimiters.comma' },
    { value: ';', labelKey: 'importFormat.delimiters.semicolon' },
    { value: '\t', labelKey: 'importFormat.delimiters.tab' },
    { value: '|', labelKey: 'importFormat.delimiters.pipe' }
];

interface DetectedFormatPanelProps {
    encoding: CsvEncoding | null;
    delimiter: string;
    dateFormat: DateFormatHint | 'auto';
    detectedPreset: string | null;
    onDelimiterChange: (delimiter: string) => void;
    onDateFormatChange: (format: DateFormatHint | 'auto') => void;
}

/**
 * Shows how the file was read (encoding, delimiter, date order, broker preset)
 * and lets the user override the delimiter and the date order.
 */
const DetectedFormatPanel: React.FC<DetectedFormatPanelProps> = ({
    encoding, delimiter, dateFormat, detectedPreset, onDelimiterChange, onDateFormatChange
}) => {
    const { t } = useTranslation('transactions');
    const selectClass = 'w-full bg-subtle border border-subtle text-primary text-sm rounded-lg p-2 focus:ring-primary focus:border-primary';

    return (
        <div className="bg-card border border-subtle rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
                <FileText size={16} className="text-brand" />
                <h3 className="text-sm font-bold text-primary">{t('importFormat.title')}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                    <span className="block text-xs font-bold text-secondary uppercase mb-1">{t('importFormat.encoding')}</span>
                    <span className="text-sm text-primary font-mono">
                        {encoding ? t(`importFormat.encodings.${encoding}`) : t('snapshotWizard.common.emptyValue')}
                    </span>
                </div>
                <label className="block">
                    <span className="block text-xs font-bold text-secondary uppercase mb-1">{t('importFormat.delimiter')}</span>
                    <select value={delimiter} onChange={e => onDelimiterChange(e.target.value)} className={selectClass}>
                        {DELIMITERS.map(d => (
                            <option key={d.labelKey} value={d.value}>{t(d.labelKey)}</option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className="block text-xs font-bold text-secondary uppercase mb-1">{t('importFormat.dateFormat')}</span>
                    <select
                        value={dateFormat}
                        onChange={e => onDateFormatChange(e.target.value as DateFormatHint | 'auto')}
                        className={selectClass}
                    >
                        <option value="auto">{t('importFormat.dateFormats.auto')}</option>
                        <option value="DD/MM/YYYY">{t('importFormat.dateFormats.dayFirst')}</option>
                        <option value="MM/DD/YYYY">{t('importFormat.dateFormats.monthFirst')}</option>
                    </select>
                </label>
                <div>
                    <span className="block text-xs font-bold text-secondary uppercase mb-1">{t('importFormat.preset')}</span>
                    <span className="text-sm text-primary">{detectedPreset || t('importFormat.noPreset')}</span>
                </div>
            </div>
        </div>
    );
};

export default DetectedFormatPanel;
