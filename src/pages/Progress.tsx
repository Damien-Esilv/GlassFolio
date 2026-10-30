import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useData } from '../context/DataContext';
import Button from '../components/Button';
import { FinancialGoal, Achievement, AssetGroup, ThemeReward } from '../types';
import { 
    Home, 
    Plane, 
    Car, 
    Shield, 
    Wallet, 
    PlusCircle, 
    Target, 
    Trophy, 
    CheckCircle, 
    Settings, 
    Plus, 
    Save, 
    Award, 
    Pin, 
    Filter, 
    Flame
} from 'lucide-react';
import GoalCard from '../components/GoalCard';
import AchievementBadge from '../components/AchievementBadge';
import QuestCard from '../components/QuestCard';
import InvestorRankCard from '../components/InvestorRankCard';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/currency';
import { Reveal } from '../components/ui/Reveal';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';
import { useEntranceAnimation } from '../hooks/useEntranceAnimation';
import { gamificationService } from '../services/gamificationService';
import { computeProgressStats } from '../services/progressStatsService';
import ProgressStatsTab from '../components/progress/ProgressStatsTab';

const ICON_MAP = { home: Home, plane: Plane, car: Car, emergency: Shield, other: Wallet };
const GOAL_COLOR_TOKENS: Record<string, string> = {
    blue: 'var(--color-accent-blue)',
    indigo: 'var(--color-accent-indigo)',
    emerald: 'var(--color-accent-green)',
    orange: 'var(--color-accent-amber)',
    rose: 'var(--color-accent-red)'
};

type ProgressTab = 'goals' | 'achievements' | 'quests' | 'ranks' | 'stats';
type AchievementCategoryFilter = 'all' | 'discipline' | 'wealth' | 'explorer' | 'mastery';

