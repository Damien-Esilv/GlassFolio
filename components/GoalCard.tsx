import React from 'react';
import { FinancialGoal } from '../types';
import { Home, Plane, Car, Shield, Wallet, Pin, Trash2, Edit2, Zap, Link as LinkIcon } from 'lucide-react';

const ICON_MAP = { home: Home, plane: Plane, car: Car, emergency: Shield, other: Wallet };

interface GoalCardProps {
    goal: FinancialGoal;
    onEdit?: (goal: FinancialGoal) => void;
    onDelete?: (id: string) => void;
    onPin?: (id: string) => void;
}

const GoalCard: React.FC<GoalCardProps> = ({ goal, onEdit, onDelete, onPin }) => {
    const Icon = ICON_MAP[goal.iconType] || Wallet;
    const safeCurrent = goal.currentAmount || 0;
    const progress = Math.min((safeCurrent / goal.targetAmount) * 100, 100);

    let colorClass = 'bg-primary';
    if (goal.color === 'emerald') colorClass = 'bg-accent-green';
    if (goal.color === 'rose') colorClass = 'bg-accent-red';
    if (goal.color === 'orange') colorClass = 'bg-orange-500';
    if (goal.color === 'indigo') colorClass = 'bg-indigo-500';

    return (
        <div className="relative group rounded-xl bg-card p-6 shadow-lg border border-border hover:border-black/5 dark:hover:border-white/5 transition-all">
            {/* Actions (Only show if handlers provided) */}
            {(onPin || onEdit || onDelete) && (
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    {onPin && (
                        <button onClick={() => onPin(goal.id)} className={`p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 ${goal.isPinned ? 'text-primary' : 'text-secondary'}`}>
                            <Pin size={16} fill={goal.isPinned ? "currentColor" : "none"} />
                        </button>
                    )}
                    {onEdit && (
                        <button onClick={() => onEdit(goal)} className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-secondary">
                            <Edit2 size={16} />
                        </button>
                    )}
                    {onDelete && (
                        <button onClick={() => onDelete(goal.id)} className="p-2 rounded-full hover:bg-rose-500/10 text-rose-500">
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>
            )}

            <div className="flex items-center gap-4 mb-4">
                <div className={`p-3 rounded-xl bg-opacity-10 ${goal.color === 'emerald' ? 'bg-success/10 text-success' :
                        goal.color === 'rose' ? 'bg-error/10 text-error' :
                            goal.color === 'orange' ? 'bg-orange-500/10 text-orange-500' :
                                goal.color === 'indigo' ? 'bg-indigo-500/10 text-indigo-500' :
                                    'bg-blue-500/10 text-blue-500'
                    }`}>
                    <Icon size={24} />
                </div>
                <div className="pr-24">
                    <h3 className="text-lg font-bold text-primary truncate" title={goal.title}>{goal.title}</h3>
                    {goal.method === 'dynamic' && (
                        <div className="flex items-center gap-1 text-[10px] font-bold text-accent-green mt-0.5">
                            <Zap size={10} fill="currentColor" />
                            <span>AUTO-TRACKING</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm font-medium">
                    <span className="text-secondary">Progress</span>
                    <span className="text-primary">{progress.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-subtle h-2 rounded-full overflow-hidden">
                    <div className={`h-full ${colorClass} transition-all duration-1000 relative overflow-hidden`} style={{ width: `${progress}%` }}></div>
                </div>
                <div className="flex justify-between text-xs text-secondary font-mono">
                    <span>${safeCurrent.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    <span>Target: ${goal.targetAmount.toLocaleString()}</span>
                </div>
            </div>

            {goal.method === 'dynamic' && goal.linkedAssets && (
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

export default GoalCard;
