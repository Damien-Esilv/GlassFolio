import React, { useId, useState } from 'react';
import { AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Button from '../Button';
import { MAPPABLE_FIELDS } from '../../hooks/importHooks';
import type { MappableField, MappingColumn, MappingSummary } from '../../hooks/importHooks';
import type { FieldMappings } from '../../services/import/importManager';

/** Columns per page: a file with dozens of columns stays easy to scan and to tab through */
const PAGE_SIZE = 20;

type Filter = 'all' | 'attention';

interface ColumnMappingTableProps {
    /** Source columns, unmatched and ambiguous first (as useImportWizard orders them) */
    columns: MappingColumn[];
    summary: MappingSummary;
    rowCount: number;
    mappings: Partial<FieldMappings>;
    /** Doubtful columns with a suggestion nobody confirmed yet */
    pendingCount: number;
    onChange: (header: string, field: MappableField | null) => void;
    onAcceptAll: () => void;
}

// Text stays text-primary on a tinted background (it keeps its contrast in every theme); the
// colour lives on the icon, and the label says the same thing in words.
const STATUS_STYLES: Record<MappingColumn['status'], { icon: LucideIcon; classes: string; iconClass: string; labelKey: string }> = {
    matched: { icon: CheckCircle2, classes: 'bg-positive-subtle', iconClass: 'text-positive', labelKey: 'importWizard.mapping.match.status.matched' },
    ambiguous: { icon: AlertTriangle, classes: 'bg-warning-subtle', iconClass: 'text-warning', labelKey: 'importWizard.mapping.match.status.attention' },
    unmatched: { icon: MinusCircle, classes: 'bg-subtle', iconClass: 'text-secondary', labelKey: 'importWizard.mapping.match.status.ignored' },
};

const fieldLabelKey = (field: MappableField): string =>
    MAPPABLE_FIELDS.find(f => f.key === field)?.labelKey ?? 'importWizard.fields.transactionDate';

const SummaryChip: React.FC<{ icon: LucideIcon; classes: string; iconClass: string; count: number; label: string }> = ({ icon: Icon, classes, iconClass, count, label }) => (
    <span className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-primary ${classes}`}>
        <Icon size={16} aria-hidden="true" className={iconClass} />
        <span className="font-bold">{count}</span>
        <span>{label}</span>
    </span>
);

const RequiredFields: React.FC<{ mappings: Partial<FieldMappings> }> = ({ mappings }) => {
    const { t } = useTranslation('transactions');
    const amountColumn = mappings.amountPrimary;
    const derivedAmount = !amountColumn && !!mappings.quantity && !!mappings.priceUnit;
    const identifier = mappings.assetSymbol || mappings.assetIsin || mappings.currency;

    const items: { key: string; label: string; state: string | null }[] = [
        {
            key: 'date',
            label: t('importWizard.fields.transactionDate'),
            state: mappings.transactionDate ? t('importWizard.mapping.match.required.found', { column: String(mappings.transactionDate) }) : null,
        },
        {
            key: 'amount',
            label: t('importWizard.mapping.match.required.amount'),
            state: amountColumn
                ? t('importWizard.mapping.match.required.found', { column: String(amountColumn) })
                : derivedAmount ? t('importWizard.mapping.match.required.foundDerived') : null,
        },
        {
            key: 'identifier',
            label: t('importWizard.mapping.match.required.identifier'),
            state: identifier ? t('importWizard.mapping.match.required.found', { column: String(identifier) }) : null,
        },
    ];

    return (
        <div role="status" aria-label={t('importWizard.mapping.match.required.title')} className="rounded-xl border border-subtle bg-subtle p-4 space-y-2">
            <p className="text-xs font-bold text-primary uppercase">{t('importWizard.mapping.match.required.title')}</p>
            {items.map(item => {
                const Icon = item.state ? CheckCircle2 : AlertTriangle;
                return (
                    <div key={item.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <Icon size={16} aria-hidden="true" className={item.state ? 'text-positive' : 'text-warning'} />
                        <span className="font-medium text-primary">{item.label}</span>
                        <span className={item.state ? 'text-primary' : 'font-semibold text-primary'}>
                            {item.state ?? t('importWizard.mapping.match.required.missing')}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

const ColumnRow: React.FC<{
    column: MappingColumn;
    onChange: ColumnMappingTableProps['onChange'];
}> = ({ column, onChange }) => {
    const { t } = useTranslation('transactions');
    const style = STATUS_STYLES[column.status];
    const StatusIcon = style.icon;
    const alternatives = column.alternatives.map(field => t(fieldLabelKey(field))).join(', ');

    return (
        <li
            data-column={column.header}
            className="grid gap-3 p-4 border-b border-subtle last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] md:items-start"
        >
            <div className="min-w-0 space-y-1.5">
                <p className="font-semibold text-primary truncate" title={column.header}>{column.header}</p>
                <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium text-primary ${style.classes}`}>
                    <StatusIcon size={12} aria-hidden="true" className={style.iconClass} />
                    {t(style.labelKey)}
                </span>
            </div>

            <div className="flex flex-wrap gap-1.5 min-w-0" aria-label={t('importWizard.mapping.match.table.samples')} role="group">
                {column.samples.length === 0 ? (
                    <span className="text-xs text-secondary">{t('importWizard.common.emptyValue')}</span>
                ) : column.samples.map((value, index) => (
                    <span key={index} className="max-w-[10rem] truncate rounded bg-subtle px-2 py-1 font-mono text-xs text-primary" title={value}>
                        {value}
                    </span>
                ))}
            </div>

            <div className="min-w-0 space-y-1.5">
                <select
                    aria-label={t('importWizard.mapping.match.selectLabel', { column: column.header })}
                    value={column.field ?? ''}
                    onChange={event => onChange(column.header, (event.target.value || null) as MappableField | null)}
                    className="w-full bg-subtle text-primary border border-subtle rounded-lg p-2.5 text-sm focus:ring-primary focus:border-primary"
                >
                    <option value="">{t('importWizard.mapping.match.ignoreOption')}</option>
                    {MAPPABLE_FIELDS.map(field => (
                        <option key={field.key} value={field.key}>
                            {t(field.labelKey)}{field.required ? ' *' : ''}
                        </option>
                    ))}
                </select>

                {column.extraFields.length > 0 && (
                    <p className="text-xs text-secondary">
                        {t('importWizard.mapping.match.alsoUsedAs', { field: column.extraFields.map(f => t(fieldLabelKey(f))).join(', ') })}
                    </p>
                )}

                {column.suggestion && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-secondary">
                        <span>{t('importWizard.mapping.match.suggestion', { field: t(fieldLabelKey(column.suggestion)) })}</span>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onChange(column.header, column.suggestion)}
                            aria-label={t('importWizard.mapping.match.useSuggestionFor', { field: t(fieldLabelKey(column.suggestion)), column: column.header })}
                        >
                            {t('importWizard.mapping.match.useSuggestion')}
                        </Button>
                    </div>
                )}

                {!column.suggestion && column.status === 'unmatched' && alternatives && (
                    <p className="text-xs text-secondary">{t('importWizard.mapping.match.couldBe', { fields: alternatives })}</p>
                )}
            </div>
        </li>
    );
};

