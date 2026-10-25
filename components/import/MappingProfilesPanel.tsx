import React, { useState } from 'react';
import { Bookmark, Check, Pencil, Save, Sparkles, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MappingTemplate } from '../../src/types';
import Button from '../Button';

interface MappingProfilesPanelProps {
    templates: MappingTemplate[];
    selectedId: string | null;
    suggestedId: string | null;
    canSave: boolean;
    onApply: (id: string) => void;
    onSave: (name: string) => Promise<unknown>;
    onDelete: (id: string) => Promise<unknown>;
    onRename: (id: string, name: string) => Promise<unknown>;
}

const inputClass = 'bg-subtle border border-subtle text-primary text-sm rounded-lg px-3 py-1.5 focus:ring-primary focus:border-primary';

/**
 * Save, apply, rename and delete column-mapping profiles. A profile matching
 * the current file is suggested on top but never applied automatically.
 */
const MappingProfilesPanel: React.FC<MappingProfilesPanelProps> = ({
    templates, selectedId, suggestedId, canSave, onApply, onSave, onDelete, onRename
}) => {
    const { t } = useTranslation('transactions');
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const suggested = suggestedId && suggestedId !== selectedId ? templates.find(tpl => tpl.id === suggestedId) : undefined;

    const handleSave = async () => {
        if (!newName.trim()) return;
        await onSave(newName.trim());
        setNewName('');
    };

    const handleRename = async (id: string) => {
        if (editName.trim()) await onRename(id, editName.trim());
        setEditingId(null);
    };

    return (
        <div className="bg-card border border-subtle rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
                <Bookmark size={16} className="text-brand" />
                <h3 className="text-sm font-bold text-primary">{t('mappingProfiles.title')}</h3>
            </div>

            {suggested && (
                <div className="flex flex-wrap items-center justify-between gap-2 bg-brand/10 border border-brand/20 rounded-lg p-3">
                    <span className="flex items-center gap-2 text-sm text-primary">
                        <Sparkles size={14} className="text-brand" />
                        {t('mappingProfiles.suggestion', { name: suggested.name })}
                    </span>
                    <Button size="sm" onClick={() => onApply(suggested.id)}>{t('mappingProfiles.apply')}</Button>
                </div>
            )}

            {templates.length === 0 ? (
                <p className="text-sm text-secondary">{t('mappingProfiles.empty')}</p>
            ) : (
                <ul className="flex flex-wrap gap-2">
                    {templates.map(tpl => (
                        <li
                            key={tpl.id}
                            className={`flex items-center gap-1 rounded-lg border text-sm ${selectedId === tpl.id ? 'border-brand bg-brand/10' : 'border-subtle bg-subtle'}`}
                        >
                            {editingId === tpl.id ? (
                                <span className="flex items-center gap-1 p-1">
                                    <input
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') void handleRename(tpl.id); }}
                                        aria-label={t('mappingProfiles.renameLabel')}
                                        className={inputClass}
                                        autoFocus
                                    />
                                    <button type="button" onClick={() => void handleRename(tpl.id)} aria-label={t('mappingProfiles.confirmRename')} className="p-1 text-brand">
                                        <Check size={14} />
                                    </button>
                                    <button type="button" onClick={() => setEditingId(null)} aria-label={t('mappingProfiles.cancelRename')} className="p-1 text-secondary">
                                        <X size={14} />
                                    </button>
                                </span>
                            ) : (
                                <>
                                    <button type="button" onClick={() => onApply(tpl.id)} className="px-3 py-1.5 text-primary hover:text-brand">
                                        {tpl.name}
                                        {tpl.isPreset && <span className="ml-1 text-xs text-secondary">{t('mappingProfiles.presetBadge')}</span>}
                                    </button>
                                    {!tpl.isPreset && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => { setEditingId(tpl.id); setEditName(tpl.name); }}
                                                aria-label={t('mappingProfiles.rename', { name: tpl.name })}
                                                className="p-1 text-secondary hover:text-brand"
                                            >
                                                <Pencil size={12} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void onDelete(tpl.id)}
                                                aria-label={t('mappingProfiles.delete', { name: tpl.name })}
                                                className="p-1 pr-2 text-secondary hover:text-negative"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </>
                                    )}
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {canSave && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-subtle">
                    <input
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void handleSave(); }}
                        placeholder={t('mappingProfiles.namePlaceholder')}
                        aria-label={t('mappingProfiles.namePlaceholder')}
                        className={`${inputClass} flex-1 min-w-[12rem]`}
                    />
                    <Button size="sm" variant="secondary" onClick={() => void handleSave()} disabled={!newName.trim()}>
                        <Save size={14} className="mr-1" /> {t('mappingProfiles.save')}
                    </Button>
                </div>
            )}
        </div>
    );
};

export default MappingProfilesPanel;
