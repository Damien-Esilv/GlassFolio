import React from 'react';
import { useTranslation } from 'react-i18next';
import { Achievement } from '../types';
import { useEntranceAnimation } from '../hooks/useEntranceAnimation';
import { ANIMATION_DURATION_MS, ANIMATION_EASING } from '../constants/animations';
import { 
    Trophy, 
    Wallet, 
    BarChart3, 
    ArrowUpRight, 
    Star, 
    Shield, 
    Flame, 
    Calendar, 
    Zap, 
    Pin 
} from 'lucide-react';

interface AchievementBadgeProps {
    achievement: Achievement;
    onClick?: () => void;
    compact?: boolean;
    isPinned?: boolean;
    onTogglePin?: (e: React.MouseEvent) => void;
}

const AchievementBadgeComponent: React.FC<AchievementBadgeProps> = ({
    achievement: ach, 
    onClick, 
    compact = false,
    isPinned = false,
    onTogglePin
}) => {
    const { t } = useTranslation(['gamification']);
    const entered = useEntranceAnimation();

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

    const getIcon = () => {
        switch (ach.iconType) {
            case 'rocket': return Trophy;
            case 'diamond': return Wallet;
            case 'chart': return BarChart3;
            case 'trophy': return Trophy;
            case 'star': return Star;
            case 'shield': return Shield;
            case 'flame': return Flame;
            case 'calendar': return Calendar;
            case 'zap': return Zap;
            default: return ArrowUpRight;
        }
    };

    const Icon = getIcon();

    let colorClass = 'text-secondary bg-subtle';
    let progressColor = 'bg-brand/50';

    if (ach.unlocked) {
        if (ach.color === 'indigo') { colorClass = 'text-accent-indigo bg-accent-indigo/10'; progressColor = 'bg-accent-indigo'; }
        else if (ach.color === 'blue') { colorClass = 'text-accent-blue bg-accent-blue/10'; progressColor = 'bg-accent-blue'; }
        else if (ach.color === 'emerald') { colorClass = 'text-positive bg-positive-subtle'; progressColor = 'bg-positive'; }
        else if (ach.color === 'orange') { colorClass = 'text-accent-amber bg-accent-amber/10'; progressColor = 'bg-accent-amber'; }
        else if (ach.color === 'rose') { colorClass = 'text-accent-rose bg-accent-rose/10'; progressColor = 'bg-accent-rose'; }
        else { colorClass = 'text-brand bg-brand/10'; progressColor = 'bg-brand'; }
    }

    const badgeTitle = ach.badgeKey 
        ? t(`gamification:badges.${ach.badgeKey}.title`, { defaultValue: ach.title })
        : ach.title;

    return (
        <div className="relative group w-full">
            <div
                className={`relative flex flex-col items-center justify-between p-4 rounded-xl border transition-all duration-300 text-left w-full ${
                    compact ? 'min-h-[140px]' : 'p-6'
                } ${
                    ach.unlocked 
                        ? 'bg-card border-border hover:border-strong shadow-sm' 
                        : 'bg-subtle/40 border-subtle opacity-70 hover:opacity-100'
                } ${onClick ? 'hover:scale-[1.02] cursor-pointer' : ''}`}
                onClick={onClick}
                role={onClick ? 'button' : undefined}
                tabIndex={onClick ? 0 : undefined}
                onKeyDown={(e) => {
                    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onClick();
                    }
                }}
            >
                {/* Pin Action (Top right) */}
                {onTogglePin && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onTogglePin(e);
                        }}
                        title={isPinned ? t('gamification:unpinBadge') : t('gamification:pinBadge')}
                        className={`absolute top-3 right-3 p-1.5 rounded-lg transition-all ${
                            isPinned 
                                ? 'text-brand bg-brand/10 opacity-100' 
                                : 'text-tertiary hover:text-primary opacity-0 group-hover:opacity-100 hover:bg-subtle'
                        }`}
                    >
                        <Pin size={13} className={isPinned ? 'fill-current' : ''} />
                    </button>
                )}

                {/* Rounded Icon Container */}
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 shrink-0 ${colorClass}`}>
                    <Icon size={22} />
                </div>

                <div className="w-full text-center flex-1 flex flex-col justify-center px-1">
                    <h3 className="font-bold text-primary text-xs leading-tight truncate w-full" title={badgeTitle}>
                        {badgeTitle}
                    </h3>
                    <p className="text-[10px] text-tertiary mt-0.5 font-medium">
                        {t('gamification:level')} {ach.currentLevel}
                    </p>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-subtle h-1.5 rounded-full overflow-hidden mt-3 shrink-0">
                    <div 
                        className={`h-full transition-all ${progressColor}`} 
                        style={{ width: `${entered ? progressPercent : 0}%`, transitionDuration: `${ANIMATION_DURATION_MS}ms`, transitionTimingFunction: ANIMATION_EASING }} 
                    />
                </div>
            </div>
        </div>
    );
};

// Memoize AchievementBadge to avoid unnecessary re-renders when parent lists or dashboards re-render
export const AchievementBadge = React.memo(AchievementBadgeComponent);
export default AchievementBadge;
