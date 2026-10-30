import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GamificationQuest } from '../types';
import { CheckCircle2, Zap } from 'lucide-react';
import { AnimatedNumber } from './ui/AnimatedNumber';
import { useEntranceAnimation } from '../hooks/useEntranceAnimation';
import { ANIMATION_DURATION_MS, ANIMATION_EASING } from '../constants/animations';
import Button from './Button';

interface QuestCardProps {
    quest: GamificationQuest;
    onClaim?: (questId: string) => void | Promise<void>;
}

const QuestCard: React.FC<QuestCardProps> = ({ quest, onClaim }) => {
    const { t, i18n } = useTranslation(['gamification']);
    const entered = useEntranceAnimation();
    const [isClaiming, setIsClaiming] = useState(false);

    const percent = Math.min(100, Math.round((quest.progress / quest.target) * 100));

    const handleClaim = async () => {
        if (!onClaim || isClaiming || quest.claimed) return;
        setIsClaiming(true);
        try {
            await onClaim(quest.id);
        } finally {
            setIsClaiming(false);
        }
    };

    return (
        <div className={`p-5 rounded-2xl border transition-all ${
            quest.completed 
                ? 'bg-card border-brand/40 shadow-sm' 
                : 'bg-card/70 border-subtle'
        }`}>
            <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            quest.frequency === 'monthly' 
                                ? 'bg-accent-indigo/10 text-accent-indigo' 
                                : 'bg-positive-subtle text-positive'
                        }`}>
                            {quest.frequency}
                        </span>
                        {quest.completed && (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-positive">
                                <CheckCircle2 size={12} />
                                {quest.claimed ? t('gamification:quests.claimed', { defaultValue: 'Réclamé' }) : t('gamification:quests.completed')}
                            </span>
                        )}
                    </div>
                    <h4 className="text-sm font-bold text-primary">
                        {t(quest.titleKey, { defaultValue: quest.id })}
                    </h4>
                    <p className="text-xs text-secondary mt-1">
                        {t(quest.descriptionKey, { defaultValue: '' })}
                    </p>
                </div>

                <div className="flex flex-col items-end shrink-0">
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand/10 text-brand text-xs font-bold">
                        <Zap size={12} className="fill-current" />
                        +{quest.rewardXp} XP
                    </span>
                </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-1.5 mt-4">
                <div className="flex justify-between text-[11px] font-bold text-secondary">
                    <span><AnimatedNumber value={quest.progress} locale={i18n.language} /> / {quest.target}</span>
                    <span><AnimatedNumber value={percent} locale={i18n.language} />%</span>
                </div>
                <div className="w-full bg-subtle h-2 rounded-full overflow-hidden">
                    <div 
                        className={`h-full transition-all ${
                            quest.completed ? 'bg-brand' : 'bg-brand/60'
                        }`} 
                        style={{ width: `${entered ? percent : 0}%`, transitionDuration: `${ANIMATION_DURATION_MS}ms`, transitionTimingFunction: ANIMATION_EASING }}
                    />
                </div>
            </div>

            {quest.claimed ? (
                <div className="mt-4 pt-3 border-t border-subtle flex justify-end">
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-subtle text-secondary text-xs font-semibold">
                        <CheckCircle2 size={13} className="text-positive" />
                        {t('gamification:quests.claimed', { defaultValue: 'Réclamé' })}
                    </span>
                </div>
            ) : quest.completed && onClaim ? (
                <div className="mt-4 pt-3 border-t border-subtle flex justify-end">
                    <Button 
                        size="sm" 
                        onClick={handleClaim}
                        disabled={isClaiming}
                        className="text-xs font-bold shadow-md shadow-brand/20"
                    >
                        {isClaiming ? '...' : t('gamification:quests.claim', { xp: quest.rewardXp })}
                    </Button>
                </div>
            ) : null}
        </div>
    );
};

export default QuestCard;
