import React from 'react';
import { FinancialGoal } from '../types';
import { Home, Plane, Car, Shield, Wallet, Pin, Trash2, Edit2, Zap, Link as LinkIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/currency';

const ICON_MAP = { home: Home, plane: Plane, car: Car, emergency: Shield, other: Wallet };

interface GoalCardProps {
    goal: FinancialGoal;
    onEdit?: (goal: FinancialGoal) => void;
    onDelete?: (id: string) => void;
    onPin?: (id: string) => void;
    showDetailTags?: boolean;
}

const GoalCardComponent: React.FC<GoalCardProps> = ({ goal, onEdit, onDelete, onPin, showDetailTags = true }) => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const locale = user?.preferences?.language === 'fr' ? 'fr-FR' : 'en-US';
    const currency = user?.preferences?.currency || 'USD';
    const Icon = ICON_MAP[goal.iconType] || Wallet;
    const safeCurrent = goal.currentAmount || 0;
    const progress = Math.min((safeCurrent / goal.targetAmount) * 100, 100);

    let colorClass = 'bg-blue-500';
    if (goal.color === 'emerald') colorClass = 'bg-emerald-500';
    if (goal.color === 'rose') colorClass = 'bg-rose-500';
    if (goal.color === 'orange') colorClass = 'bg-orange-500';
    if (goal.color === 'indigo') colorClass = 'bg-indigo-500';

    let iconBgClass = 'bg-blue-500/10 text-blue-500';
    if (goal.color === 'emerald') iconBgClass = 'bg-emerald-500/10 text-emerald-500';
    if (goal.color === 'rose') iconBgClass = 'bg-rose-500/10 text-rose-500';
    if (goal.color === 'orange') iconBgClass = 'bg-orange-500/10 text-orange-500';
    if (goal.color === 'indigo') iconBgClass = 'bg-indigo-500/10 text-indigo-500';

    return (
        <div className="relative group rounded-xl bg-card p-6 shadow-lg border border-border hover:border-strong transition-all">
            {/* Actions (Only show if handlers provided) */}
            {(onPin || onEdit || onDelete) && (
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    {onPin && (
                        <button onClick={() => onPin(goal.id)} className={`p-2 rounded-full hover:bg-card-hover ${goal.isPinned ? 'text-primary' : 'text-secondary'}`}>
                            <Pin size={16} fill={goal.isPinned ? "currentColor" : "none"} />
                        </button>
                    )}
                    {onEdit && (
                        <button onClick={() => onEdit(goal)} className="p-2 rounded-full hover:bg-card-hover text-secondary">
                            <Edit2 size={16} />
                        </button>
                    )}
                    {onDelete && (
                        <button onClick={() => onDelete(goal.id)} className="p-2 rounded-full hover:bg-error/10 text-error">
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>
            )}

            <div className="flex items-center gap-4 mb-4">
                <div className={`p-3 rounded-xl ${iconBgClass}`}>
                    <Icon size={24} />
                </div>
                <div className="pr-24">
                    <h3 className="text-lg font-bold text-primary truncate" title={goal.title}>{goal.title}</h3>
                    {goal.method === 'dynamic' && (
                        <div className="flex items-center gap-1 text-[10px] font-bold text-accent-green mt-0.5">
                            <Zap size={10} fill="currentColor" />
                            <span>{t('common:labels.autoTracking')}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm font-medium">
                    <span className="text-secondary">{t('common:labels.progress')}</span>
                    <span className="text-primary">{progress.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-subtle h-2 rounded-full overflow-hidden">
                    <div className={`h-full ${colorClass} transition-all duration-1000 relative overflow-hidden`} style={{ width: `${progress}%` }}></div>
                </div>
                <div className="flex justify-between text-xs text-secondary font-mono">
                    <span>{formatCurrency(safeCurrent, currency, locale, { maximumFractionDigits: 0 })}</span>
                    <span>{t('common:labels.target')}: {formatCurrency(goal.targetAmount, currency, locale, { maximumFractionDigits: 0 })}</span>
                </div>
            </div>

            {showDetailTags && goal.method === 'dynamic' && goal.linkedAssets && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
                    {goal.linkedAssets.map(link => (
                        <span key={link.id} className="px-2 py-1 rounded text-[10px] font-bold bg-subtle text-secondary border border-border flex items-center gap-1">
                            <LinkIcon size={8} /> {link.percentage}% {link.name}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

// Memoize GoalCard to prevent unnecessary re-renders when parent components (e.g. Dashboard, Progress) update state (timer ticks, chart hovers, filter changes)
export const GoalCard = React.memo(GoalCardComponent);
export default GoalCard;