const Progress: React.FC = () => {
    const { t } = useTranslation(['progress', 'gamification', 'common']);
    const { 
        goals, 
        positions, 
        achievements, 
        assetGroups, 
        quests, 
        pinnedBadges, 
        saveGoal, 
        deleteGoal, 
        toggleGoalPin, 
        addAssetGroup, 
        updateAssetGroup,
        togglePinBadge,
        claimQuest,
        transactions,
        xpEvents
    } = useData();
    const { user } = useAuth();
    const locale = user?.preferences?.language === 'fr' ? 'fr-FR' : 'en-US';
    const currency = user?.preferences?.currency || 'USD';
    const progressStats = useMemo(() => computeProgressStats({
        transactions,
        xpEvents,
        xp: user?.xp ?? 0,
        level: user?.level ?? 1,
        achievements,
        goals
    }), [transactions, xpEvents, user?.xp, user?.level, achievements, goals]);
    
    const [activeTab, setActiveTab] = useState<ProgressTab>('goals');
    const [categoryFilter, setCategoryFilter] = useState<AchievementCategoryFilter>('all');
    const [themeRewards, setThemeRewards] = useState<ThemeReward[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();

    // --- GOAL MODAL STATE ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingGoal, setEditingGoal] = useState<Partial<FinancialGoal> | null>(null);

    // Linker State
    const [linkTab, setLinkTab] = useState<'asset' | 'class' | 'group'>('asset');
    const [newGroupname, setNewGroupName] = useState('');
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

    // --- ACHIEVEMENT MODAL STATE ---
    const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);

    // Load theme rewards
    useEffect(() => {
        gamificationService.getThemeRewards(user?.level || 1).then(setThemeRewards);
    }, [user?.level]);

    const handleCloseAchievementModal = () => {
        setSelectedAchievement(null);
        setSearchParams(prev => {
            const newParams = new URLSearchParams(prev);
            newParams.delete('openId');
            return newParams;
        });
    };

    // Handle URL Params for Tabs and Deep Linking
    useEffect(() => {
        const tab = searchParams.get('tab') as ProgressTab | null;
        if (tab && ['goals', 'achievements', 'quests', 'ranks', 'stats'].includes(tab)) {
            setActiveTab(tab);
        }

        // Deep link to specific achievement
        const openId = searchParams.get('openId');
        if (openId && achievements) {
            const target = achievements.find(a => a.id === openId);
            if (target) {
                setSelectedAchievement(target);
            }
        }

        if (searchParams.get('action') === 'new') {
            handleAddNew();
            setActiveTab('goals');
            setSearchParams(prev => {
                const newParams = new URLSearchParams(prev);
                newParams.delete('action');
                return newParams;
            });
        }
    }, [searchParams, achievements]);

    // --- HANDLERS ---
    const handleAddNew = () => {
        setEditingGoal({
            title: '',
            targetAmount: 10000,
            currentAmount: 0,
            method: 'dynamic',
            linkedAssets: [],
            iconType: 'other',
            color: 'blue',
            isPinned: false
        });
        setLinkTab('asset');
        setEditingGroupId(null);
        setIsModalOpen(true);
    };

    const handleEdit = (goal: FinancialGoal) => {
        setEditingGoal({ ...goal });
        setLinkTab('asset');
        setEditingGroupId(null);
        setIsModalOpen(true);
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingGoal || !editingGoal.title || !editingGoal.targetAmount) return;
        saveGoal(editingGoal as FinancialGoal);
        setIsModalOpen(false);
        setEditingGoal(null);
    };

    const handleToggleLink = (type: 'asset' | 'class' | 'group', id: string, name: string) => {
        if (!editingGoal) return;
        const links = editingGoal.linkedAssets || [];
        const exists = links.find(l => l.id === id && l.type === type);

        let newLinks;
        if (exists) {
            newLinks = links.filter(l => !(l.id === id && l.type === type));
        } else {
            newLinks = [...links, { type, id, name, percentage: 100 }];
        }
        setEditingGoal({ ...editingGoal, linkedAssets: newLinks });
    };

    const updateLinkPercentage = (id: string, type: string, percentage: number) => {
        if (!editingGoal) return;
        const links = editingGoal.linkedAssets || [];
        const newLinks = links.map(l => (l.id === id && l.type === type) ? { ...l, percentage } : l);
        setEditingGoal({ ...editingGoal, linkedAssets: newLinks });
    };

    // Group Management
    const handleCreateGroup = () => {
        if (!newGroupname) return;
        const newGrp: AssetGroup = {
            id: crypto.randomUUID(),
            name: newGroupname,
            symbols: [],
            color: 'blue'
        };
        addAssetGroup(newGrp);
        setNewGroupName('');
        setEditingGroupId(newGrp.id);
    };

    const toggleAssetInGroup = (groupId: string, symbol: string) => {
        const group = assetGroups.find(g => g.id === groupId);
        if (!group) return;

        const newSymbols = group.symbols.includes(symbol)
            ? group.symbols.filter(s => s !== symbol)
            : [...group.symbols, symbol];

        updateAssetGroup(groupId, { symbols: newSymbols });
    };

    const sortedGoals = [...goals].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return 0;
    });

    const filteredAchievements = achievements.filter(ach => {
        if (categoryFilter === 'all') return true;
        return ach.category === categoryFilter;
    });

    // Cards appear again whenever the tab changes, and the badges whenever their filter does
    const animActive = useEntranceAnimation(activeTab);
    const gridActive = useEntranceAnimation(`${activeTab}:${categoryFilter}`);

    const pinnedAchievementsList = achievements.filter(a => pinnedBadges.includes(a.id));
    const currentRank = gamificationService.getInvestorRank(user?.level || 1);
    const progress = gamificationService.calculateLevelProgress(user?.xp || 0);

    return (
        <div className="space-y-8 pb-12">
            {/* Header with Investor Rank & Level Tracker */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-3xl md:text-4xl font-black text-brand mb-1">
                        {t('gamification:hub.title')}
                    </h1>
                    <div className="flex flex-wrap items-center gap-3 text-secondary text-sm">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand/10 text-brand font-bold text-xs border border-brand/20">
                            <Award size={14} />
                            {t(currentRank.titleKey)}
                        </span>
                        <span>
                            {t('gamification:level')} <AnimatedNumber value={user?.level || 1} locale={locale} /> • <AnimatedNumber value={user?.xp || 0} locale={locale} /> {t('gamification:xp')}
                        </span>
                        <span className="text-tertiary hidden md:inline">•</span>
                        <span className="text-xs text-tertiary hidden md:inline">
                            {t('gamification:xpToNext', { 
                                xp: progress.levelRange - progress.xpInCurrentLevel, 
                                nextLevel: (user?.level || 1) + 1 
                            })}
                        </span>
                    </div>
                </div>

                {/* Tab switcher */}
                <div className="flex bg-subtle p-1 rounded-2xl border border-subtle overflow-x-auto max-w-full">
                    <button 
                        onClick={() => { setActiveTab('goals'); setSearchParams({ tab: 'goals' }); }} 
                        className={`px-4 py-2 rounded-xl font-bold text-xs md:text-sm whitespace-nowrap transition-all ${
                            activeTab === 'goals' ? 'bg-card text-primary shadow-md' : 'text-secondary hover:text-primary'
                        }`}
                    >
                        {t('gamification:tabs.goals')}
                    </button>
                    <button 
                        onClick={() => { setActiveTab('achievements'); setSearchParams({ tab: 'achievements' }); }} 
                        className={`px-4 py-2 rounded-xl font-bold text-xs md:text-sm whitespace-nowrap transition-all ${
                            activeTab === 'achievements' ? 'bg-card text-primary shadow-md' : 'text-secondary hover:text-primary'
                        }`}
                    >
                        {t('gamification:tabs.achievements')}
                    </button>
                    <button 
                        onClick={() => { setActiveTab('quests'); setSearchParams({ tab: 'quests' }); }} 
                        className={`px-4 py-2 rounded-xl font-bold text-xs md:text-sm whitespace-nowrap transition-all ${
                            activeTab === 'quests' ? 'bg-card text-primary shadow-md' : 'text-secondary hover:text-primary'
                        }`}
                    >
                        {t('gamification:tabs.quests')}
                    </button>
                    <button 
                        onClick={() => { setActiveTab('ranks'); setSearchParams({ tab: 'ranks' }); }} 
                        className={`px-4 py-2 rounded-xl font-bold text-xs md:text-sm whitespace-nowrap transition-all ${
                            activeTab === 'ranks' ? 'bg-card text-primary shadow-md' : 'text-secondary hover:text-primary'
                        }`}
                    >
                        {t('gamification:tabs.ranks')}
                    </button>
                    <button 
                        onClick={() => { setActiveTab('stats'); setSearchParams({ tab: 'stats' }); }} 
                        className={`px-4 py-2 rounded-xl font-bold text-xs md:text-sm whitespace-nowrap transition-all ${
                            activeTab === 'stats' ? 'bg-card text-primary shadow-md' : 'text-secondary hover:text-primary'
                        }`}
                    >
                        {t('gamification:tabs.stats')}
                    </button>
                </div>
            </div>

            {/* Featured Showcase (if any badges pinned) */}
            {pinnedAchievementsList.length > 0 && activeTab === 'achievements' && (
                <Reveal active={animActive}>
                <div className="p-5 rounded-3xl bg-card border border-subtle space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase text-secondary flex items-center gap-1.5">
                            <Pin size={14} className="text-brand" />
                            {t('gamification:showcase.title')}
                        </span>
                        <span className="text-[11px] text-tertiary">
                            {pinnedBadges.length} / 3
                        </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {pinnedAchievementsList.map((ach) => (
                            <AchievementBadge
                                key={`showcase-${ach.id}`}
                                achievement={ach}
                                isPinned={true}
                                onTogglePin={(e) => {
                                    e.stopPropagation();
                                    togglePinBadge(ach.id);
                                }}
                                onClick={() => setSelectedAchievement(ach)}
                            />
                        ))}
                    </div>
                </div>
                </Reveal>
            )}

            {/* --- GOALS VIEW --- */}
            {activeTab === 'goals' && (
                <div className="space-y-6">
                    <div className="flex justify-end">
                        <Button 
                            onClick={handleAddNew} 
                            className="flex items-center gap-2 bg-brand text-white hover:bg-brand/90 shadow-lg shadow-brand/20"
                        >
                            <PlusCircle size={18} /> {t('progress:goals.createNew')}
                        </Button>
                    </div>
                    {sortedGoals.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border border-subtle">
                            <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand mb-4">
                                <Target size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-primary mb-1">
                                {t('progress:goals.noGoals')}
                            </h3>
                            <p className="text-sm text-tertiary max-w-md mb-6">
                                {t('progress:goals.noGoalsDescription')}
                            </p>
                            <Button 
                                onClick={handleAddNew} 
                                className="flex items-center gap-2 bg-brand text-white hover:bg-brand/90"
                            >
                                <PlusCircle size={18} /> {t('progress:goals.createNew')}
                            </Button>
                        </div>
                    ) : (
                        <div key={`goals-${activeTab}`} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {sortedGoals.map((goal, idx) => (
                                <Reveal key={goal.id} active={animActive} index={idx}>
                                    <GoalCard
                                        goal={goal}
                                        onEdit={handleEdit}
                                        onDelete={deleteGoal}
                                        onPin={toggleGoalPin}
                                    />
                                </Reveal>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* --- ACHIEVEMENTS VIEW --- */}
            {activeTab === 'achievements' && (
                <div className="space-y-6">
                    {/* Category Filter Pills */}
                    <div className="flex flex-wrap items-center gap-2">
                        {(['all', 'discipline', 'wealth', 'explorer', 'mastery'] as AchievementCategoryFilter[]).map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setCategoryFilter(cat)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all border ${
                                    categoryFilter === cat 
                                        ? 'bg-brand text-white border-brand shadow-sm' 
                                        : 'bg-card border-subtle text-secondary hover:text-primary hover:bg-subtle'
                                }`}
                            >
                                {cat === 'all' ? t('common:common.all', { defaultValue: 'All' }) : cat}
                            </button>
                        ))}
                    </div>

                    <div key={`achievements-${activeTab}-${categoryFilter}`} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {filteredAchievements.map((ach, idx) => (
                            <Reveal key={ach.id} active={gridActive} index={idx}>
                                <AchievementBadge
                                    achievement={ach}
                                    isPinned={pinnedBadges.includes(ach.id)}
                                    onTogglePin={(e) => {
                                        e.stopPropagation();
                                        togglePinBadge(ach.id);
                                    }}
                                    onClick={() => setSelectedAchievement(ach)}
                                />
                            </Reveal>
                        ))}
                    </div>
                </div>
            )}

            {/* --- MISSIONS / QUESTS VIEW --- */}
            {activeTab === 'quests' && (
                <div className="space-y-6">
                    <Reveal active={animActive}>
                        <div className="p-6 rounded-3xl bg-card border border-subtle">
                            <h3 className="text-xl font-black text-primary mb-1">
                                {t('gamification:quests.title')}
                            </h3>
                            <p className="text-sm text-secondary">
                                {t('gamification:quests.subtitle')}
                            </p>
                        </div>
                    </Reveal>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {quests.map((quest, idx) => (
                            <Reveal key={quest.id} active={animActive} index={idx + 1}>
                                <QuestCard 
                                    quest={quest} 
                                    onClaim={claimQuest} 
                                />
                            </Reveal>
                        ))}
                    </div>
                </div>
            )}

            {/* --- RANKS & REWARDS VIEW --- */}
            {activeTab === 'stats' && <ProgressStatsTab stats={progressStats} locale={locale} />}

            {activeTab === 'ranks' && (
                <Reveal active={animActive}>
                    <InvestorRankCard 
                        currentLevel={user?.level || 1} 
                        currentXp={user?.xp || 0} 
                        themeRewards={themeRewards} 
                    />
                </Reveal>
            )}

            {/* --- GOAL MODAL --- */}
            {isModalOpen && editingGoal && createPortal(
                <div 
                    className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" 
                    onClick={() => setIsModalOpen(false)}
                >
                    <div 
                        className="w-full max-w-xl bg-card rounded-2xl shadow-2xl border border-subtle flex flex-col max-h-[90vh]" 
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-subtle flex justify-between items-center">
                            <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                                <Target size={18} className="text-brand" /> {t('progress:goals.createNew')}
                            </h2>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-2 gap-4">
                                <input
                                    type="text"
                                    value={editingGoal.title}
                                    onChange={(e) => setEditingGoal({ ...editingGoal, title: e.target.value })}
                                    placeholder={t('progress:goals.form.goalNamePlaceholder')}
                                    className="bg-subtle border border-subtle rounded-lg p-3 text-primary placeholder-tertiary focus:border-brand focus:outline-none"
                                />
                                <input
                                    type="number"
                                    value={editingGoal.targetAmount}
                                    onChange={(e) => setEditingGoal({ ...editingGoal, targetAmount: parseFloat(e.target.value) })}
                                    placeholder="10000"
                                    className="bg-subtle border border-subtle rounded-lg p-3 text-primary placeholder-tertiary focus:border-brand focus:outline-none"
                                />
                            </div>

                            {/* Icons & Colors */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs font-bold text-secondary mb-2 uppercase">
                                        {t('progress:goals.form.icon')}
                                    </p>
                                    <div className="flex gap-2">
                                        {Object.keys(ICON_MAP).map((key) => {
                                            const Icon = ICON_MAP[key as keyof typeof ICON_MAP];
                                            const isSelected = editingGoal.iconType === key;
                                            return (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    onClick={() => setEditingGoal({ ...editingGoal, iconType: key as keyof typeof ICON_MAP })}
                                                    className={`p-2.5 rounded-lg border transition-all ${
                                                        isSelected ? 'bg-brand/10 border-brand text-brand' : 'border-subtle text-secondary hover:bg-subtle'
                                                    }`}
                                                >
                                                    <Icon size={18} />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <p className="text-xs font-bold text-secondary mb-2 uppercase">{t('progress:goals.color')}</p>
                                    <div className="flex gap-2">
                                        {Object.keys(GOAL_COLOR_TOKENS).map((c) => {
                                            const isSelected = editingGoal.color === c;
                                            const colorValue = GOAL_COLOR_TOKENS[c];
                                            return (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onClick={() => setEditingGoal({ ...editingGoal, color: c })}
                                                    style={{ backgroundColor: colorValue }}
                                                    className={`w-8 h-8 rounded-lg transition-transform ${
                                                        isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-card scale-110' : 'opacity-80 hover:opacity-100'
                                                    }`}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Method Selector */}
                            <div className="border border-subtle rounded-xl p-4 space-y-4 bg-subtle/30">
                                <p className="text-xs font-bold text-secondary uppercase">
                                    {t('progress:goals.form.trackingMethod')}
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setEditingGoal({ ...editingGoal, method: 'dynamic' })}
                                        className={`p-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                                            editingGoal.method === 'dynamic' ? 'bg-card border-brand text-brand shadow-sm' : 'border-subtle text-secondary hover:bg-subtle'
                                        }`}
                                    >
                                        <PlusCircle size={14} /> {t('progress:goals.form.dynamic')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditingGoal({ ...editingGoal, method: 'manual' })}
                                        className={`p-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                                            editingGoal.method === 'manual' ? 'bg-card border-brand text-brand shadow-sm' : 'border-subtle text-secondary hover:bg-subtle'
                                        }`}
                                    >
                                        <Target size={14} /> {t('progress:goals.form.manual')}
                                    </button>
                                </div>

                                {editingGoal.method === 'dynamic' && (
                                    <div className="space-y-3 pt-2">
                                        <div className="flex border-b border-subtle">
                                            <button 
                                                onClick={() => setLinkTab('asset')} 
                                                className={`px-4 py-1.5 text-xs font-bold border-b-2 transition-all ${
                                                    linkTab === 'asset' ? 'border-brand text-brand' : 'border-transparent text-secondary'
                                                }`}
                                            >
                                                ASSETS
                                            </button>
                                            <button 
                                                onClick={() => setLinkTab('class')} 
                                                className={`px-4 py-1.5 text-xs font-bold border-b-2 transition-all ${
                                                    linkTab === 'class' ? 'border-brand text-brand' : 'border-transparent text-secondary'
                                                }`}
                                            >
                                                CLASSES
                                            </button>
                                            <button 
                                                onClick={() => setLinkTab('group')} 
                                                className={`px-4 py-1.5 text-xs font-bold border-b-2 transition-all ${
                                                    linkTab === 'group' ? 'border-brand text-brand' : 'border-transparent text-secondary'
                                                }`}
                                            >
                                                {t('progress:goals.groups')}
                                            </button>
                                        </div>

                                        {editingGroupId ? (
                                            <div className="p-3 bg-card rounded-lg border border-subtle space-y-3">
                                                <div className="flex justify-between items-center pb-2 border-b border-subtle">
                                                    <span className="text-xs font-bold text-primary">{t('progress:goals.editGroupAssets')}</span>
                                                    <button onClick={() => setEditingGroupId(null)} className="text-xs text-brand hover:underline font-bold">{t('progress:goals.done')}</button>
                                                </div>
                                                <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                                                    {Array.from(new Set(positions.map(p => p.symbol))).map(symbol => {
                                                        const group = assetGroups.find(g => g.id === editingGroupId);
                                                        const isIncluded = group?.symbols.includes(symbol);
                                                        return (
                                                            <label key={symbol} className="flex items-center justify-between p-1.5 hover:bg-subtle rounded text-xs cursor-pointer">
                                                                <span className="font-bold text-primary">{symbol}</span>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isIncluded}
                                                                    onChange={() => toggleAssetInGroup(editingGroupId as string, symbol as string)}
                                                                    className="rounded border-subtle text-brand"
                                                                />
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                                                {linkTab === 'asset' && positions.map(pos => {
                                                    const link = editingGoal.linkedAssets?.find(l => l.id === pos.id && l.type === 'asset');
                                                    return (
                                                        <div key={pos.id} className={`flex items-center justify-between p-2.5 rounded-lg border ${
                                                            link ? 'bg-subtle border-brand/50' : 'border-subtle hover:bg-subtle/50'
                                                        }`}>
                                                            <div className="flex items-center gap-3">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={!!link} 
                                                                    onChange={() => handleToggleLink('asset', pos.id, pos.symbol)} 
                                                                    className="rounded border-subtle bg-subtle text-brand" 
                                                                />
                                                                <div>
                                                                    <p className="text-xs font-bold text-primary">{pos.symbol}</p>
                                                                    <p className="text-[10px] text-secondary">{formatCurrency(pos.marketValue, currency, locale)}</p>
                                                                </div>
                                                            </div>
                                                            {link && (
                                                                <div className="flex items-center gap-1">
                                                                    <input 
                                                                        type="number" 
                                                                        value={link.percentage} 
                                                                        onChange={(e) => updateLinkPercentage(pos.id, 'asset', parseInt(e.target.value))} 
                                                                        className="w-10 bg-subtle text-primary text-xs p-1 rounded border border-subtle text-center" 
                                                                    /> 
                                                                    <span className="text-xs text-secondary">%</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}

                                                {linkTab === 'class' && Array.from(new Set(positions.map(p => p.type))).map(cls => {
                                                    const link = editingGoal.linkedAssets?.find(l => l.id === cls && l.type === 'class');
                                                    return (
                                                        <div key={cls} className={`flex items-center justify-between p-2.5 rounded-lg border ${
                                                            link ? 'bg-subtle border-brand/50' : 'border-subtle hover:bg-subtle/50'
                                                        }`}>
                                                            <div className="flex items-center gap-3">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={!!link} 
                                                                    onChange={() => handleToggleLink('class', cls as string, cls as string)} 
                                                                    className="rounded border-subtle bg-subtle text-brand" 
                                                                />
                                                                <p className="text-xs font-bold text-primary">{cls}</p>
                                                            </div>
                                                            {link && (
                                                                <div className="flex items-center gap-1">
                                                                    <input 
                                                                        type="number" 
                                                                        value={link.percentage} 
                                                                        onChange={(e) => updateLinkPercentage(cls as string, 'class', parseInt(e.target.value))} 
                                                                        className="w-10 bg-subtle text-primary text-xs p-1 rounded border border-subtle text-center" 
                                                                    /> 
                                                                    <span className="text-xs text-secondary">%</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}

                                                {linkTab === 'group' && (
                                                    <>
                                                        <div className="flex gap-2 mb-2">
                                                            <input 
                                                                type="text" 
                                                                placeholder="New Group Name" 
                                                                value={newGroupname} 
                                                                onChange={e => setNewGroupName(e.target.value)} 
                                                                className="flex-1 bg-subtle border-none rounded text-xs px-2 text-primary placeholder-tertiary focus:ring-1 focus:ring-brand" 
                                                            />
                                                            <button 
                                                                onClick={handleCreateGroup} 
                                                                className="bg-brand text-white text-xs px-3 rounded flex items-center gap-1 hover:bg-brand/90"
                                                            >
                                                                <Plus size={14} /> Create
                                                            </button>
                                                        </div>
                                                        {assetGroups.map(grp => {
                                                            const link = editingGoal.linkedAssets?.find(l => l.id === grp.id && l.type === 'group');
                                                            return (
                                                                <div key={grp.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                                                                    link ? 'bg-subtle border-brand/50' : 'border-subtle hover:bg-subtle/50'
                                                                }`}>
                                                                    <div className="flex items-center gap-3">
                                                                        <input 
                                                                            type="checkbox" 
                                                                            checked={!!link} 
                                                                            onChange={() => handleToggleLink('group', grp.id, grp.name)} 
                                                                            className="rounded border-subtle bg-subtle text-brand" 
                                                                        />
                                                                        <div>
                                                                            <p className="text-sm font-bold text-primary">{grp.name}</p>
                                                                            <p className="text-xs text-secondary">{grp.symbols.length} Assets</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); setEditingGroupId(grp.id); }} 
                                                                            className="p-1.5 rounded hover:bg-card-hover text-secondary hover:text-primary" 
                                                                            title="Edit Members"
                                                                        >
                                                                            <Settings size={14} />
                                                                        </button>
                                                                        {link && (
                                                                            <div className="flex items-center gap-1">
                                                                                <input 
                                                                                    type="number" 
                                                                                    value={link.percentage} 
                                                                                    onChange={(e) => updateLinkPercentage(grp.id, 'group', parseInt(e.target.value))} 
                                                                                    className="w-10 bg-subtle text-primary text-xs p-1 rounded border border-subtle text-center" 
                                                                                /> 
                                                                                <span className="text-xs text-secondary">%</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {editingGoal.method === 'manual' && (
                                    <div>
                                        <input
                                            type="number"
                                            value={editingGoal.manualAmount}
                                            onChange={(e) => setEditingGoal({ ...editingGoal, manualAmount: parseFloat(e.target.value) })}
                                            placeholder="Enter Amount"
                                            className="w-full bg-subtle border border-subtle rounded-lg p-3 text-primary placeholder-tertiary focus:border-brand outline-none"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-subtle flex justify-end gap-3 bg-card rounded-b-2xl">
                            <Button onClick={() => setIsModalOpen(false)} variant="ghost">
                                {t('common:buttons.cancel')}
                            </Button>
                            <Button onClick={handleSave} className="flex items-center gap-2">
                                <Save size={16} /> {t('common:buttons.save')}
                            </Button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* --- ACHIEVEMENT DETAIL MODAL --- */}
            {selectedAchievement && createPortal(
                <div
                    className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
                    onClick={handleCloseAchievementModal}
                >
                    <div
                        className="w-full max-w-md bg-card rounded-2xl shadow-2xl border border-subtle p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-4">
                                <div className="p-4 rounded-xl bg-brand/10 text-brand">
                                    <Trophy size={32} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-primary">
                                        {selectedAchievement.badgeKey 
                                            ? t(`gamification:badges.${selectedAchievement.badgeKey}.title`, { defaultValue: selectedAchievement.title })
                                            : selectedAchievement.title}
                                    </h2>
                                    <p className="text-secondary text-sm">
                                        {t('gamification:level')} {selectedAchievement.currentLevel}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 mb-6">
                            {selectedAchievement.levels?.map((lvl) => {
                                const isCompleted = selectedAchievement.currentLevel >= lvl.level;
                                const isCurrent = selectedAchievement.currentLevel + 1 === lvl.level;
                                return (
                                    <div 
                                        key={lvl.level} 
                                        className={`p-4 rounded-xl border flex justify-between items-center ${
                                            isCompleted 
                                                ? 'bg-positive-subtle border-positive/30' 
                                                : isCurrent 
                                                    ? 'bg-brand/10 border-brand/50' 
                                                    : 'bg-subtle border-subtle'
                                        }`}
                                    >
                                        <div>
                                            <p className={`text-sm font-bold ${
                                                isCompleted ? 'text-positive' : isCurrent ? 'text-brand' : 'text-secondary'
                                            }`}>
                                                {t('gamification:level')} {lvl.level}
                                            </p>
                                            <p className={`${isCompleted || isCurrent ? 'text-secondary' : 'text-tertiary'} text-sm`}>
                                                {lvl.description}
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-end shrink-0">
                                            <span className="text-xs font-bold text-secondary">+{lvl.xpReward} XP</span>
                                            {isCompleted && <CheckCircle size={16} className="text-positive mt-1" />}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <Button onClick={handleCloseAchievementModal} className="w-full" variant="secondary">
                            {t('common:buttons.close', { defaultValue: 'Close' })}
                        </Button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Progress;