import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import Button from '../components/Button';
import { FinancialGoal, Achievement, LinkedAsset, AssetGroup } from '../types';
import { Home, Plane, Car, Shield, Wallet, PlusCircle, Pin, Trash2, Edit2, X, Zap, Link as LinkIcon, Target, Trophy, Lock, Medal, BarChart3, Star, CheckCircle, Settings, ChevronLeft, Plus, ArrowUpRight, Save } from 'lucide-react';
import GoalCard from '../components/GoalCard';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';

const ICON_MAP = { home: Home, plane: Plane, car: Car, emergency: Shield, other: Wallet };

const Progress: React.FC = () => {
    const { t } = useTranslation();
    const { goals, positions, achievements, assetGroups, saveGoal, deleteGoal, toggleGoalPin, addAssetGroup, updateAssetGroup, deleteAssetGroup } = useData();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'goals' | 'achievements'>('goals');
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

    // Handle URL Params for Tabs and Deep Linking
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'achievements') {
            setActiveTab('achievements');
        } else if (tab === 'goals') {
            setActiveTab('goals');
        }

        // Deep link to specific achievement
        const openId = searchParams.get('openId');
        if (openId && achievements) {
            const target = achievements.find(a => a.id === openId);
            if (target) {
                setSelectedAchievement(target);
                // Clear the param so refreshing doesn't re-open it indefinitely if we navigate away
                // But usually we keep it for sharing. For now, let's leave it.
            }
        }

        if (searchParams.get('action') === 'new') {
            handleAddNew();
            setActiveTab('goals');
            // We consume the action
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
            id: Math.random().toString(36).substr(2, 9),
            name: newGroupname,
            symbols: [],
            color: 'blue'
        };
        addAssetGroup(newGrp);
        setNewGroupName('');
        setEditingGroupId(newGrp.id); // Switch to edit mode immediately
    };

    const toggleAssetInGroup = (groupId: string, symbol: string) => {
        const group = assetGroups.find(g => g.id === groupId);
        if (!group) return;

        const newSymbols = group.symbols.includes(symbol)
            ? group.symbols.filter(s => s !== symbol)
            : [...group.symbols, symbol];

        updateAssetGroup(groupId, { symbols: newSymbols });
    };

    // --- HELPERS ---

    const GoalCard: React.FC<{ goal: FinancialGoal }> = ({ goal }) => {
        const Icon = ICON_MAP[goal.iconType] || Wallet;
        const safeCurrent = goal.currentAmount || 0;
        const progress = Math.min((safeCurrent / goal.targetAmount) * 100, 100);

        let colorClass = 'bg-primary';
        if (goal.color === 'emerald') colorClass = 'bg-accent-green';
        if (goal.color === 'rose') colorClass = 'bg-accent-red';
        if (goal.color === 'orange') colorClass = 'bg-orange-500';
        if (goal.color === 'indigo') colorClass = 'bg-indigo-500';

        return (
            <div className="relative group rounded-xl bg-white/50 dark:bg-black/20 p-6 shadow-lg ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-lg border border-transparent hover:border-black/5 dark:hover:border-white/5 transition-all">
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button onClick={() => toggleGoalPin(goal.id)} className={`p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 ${goal.isPinned ? 'text-primary' : 'text-black/40 dark:text-white/40'}`}>
                        <Pin size={16} fill={goal.isPinned ? "currentColor" : "none"} />
                    </button>
                    <button onClick={() => handleEdit(goal)} className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-black/60 dark:text-white/60">
                        <Edit2 size={16} />
                    </button>
                    <button onClick={() => deleteGoal(goal.id)} className="p-2 rounded-full hover:bg-rose-500/10 text-rose-500">
                        <Trash2 size={16} />
                    </button>
                </div>

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
                        <h3 className="text-lg font-bold text-black dark:text-white truncate" title={goal.title}>{goal.title}</h3>
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
                        <span className="text-black/60 dark:text-white/60">Progress</span>
                        <span className="text-black dark:text-white">{progress.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-black/10 dark:bg-white/10 h-2 rounded-full overflow-hidden">
                        <div className={`h-full ${colorClass} transition-all duration-1000 relative overflow-hidden`} style={{ width: `${progress}%` }}></div>
                    </div>
                    <div className="flex justify-between text-xs text-black/40 dark:text-white/40 font-mono">
                        <span>${safeCurrent.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        <span>Target: ${goal.targetAmount.toLocaleString()}</span>
                    </div>
                </div>

                {goal.method === 'dynamic' && goal.linkedAssets && (
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-black/5 dark:border-white/5">
                        {goal.linkedAssets.map(link => (
                            <span key={link.id} className="px-2 py-1 rounded text-[10px] font-bold bg-black/5 dark:bg-white/5 text-black/60 dark:text-white/60 border border-black/5 dark:border-white/5 flex items-center gap-1">
                                <LinkIcon size={8} /> {link.percentage}% {link.name}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const AchievementBadge: React.FC<{ ach: Achievement }> = ({ ach }) => {
        // Determine next level
        const nextLevelData = ach.levels.find(l => l.level === ach.currentLevel + 1);
        const currentLevelData = ach.levels.find(l => l.level === ach.currentLevel);

        let progressPercent = 0;

        if (nextLevelData) {
            // We are between currentLevel (floor) and nextLevel (ceiling)
            // For Level 0, floor is 0.
            const prevTarget = currentLevelData ? currentLevelData.targetValue : 0;
            const nextTarget = nextLevelData.targetValue;
            const currentVal = ach.currentValue || 0;

            // Calculate relative progress between levels
            // e.g. Level 1 (100) -> Level 2 (500). Current 250.
            // Progress = (250 - 100) / (500 - 100) = 150/400 = 37.5%

            const range = nextTarget - prevTarget;
            const valueInLevel = Math.max(0, currentVal - prevTarget);
            progressPercent = Math.min((valueInLevel / range) * 100, 100);

            // If we are at level 0, prevTarget is undefined/0, so math works: (val - 0) / (target - 0)
        } else {
            // Max level reached
            progressPercent = 100;
        }

        const Icon = ach.iconType === 'rocket' ? Trophy :
            ach.iconType === 'diamond' ? Wallet :
                ach.iconType === 'chart' ? BarChart3 :
                    ach.iconType === 'trophy' ? Trophy :
                        ach.iconType === 'star' ? ArrowUpRight : Star;

        let colorClass = 'text-slate-500 bg-slate-500/10';
        let progressColor = 'bg-slate-500';

        if (ach.unlocked) {
            if (ach.color === 'indigo') { colorClass = 'text-indigo-500 bg-indigo-500/10'; progressColor = 'bg-indigo-500'; }
            if (ach.color === 'blue') { colorClass = 'text-blue-500 bg-blue-500/10'; progressColor = 'bg-blue-500'; }
            if (ach.color === 'emerald') { colorClass = 'text-accent-green bg-accent-green/10'; progressColor = 'bg-accent-green'; }
            if (ach.color === 'orange') { colorClass = 'text-orange-500 bg-orange-500/10'; progressColor = 'bg-orange-500'; }
        }

        return (
            <button
                onClick={() => setSelectedAchievement(ach)}
                className={`relative flex flex-col items-center p-6 rounded-2xl border transition-all duration-300 hover:scale-[1.02] text-left w-full
            ${ach.unlocked ? 'bg-white/5 dark:bg-white/5 border-primary/20 hover:border-primary/50' : 'bg-black/5 dark:bg-white/5 border-transparent opacity-60 hover:opacity-100'}
        `}>
                {/* Removed top-right absolute icon as requested */}

                <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${colorClass}`}>
                    <Icon size={24} />
                </div>

                <h3 className="font-bold text-black dark:text-white mb-1">{ach.title}</h3>
                <p className="text-xs text-black/50 dark:text-white/50 mb-4 text-center">Level {ach.currentLevel}</p>

                {/* Progress Bar */}
                <div className="w-full bg-black/10 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-1000 ${progressColor}`} style={{ width: `${progressPercent}%` }}></div>
                </div>
            </button>
        )
    }

    return (
        <div className="space-y-8 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                    <h1 className="text-4xl font-black text-blue-600 dark:text-blue-500 mb-2">Progress Hub</h1>
                    <p className="text-black/60 dark:text-white/60">
                        Level {user?.level || 1} • {user?.xp || 0} XP
                    </p>
                </div>

                <div className="flex bg-black/5 dark:bg-white/5 p-1 rounded-xl">
                    <button onClick={() => { setActiveTab('goals'); setSearchParams({ tab: 'goals' }); }} className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'goals' ? 'bg-white dark:bg-slate-800 text-primary shadow-lg' : 'text-black/40 dark:text-white/40'}`}>Goals</button>
                    <button onClick={() => { setActiveTab('achievements'); setSearchParams({ tab: 'achievements' }); }} className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'achievements' ? 'bg-white dark:bg-slate-800 text-primary shadow-lg' : 'text-black/40 dark:text-white/40'}`}>Achievements</button>
                </div>
            </div>

            {/* --- GOALS VIEW --- */}
            {activeTab === 'goals' && (
                <div className="animate-fade-in space-y-6">
                    <div className="flex justify-end">
                        <Button onClick={handleAddNew} className="flex items-center gap-2 bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20">
                            <PlusCircle size={18} /> New Goal
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {goals.map(goal => (
                            <GoalCard
                                key={goal.id}
                                goal={goal}
                                onEdit={() => handleEdit(goal)}
                                onDelete={() => deleteGoal(goal.id)}
                                onPin={() => toggleGoalPin(goal.id)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* --- ACHIEVEMENTS VIEW --- */}
            {activeTab === 'achievements' && (
                <div className="animate-fade-in grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {achievements.map(ach => <AchievementBadge key={ach.id} ach={ach} />)}
                </div>
            )}

            {/* --- GOAL MODAL (Styled like Screenshot) --- */}
            {isModalOpen && editingGoal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-xl bg-white dark:bg-slate-950 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <Target size={18} className="text-primary" /> Set New Target
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white"><X size={20} /></button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-2 gap-4">
                                <input
                                    type="text"
                                    value={editingGoal.title}
                                    onChange={(e) => setEditingGoal({ ...editingGoal, title: e.target.value })}
                                    placeholder="e.g. Dream House"
                                    className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-slate-900 dark:text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                                />
                                <input
                                    type="number"
                                    value={editingGoal.targetAmount}
                                    onChange={(e) => setEditingGoal({ ...editingGoal, targetAmount: parseFloat(e.target.value) })}
                                    placeholder="10000"
                                    className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-slate-900 dark:text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                                />
                            </div>

                            {/* Icons & Colors */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs font-bold text-slate-500 mb-2 uppercase">ICON</p>
                                    <div className="flex gap-2">
                                        {Object.keys(ICON_MAP).map((key) => {
                                            const Icon = ICON_MAP[key as keyof typeof ICON_MAP];
                                            const isSelected = editingGoal.iconType === key;
                                            return (
                                                <button
                                                    key={key}
                                                    onClick={() => setEditingGoal({ ...editingGoal, iconType: key as any })}
                                                    className={`p-2.5 rounded-lg border transition-all ${isSelected ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                                                >
                                                    <Icon size={18} />
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-slate-500 mb-2 uppercase">COLOR</p>
                                    <div className="flex gap-2">
                                        {['blue', 'indigo', 'emerald', 'orange', 'rose'].map(color => (
                                            <button
                                                key={color}
                                                onClick={() => setEditingGoal({ ...editingGoal, color })}
                                                className={`w-10 h-10 rounded-lg transition-all ${editingGoal.color === color ? 'ring-2 ring-white scale-110' : 'opacity-60 hover:opacity-100'}`}
                                                style={{ backgroundColor: `var(--color-${color}-500, ${color === 'blue' ? '#3b82f6' : color === 'indigo' ? '#6366f1' : color === 'emerald' ? '#10b981' : color === 'orange' ? '#f97316' : '#f43f5e'})` }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Tracking Method Container (Blue Border like screenshot) */}
                            <div className="border border-blue-500/30 rounded-xl bg-blue-500/5 p-4">
                                <p className="text-xs font-bold text-slate-500 mb-3 uppercase">TRACKING METHOD</p>
                                <div className="flex gap-4 mb-4">
                                    <button
                                        onClick={() => setEditingGoal({ ...editingGoal, method: 'dynamic' })}
                                        className={`flex-1 py-3 rounded-lg border font-medium text-sm flex items-center justify-center gap-2 transition-all ${editingGoal.method === 'dynamic' ? 'bg-slate-100 dark:bg-slate-900 border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                                    >
                                        <Zap size={16} /> Auto-Track Assets
                                    </button>
                                    <button
                                        onClick={() => setEditingGoal({ ...editingGoal, method: 'manual' })}
                                        className={`flex-1 py-3 rounded-lg border font-medium text-sm flex items-center justify-center gap-2 transition-all ${editingGoal.method === 'manual' ? 'bg-slate-100 dark:bg-slate-900 border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                                    >
                                        <Save size={16} /> Fixed Manual Amount
                                    </button>
                                </div>

                                {/* Dynamic Logic */}
                                {editingGoal.method === 'dynamic' && (
                                    <div>
                                        {/* If editing a group, show Group Edit UI, otherwise show Tabs */}
                                        {editingGroupId ? (
                                            <div className="animate-in fade-in slide-in-from-right-4">
                                                <div className="flex items-center gap-2 mb-4 border-b border-slate-700 pb-2">
                                                    <button onClick={() => setEditingGroupId(null)} className="p-1 hover:bg-slate-700 rounded"><ChevronLeft size={16} className="text-white" /></button>
                                                    <p className="text-sm font-bold text-white">Edit "{assetGroups.find(g => g.id === editingGroupId)?.name}"</p>
                                                </div>
                                                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                                                    {positions.map(pos => {
                                                        const group = assetGroups.find(g => g.id === editingGroupId);
                                                        const isIncluded = group?.symbols.includes(pos.symbol);
                                                        return (
                                                            <div key={pos.id} onClick={() => toggleAssetInGroup(editingGroupId, pos.symbol)} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer ${isIncluded ? 'bg-slate-100 dark:bg-slate-900 border-blue-500/50' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'}`}>
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${isIncluded ? 'bg-blue-600 border-blue-600' : 'border-slate-600'}`}>
                                                                        {isIncluded && <CheckCircle size={12} className="text-white" />}
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-sm font-bold text-white">{pos.instrument}</p>
                                                                        <p className="text-xs text-slate-500 flex gap-2">
                                                                            {pos.type === 'Cash' && pos.accountName ? <span>{pos.accountName} ({pos.currency})</span> : <span>{pos.symbol}</span>}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <span className="text-xs text-slate-400">{pos.type}</span>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex gap-4 border-b border-slate-700 mb-4">
                                                    <button onClick={() => setLinkTab('asset')} className={`pb-2 text-xs font-bold uppercase ${linkTab === 'asset' ? 'text-white border-b-2 border-blue-500' : 'text-slate-500'}`}>Assets</button>
                                                    <button onClick={() => setLinkTab('class')} className={`pb-2 text-xs font-bold uppercase ${linkTab === 'class' ? 'text-white border-b-2 border-blue-500' : 'text-slate-500'}`}>Classes</button>
                                                    <button onClick={() => setLinkTab('group')} className={`pb-2 text-xs font-bold uppercase ${linkTab === 'group' ? 'text-white border-b-2 border-blue-500' : 'text-slate-500'}`}>Groups</button>
                                                </div>

                                                {/* List of Selectable Items */}
                                                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                                                    {linkTab === 'asset' && positions.map(pos => {
                                                        const link = editingGoal.linkedAssets?.find(l => l.id === pos.symbol && l.type === 'asset');
                                                        return (
                                                            <div key={pos.id} className={`flex items-center justify-between p-3 rounded-lg border ${link ? 'bg-slate-100 dark:bg-slate-900 border-blue-500/50' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'}`}>
                                                                <div className="flex items-center gap-3">
                                                                    <input type="checkbox" checked={!!link} onChange={() => handleToggleLink('asset', pos.symbol, pos.instrument)} className="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-offset-0" />
                                                                    <div>
                                                                        <p className="text-sm font-bold text-white">{pos.instrument}</p>
                                                                        <p className="text-xs text-slate-500 flex gap-2">
                                                                            {pos.type === 'Cash' && pos.accountName ? <span>{pos.bankName} - {pos.accountName}</span> : <span>{pos.symbol}</span>}
                                                                            <span>• ${pos.marketValue.toLocaleString()}</span>
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                {link && <div className="flex items-center gap-2"><span className="text-xs text-slate-400">Include:</span><input type="number" value={link.percentage} onChange={(e) => updateLinkPercentage(pos.symbol, 'asset', parseInt(e.target.value))} className="w-12 bg-slate-800 text-white text-xs p-1 rounded border border-slate-700 text-center" /> <span className="text-xs text-slate-400">%</span></div>}
                                                            </div>
                                                        )
                                                    })}

                                                    {linkTab === 'class' && ['Equity', 'ETF', 'Crypto', 'Cash'].map(cls => {
                                                        const link = editingGoal.linkedAssets?.find(l => l.id === cls && l.type === 'class');
                                                        return (
                                                            <div key={cls} className={`flex items-center justify-between p-3 rounded-lg border ${link ? 'bg-slate-100 dark:bg-slate-900 border-blue-500/50' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'}`}>
                                                                <div className="flex items-center gap-3">
                                                                    <input type="checkbox" checked={!!link} onChange={() => handleToggleLink('class', cls, `All ${cls}`)} className="rounded border-slate-600 bg-slate-800 text-blue-600" />
                                                                    <p className="text-sm font-bold text-white">All {cls}</p>
                                                                </div>
                                                                {link && <div className="flex items-center gap-2"><input type="number" value={link.percentage} onChange={(e) => updateLinkPercentage(cls, 'class', parseInt(e.target.value))} className="w-12 bg-slate-800 text-white text-xs p-1 rounded border border-slate-700 text-center" /> <span className="text-xs text-slate-400">%</span></div>}
                                                            </div>
                                                        )
                                                    })}

                                                    {linkTab === 'group' && (
                                                        <>
                                                            <div className="flex gap-2 mb-2">
                                                                <input type="text" placeholder="New Group Name" value={newGroupname} onChange={e => setNewGroupName(e.target.value)} className="flex-1 bg-slate-800 border-none rounded text-xs px-2 text-white placeholder-slate-500 focus:ring-1 focus:ring-blue-500" />
                                                                <button onClick={handleCreateGroup} className="bg-blue-600 text-white text-xs px-3 rounded flex items-center gap-1 hover:bg-blue-500"><Plus size={14} /> Create</button>
                                                            </div>
                                                            {assetGroups.map(grp => {
                                                                const link = editingGoal.linkedAssets?.find(l => l.id === grp.id && l.type === 'group');
                                                                return (
                                                                    <div key={grp.id} className={`flex items-center justify-between p-3 rounded-lg border ${link ? 'bg-slate-100 dark:bg-slate-900 border-blue-500/50' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'}`}>
                                                                        <div className="flex items-center gap-3">
                                                                            <input type="checkbox" checked={!!link} onChange={() => handleToggleLink('group', grp.id, grp.name)} className="rounded border-slate-600 bg-slate-800 text-blue-600" />
                                                                            <div>
                                                                                <p className="text-sm font-bold text-white">{grp.name}</p>
                                                                                <p className="text-xs text-slate-500">{grp.symbols.length} Assets</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <button onClick={(e) => { e.stopPropagation(); setEditingGroupId(grp.id); }} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white" title="Edit Members">
                                                                                <Settings size={14} />
                                                                            </button>
                                                                            {link && <div className="flex items-center gap-1"><input type="number" value={link.percentage} onChange={(e) => updateLinkPercentage(grp.id, 'group', parseInt(e.target.value))} className="w-10 bg-slate-800 text-white text-xs p-1 rounded border border-slate-700 text-center" /> <span className="text-xs text-slate-400">%</span></div>}
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                        </>
                                                    )}
                                                </div>
                                            </>
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
                                            className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-slate-900 dark:text-white focus:border-blue-500 outline-none"
                                        />
                                    </div>
                                )}

                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 bg-white dark:bg-slate-950 rounded-b-2xl">
                            <Button onClick={() => setIsModalOpen(false)} variant="ghost">Cancel</Button>
                            <Button onClick={handleSave} className="flex items-center gap-2">
                                <Save size={16} /> Save Changes
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- ACHIEVEMENT DETAIL MODAL --- */}
            {selectedAchievement && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-md bg-card rounded-2xl shadow-2xl border border-border p-6">
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-4">
                                <div className={`p-4 rounded-xl ${selectedAchievement.color === 'indigo' ? 'bg-indigo-500/20 text-indigo-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                    <Trophy size={32} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{selectedAchievement.title}</h2>
                                    <p className="text-slate-500 text-sm">Level {selectedAchievement.currentLevel}</p>
                                </div>
                            </div>
                            {/* Removed X button as requested */}
                        </div>

                        <div className="space-y-4 mb-6">
                            {selectedAchievement.levels.map((lvl) => {
                                const isCompleted = selectedAchievement.currentLevel >= lvl.level;
                                const isCurrent = selectedAchievement.currentLevel + 1 === lvl.level;
                                return (
                                    <div key={lvl.level} className={`p-4 rounded-xl border flex justify-between items-center ${isCompleted ? 'bg-success/5 border-success/30' : isCurrent ? 'bg-brand/5 border-brand/50' : 'bg-subtle border-border'}`}>
                                        <div>
                                            <p className={`text-sm font-bold ${isCompleted ? 'text-success' : isCurrent ? 'text-brand' : 'text-secondary'}`}>Level {lvl.level}</p>
                                            <p className={`${isCompleted || isCurrent ? 'text-secondary' : 'text-tertiary'} text-sm`}>{lvl.description}</p>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-xs font-bold text-secondary">+{lvl.xpReward} XP</span>
                                            {isCompleted && <CheckCircle size={16} className="text-success mt-1" />}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <Button onClick={() => setSelectedAchievement(null)} className="w-full" variant="secondary">Close</Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Progress;