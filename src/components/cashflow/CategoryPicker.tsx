/**
 * The category badge of an operation, clickable: it opens the list of categories (grouped by kind,
 * with a search) to move the operation in one click.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import type { CategoryOption } from '../../services/cashflow/cashflowCategoryService';
import type { CustomCashflowCategory } from '../../types/cashflow';
import type { CashflowLabels } from './useCashflowLabels';
import { CategoryBadge } from './CategoryBadge';

const KIND_ORDER = { out: ['expense', 'savings', 'transfer', 'income'], in: ['income', 'transfer', 'savings', 'expense'] } as const;

export const CategoryPicker: React.FC<{
    categoryId: string;
    direction: 'in' | 'out';
    categories: CategoryOption[];
    customCategories: readonly CustomCashflowCategory[];
    labels: CashflowLabels;
    triggerLabel: string;
    onPick: (categoryId: string) => void;
}> = ({ categoryId, direction, categories, customCategories, labels, triggerLabel, onPick }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    useEscapeKey(() => setOpen(false), open);

    useEffect(() => {
        if (!open) return undefined;
        const close = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    const groups = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return KIND_ORDER[direction].map(kind => ({
            kind,
            items: categories.filter(c => c.kind === kind && (!needle || labels.categoryName(c.id).toLowerCase().includes(needle))),
        })).filter(group => group.items.length > 0);
    }, [categories, direction, labels, query]);

    return (
        <div className="relative inline-block" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={triggerLabel}
                className="inline-flex items-center gap-1 rounded-full focus:outline-none focus:ring-2 focus:ring-primary"
            >
                <CategoryBadge categoryId={categoryId} name={labels.categoryName(categoryId)} customCategories={customCategories} />
                <ChevronDown size={12} className="text-tertiary" aria-hidden="true" />
            </button>
            {open && (
                <div className="absolute left-0 z-30 mt-2 w-72 max-h-80 overflow-y-auto bg-card border border-border rounded-xl shadow-xl p-2 space-y-2">
                    <input
                        type="search"
                        autoFocus
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder={t('cashflow:operations.category')}
                        className="w-full px-3 py-1.5 rounded-lg bg-subtle text-primary border border-subtle focus:ring-primary focus:border-primary text-sm"
                    />
                    {groups.map(group => (
                        <div key={group.kind} role="listbox" aria-label={t(`cashflow:kinds.${group.kind}`)}>
                            <p className="px-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-tertiary">{t(`cashflow:kinds.${group.kind}`)}</p>
                            {group.items.map(item => (
                                <button
                                    key={item.id}
                                    type="button"
                                    role="option"
                                    aria-selected={item.id === categoryId}
                                    onClick={() => { setOpen(false); setQuery(''); onPick(item.id); }}
                                    className={`w-full flex items-center px-2 py-1.5 rounded-lg hover:bg-subtle ${item.parentId ? 'pl-5' : ''} ${item.id === categoryId ? 'bg-subtle' : ''}`}
                                >
                                    <CategoryBadge categoryId={item.id} name={labels.categoryName(item.id)} customCategories={customCategories} />
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
