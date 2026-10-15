import React from 'react';
import { useTranslation } from 'react-i18next';
import { InvestorRank, ThemeReward } from '../types';
import { 
    INVESTOR_RANKS, 
    gamificationService 
} from '../src/services/gamificationService';
import { Award, Lock, CheckCircle2, Palette, Sparkles, ChevronRight } from 'lucide-react';

interface InvestorRankCardProps {
    currentLevel: number;
    currentXp: number;
    themeRewards: ThemeReward[];
}

const InvestorRankCard: React.FC<InvestorRankCardProps> = ({ 
    currentLevel, 
    currentXp, 
    themeRewards 
}) => {
    const { t } = useTranslation(['gamification']);
    const currentRank = gamificationService.getInvestorRank(currentLevel);
    const progress = gamificationService.calculateLevelProgress(currentXp);

    return (
        <div className="space-y-6">
            {/* Current Rank Showcase Hero */}
            <div className="p-6 md:p-8 rounded-3xl bg-card border border-subtle relative overflow-hidden shadow-lg">
                <div className="absolute top-0 right-0 w-96 h-96 bg-brand/5 rounded-full blur-3xl pointer-events-none" />

                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/30 flex items-center justify-center text-brand shrink-0 shadow-inner">
                            <Award size={36} />
                        </div>
                        <div>
                            <span className="text-xs font-black uppercase tracking-wider text-secondary">
                                {t('gamification:ranks.currentRank')}
                            </span>
                            <h2 className="text-2xl font-black text-primary flex items-center gap-2">
                                {t(currentRank.titleKey)}
                                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-subtle text-primary border border-subtle">
                                    {t('gamification:level')} {currentLevel}
                                </span>
                            </h2>
                            <p className="text-sm text-secondary mt-1 max-w-xl">
                                {t(currentRank.descriptionKey)}
                            </p>
                        </div>
                    </div>

                    {/* XP Progress Capsule */}
                    <div className="w-full md:w-64 p-4 rounded-2xl bg-subtle/50 border border-subtle shrink-0">
                        <div className="flex justify-between items-center text-xs font-bold mb-2">
                            <span className="text-primary">{currentXp} {t('gamification:xp')}</span>
                            <span className="text-secondary">
                                {progress.progressPercent}%
                            </span>
                        </div>
                        <div className="w-full bg-subtle h-2.5 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-brand rounded-full transition-all duration-700"
                                style={{ width: `${progress.progressPercent}%` }}
                            />
                        </div>
                        <p className="text-[11px] text-tertiary mt-2 text-right">
                            {t('gamification:xpToNext', { 
                                xp: progress.levelRange - progress.xpInCurrentLevel, 
                                nextLevel: currentLevel + 1 
                            })}
                        </p>
                    </div>
                </div>
            </div>

            {/* Ranks Ladder */}
            <div className="p-6 rounded-3xl bg-card border border-subtle space-y-4">
                <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                    <Sparkles size={18} className="text-brand" />
                    {t('gamification:ranks.title')}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {INVESTOR_RANKS.map((rank) => {
                        const isUnlocked = currentLevel >= rank.levelMin;
                        const isCurrent = currentRank.rankId === rank.rankId;

                        return (
                            <div 
                                key={rank.rankId}
                                className={`p-4 rounded-2xl border transition-all ${
                                    isCurrent 
                                        ? 'bg-brand/5 border-brand shadow-sm' 
                                        : isUnlocked 
                                            ? 'bg-subtle/30 border-subtle' 
                                            : 'bg-subtle/10 border-subtle opacity-60'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-secondary">
                                        Lv. {rank.levelMin} - {rank.levelMax === 999 ? '∞' : rank.levelMax}
                                    </span>
                                    {isUnlocked ? (
                                        <CheckCircle2 size={16} className="text-positive" />
                                    ) : (
                                        <Lock size={14} className="text-tertiary" />
                                    )}
                                </div>
                                <h4 className="text-sm font-bold text-primary">
                                    {t(rank.titleKey)}
                                </h4>
                                <p className="text-xs text-secondary mt-1 leading-relaxed">
                                    {t(rank.descriptionKey)}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Unlockable Themes */}
            <div className="p-6 rounded-3xl bg-card border border-subtle space-y-4">
                <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                    <Palette size={18} className="text-brand" />
                    {t('gamification:themes.title')}
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    {themeRewards.map((theme) => {
                        return (
                            <div 
                                key={theme.id}
                                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                                    theme.unlocked 
                                        ? 'bg-card border-subtle hover:border-strong' 
                                        : 'bg-subtle/20 border-subtle opacity-60'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex gap-1.5">
                                            {theme.previewColors.map((c, i) => (
                                                <span 
                                                    key={i} 
                                                    className="w-4 h-4 rounded-full border border-subtle"
                                                    style={{ backgroundColor: c }}
                                                />
                                            ))}
                                        </div>
                                        {theme.unlocked ? (
                                            <span className="text-[10px] font-bold text-positive bg-positive-subtle px-2 py-0.5 rounded-full">
                                                {t('gamification:unlocked')}
                                            </span>
                                        ) : (
                                            <Lock size={14} className="text-tertiary" />
                                        )}
                                    </div>
                                    <h4 className="text-sm font-bold text-primary">
                                        {t(theme.nameKey)}
                                    </h4>
                                </div>
                                <p className="text-[11px] text-tertiary mt-3">
                                    {theme.unlocked 
                                        ? t('gamification:unlocked')
                                        : t('gamification:themes.unlockAt', { level: theme.requiredLevel })}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default InvestorRankCard;
