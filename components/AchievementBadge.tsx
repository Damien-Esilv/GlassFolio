import React from 'react';
import { Achievement } from '../types';
import { Trophy, Wallet, BarChart3, ArrowUpRight, Star } from 'lucide-react';

interface AchievementBadgeProps {
    achievement: Achievement;
    onClick?: () => void;
    compact?: boolean;
}

const AchievementBadge: React.FC<AchievementBadgeProps> = ({ achievement: ach, onClick, compact = false }) => {
    // Determine next level
    const nextLevelData = ach.levels.find(l => l.level === ach.currentLevel + 1);
    const currentLevelData = ach.levels.find(l => l.level === ach.currentLevel);

    let progressPercent = 0;

    if (nextLevelData) {
        const prevTarget = currentLevelData ? currentLevelData.targetValue : 0;
        const nextTarget = nextLevelData.targetValue;
        const currentVal = ach.currentValue || 0;

        const range = nextTarget - prevTarget;
        const valueInLevel = Math.max(0, currentVal - prevTarget);
        progressPercent = Math.min((valueInLevel / range) * 100, 100);
    } else {
        progressPercent = 100;
    }

    const Icon = ach.iconType === 'rocket' ? Trophy :
        ach.iconType === 'diamond' ? Wallet :
            ach.iconType === 'chart' ? BarChart3 :
                ach.iconType === 'trophy' ? Trophy :
                    ach.iconType === 'star' ? ArrowUpRight : Star;

    let colorClass = 'text-secondary bg-subtle';
    let progressColor = 'bg-brand/50';

    if (ach.unlocked) {
        if (ach.color === 'indigo') { colorClass = 'text-indigo-500 bg-indigo-500/10'; progressColor = 'bg-indigo-500'; }
        if (ach.color === 'blue') { colorClass = 'text-blue-500 bg-blue-500/10'; progressColor = 'bg-blue-500'; }
        if (ach.color === 'emerald') { colorClass = 'text-emerald-500 bg-emerald-500/10'; progressColor = 'bg-emerald-500'; }
        if (ach.color === 'orange') { colorClass = 'text-orange-500 bg-orange-500/10'; progressColor = 'bg-orange-500'; }
        if (ach.color === 'rose') { colorClass = 'text-rose-500 bg-rose-500/10'; progressColor = 'bg-rose-500'; }
    }

    return (
        <button
            onClick={onClick}
            className={`relative flex flex-col items-center justify-between p-4 rounded-2xl border transition-all duration-300 hover:scale-[1.02] text-left w-full ${
                compact ? 'min-h-[140px]' : 'p-6'
            } ${
                ach.unlocked ? 'bg-card border-border hover:border-strong' : 'bg-subtle/50 border-transparent opacity-60 hover:opacity-100'
            }`}
        >
            {/* Rounded Icon Container */}
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 shrink-0 ${colorClass}`}>
                <Icon size={22} />
            </div>

            <div className="w-full text-center flex-1 flex flex-col justify-center">
                <h3 className="font-bold text-primary text-xs leading-tight truncate w-full" title={ach.title}>
                    {ach.title}
                </h3>
                <p className="text-[10px] text-tertiary mt-0.5">Lvl {ach.currentLevel}</p>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-subtle h-1.5 rounded-full overflow-hidden mt-3 shrink-0">
                <div className={`h-full transition-all duration-1000 ${progressColor}`} style={{ width: `${progressPercent}%` }}></div>
            </div>
        </button>
    );
};

export default AchievementBadge;