/**
 * Column-first mapping: every column of the file with what it holds, what the engine thinks it is,
 * and a select to say otherwise. Doubtful columns come first and can be filtered.
 */
const ColumnMappingTable: React.FC<ColumnMappingTableProps> = ({
    columns, summary, rowCount, mappings, pendingCount, onChange, onAcceptAll,
}) => {
    const { t } = useTranslation('transactions');
    const headingId = useId();
    const [filter, setFilter] = useState<Filter>('all');
    const [page, setPage] = useState(0);

    const visible = filter === 'attention' ? columns.filter(c => c.status !== 'matched') : columns;
    const attentionCount = summary.ambiguous + summary.unmatched;
    const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    const current = Math.min(page, pageCount - 1);
    const start = current * PAGE_SIZE;
    const shown = visible.slice(start, start + PAGE_SIZE);

    const chooseFilter = (next: Filter) => {
        setFilter(next);
        setPage(0);
    };

    const filterButton = (id: Filter, label: string) => (
        <button
            type="button"
            aria-pressed={filter === id}
            onClick={() => chooseFilter(id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-primary ${filter === id
                ? 'bg-card text-primary shadow-sm'
                : 'text-secondary hover:text-primary'}`}
        >
            {label}
        </button>
    );

    return (
        <section aria-labelledby={headingId} className="bg-card border border-subtle rounded-xl p-4 sm:p-6 space-y-5 shadow-sm">
            <header>
                <h2 id={headingId} className="text-lg font-bold text-primary">{t('importWizard.mapping.match.title')}</h2>
                <p className="text-secondary text-sm mt-1">{t('importWizard.mapping.match.intro')}</p>
                <p className="text-secondary text-xs mt-1">{t('importWizard.mapping.match.fileStats', { columns: summary.total, rows: rowCount })}</p>
            </header>

            <div role="status" aria-label={t('importWizard.mapping.match.summaryLabel')} className="flex flex-wrap gap-2">
                <SummaryChip icon={CheckCircle2} classes="bg-positive-subtle" iconClass="text-positive" count={summary.matched} label={t('importWizard.mapping.match.summary.matched')} />
                <SummaryChip icon={AlertTriangle} classes="bg-warning-subtle" iconClass="text-warning" count={summary.ambiguous} label={t('importWizard.mapping.match.summary.attention')} />
                <SummaryChip icon={MinusCircle} classes="bg-subtle" iconClass="text-secondary" count={summary.unmatched} label={t('importWizard.mapping.match.summary.ignored')} />
            </div>

            <RequiredFields mappings={mappings} />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div role="group" aria-label={t('importWizard.mapping.match.filter.label')} className="inline-flex p-1 bg-subtle rounded-lg border border-subtle gap-1">
                    {filterButton('all', t('importWizard.mapping.match.filter.all'))}
                    {filterButton('attention', t('importWizard.mapping.match.filter.attention', { count: attentionCount }))}
                </div>
                {pendingCount > 0 && (
                    <Button onClick={onAcceptAll}>{t('importWizard.mapping.match.acceptAll', { count: pendingCount })}</Button>
                )}
            </div>

            {shown.length === 0 ? (
                <p className="text-sm text-secondary py-6 text-center">{t('importWizard.mapping.match.allSorted')}</p>
            ) : (
                <div className="rounded-xl border border-subtle overflow-hidden">
                    <div aria-hidden="true" className="hidden md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] gap-3 bg-subtle px-4 py-2 text-xs font-bold uppercase text-secondary">
                        <span>{t('importWizard.mapping.match.table.column')}</span>
                        <span>{t('importWizard.mapping.match.table.samples')}</span>
                        <span>{t('importWizard.mapping.match.table.field')}</span>
                    </div>
                    <ul>
                        {shown.map(column => <ColumnRow key={column.header + column.index} column={column} onChange={onChange} />)}
                    </ul>
                </div>
            )}

            {pageCount > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-secondary">
                    <span>{t('importWizard.mapping.match.pagination.range', { from: start + 1, to: start + shown.length, total: visible.length })}</span>
                    <div className="flex gap-2">
                        <Button size="sm" variant="secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>
                            {t('importWizard.mapping.match.pagination.previous')}
                        </Button>
                        <Button size="sm" variant="secondary" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>
                            {t('importWizard.mapping.match.pagination.next')}
                        </Button>
                    </div>
                </div>
            )}

            <p className="text-xs text-secondary">{t('importWizard.mapping.match.requiredLegend')}</p>
        </section>
    );
};

export default ColumnMappingTable;
