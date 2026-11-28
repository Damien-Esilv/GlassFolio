/**
 * The category badge of an operation, clickable: it opens the list of categories (grouped by kind,
 * with a search) to move the operation in one click. The list is drawn at the page level (portal), anchored under
 * the badge or above it near the bottom of the window: table rows animate in on their own layers, which would
 * otherwise paint over a list nested inside them.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Plus } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import type { CategoryOption } from '../../services/cashflow/cashflowCategoryService';
import type { CustomCashflowCategory } from '../../types/cashflow';
import type { CashflowLabels } from './useCashflowLabels';
import { CategoryBadge } from './CategoryBadge';

/** Height of the list (max-h-80) and its gap from the badge, in pixels */
const LIST_HEIGHT = 320;
const LIST_GAP = 8;

/** Each sub-category right under its parent (indented), the others in their order; an orphan (parent filtered out) stays. */
function withChildrenUnderParents(items: CategoryOption[]): CategoryOption[] {
    const ids = new Set(items.map(item => item.id));
    const ordered: CategoryOption[] = [];
    for (const item of items) {
        if (item.parentId && ids.has(item.parentId)) continue;
        ordered.push(item, ...items.filter(child => child.parentId === item.id));
    }
    return ordered;
}

const KIND_ORDER = { out: ['expense', 'savings', 'transfer', 'income'], in: ['income', 'transfer', 'savings', 'expense'] } as const;

export const CategoryPicker: React.FC<{
    categoryId: string;
    direction: 'in' | 'out';
    categories: CategoryOption[];
    customCategories: readonly CustomCashflowCategory[];
    labels: CashflowLabels;
    triggerLabel: string;
    onPick: (categoryId: string) => void;
    /** "Add a category" at the end of the list: opens the settings on "My categories" */
    onAddCategory?: () => void;
}> = ({ categoryId, direction, categories, customCategories, labels, triggerLabel, onPick, onAddCategory }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    useEscapeKey(() => setOpen(false), open);

    useLayoutEffect(() => {
        if (!open || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const below = window.innerHeight - rect.bottom;
        const top = below >= LIST_HEIGHT + LIST_GAP || rect.top < LIST_HEIGHT + LIST_GAP ? rect.bottom + LIST_GAP : rect.top - LIST_HEIGHT - LIST_GAP;
        setPosition({ top, left: Math.max(8, Math.min(rect.left, window.innerWidth - 296)) });
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const close = (event: MouseEvent) => {
            const target = event.target as Node;
            if (!ref.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
        };
        // The list is anchored where the badge was: scrolling the page closes it rather than leaving it behind
        const closeOnScroll = (event: Event) => {
            if (!listRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        window.addEventListener('scroll', closeOnScroll, true);
        window.addEventListener('resize', closeOnScroll);
        return () => {
            document.removeEventListener('mousedown', close);
            window.removeEventListener('scroll', closeOnScroll, true);
            window.removeEventListener('resize', closeOnScroll);
        };
    }, [open]);

    const groups = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return KIND_ORDER[direction].map(kind => ({
            kind,
            items: withChildrenUnderParents(categories.filter(c => c.kind === kind && (!needle || labels.categoryName(c.id).toLowerCase().includes(needle)))),
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
            {open && position && createPortal(
                <div
                    ref={listRef}
                    style={{ top: position.top, left: position.left }}
                    className="fixed z-50 w-72 max-h-80 overflow-y-auto bg-card border border-border rounded-xl shadow-xl p-2 space-y-2"
                >
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
                    {onAddCategory && (
                        <button
                            type="button"
                            onClick={() => { setOpen(false); setQuery(''); onAddCategory(); }}
                            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-semibold text-brand hover:bg-subtle border-t border-subtle"
                        >
                            <Plus size={14} aria-hidden="true" /> {t('cashflow:operations.addCategory')}
                        </button>
                    )}
                </div>,
                document.body,
            )}
        </div>
    );
};
