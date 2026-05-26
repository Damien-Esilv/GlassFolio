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
const GOAL_COLOR_TOKENS: Record<string, string> = {
    blue: 'var(--color-primary)',
    indigo: 'var(--color-info)',
    emerald: 'var(--color-success)',
    orange: 'var(--color-warning)',
    rose: 'var(--color-error)'
};

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
            <div className="relative group rounded-xl bg-card p-6 shadow-lg border border-subtle hover:border-border transition-all">
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button onClick={() => toggleGoalPin(goal.id)} className={`p-2 rounded-full hover:bg-card-hover ${goal.isPinned ? 'text-primary' : 'text-tertiary'}`}>
                        <Pin size={16} fill={goal.isPinned ? "currentColor" : "none"} />
                    </button>
                    <button onClick={() => handleEdit(goal)} className="p-2 rounded-full hover:bg-card-hover text-secondary">
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
                    <div className="flex justify-between text-xs text-tertiary font-mono">
                        <span>${safeCurrent.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        <span>Target: ${goal.targetAmount.toLocaleString()}</span>
                    </div>
                </div>

                {goal.method === 'dynamic' && goal.linkedAssets && (
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-subtle">
                        {goal.linkedAssets.map(link => (
                            <span key={link.id} className="px-2 py-1 rounded text-[10px] font-bold bg-subtle text-secondary border border-subtle flex items-center gap-1">
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

        let colorClass = 'text-secondary bg-subtle';
        let progressColor = 'bg-brand/50';

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
            ${ach.unlocked ? 'bg-card border-brand/20 hover:border-brand/50' : 'bg-subtle border-transparent opacity-60 hover:opacity-100'}
        `}>
                {/* Removed top-right absolute icon as requested */}

                <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${colorClass}`}>
                    <Icon size={24} />
                </div>

                <h3 className="font-bold text-primary mb-1">{ach.title}</h3>
                <p className="text-xs text-tertiary mb-4 text-center">Level {ach.currentLevel}</p>

                {/* Progress Bar */}
                <div className="w-full bg-subtle h-1.5 rounded-full overflow-hidden">
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
                    <h1 className="text-4xl font-black text-brand mb-2">Progress Hub</h1>
                    <p className="text-secondary">
                        Level {user?.level || 1} • {user?.xp || 0} XP
                    </p>
                </div>

                <div className="flex bg-subtle p-1 rounded-xl">
                    <button onClick={() => { setActiveTab('goals'); setSearchParams({ tab: 'goals' }); }} className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'goals' ? 'bg-card text-primary shadow-lg' : 'text-secondary/60'}`}>Goals</button>
                    <button onClick={() => { setActiveTab('achievements'); setSearchParams({ tab: 'achievements' }); }} className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'achievements' ? 'bg-card text-primary shadow-lg' : 'text-secondary/60'}`}>Achievements</button>
                </div>
            </div>

            {/* --- GOALS VIEW --- */}
            {activeTab === 'goals' && (
                <div className="animate-fade-in space-y-6">
                    <div className="flex justify-end">
                        <Button onClick={handleAddNew} className="flex items-center gap-2 bg-brand text-white hover:bg-brand/90 shadow-lg shadow-brand/20">
                            <PlusCircle size={18} /> New Goal
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {goals.map(goal => (
                            <GoalCard
                                key={goal.id}
                                goal={goal}
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
                    <div className="w-full max-w-xl bg-card rounded-2xl shadow-2xl border border-subtle flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="p-6 border-b border-subtle flex justify-between items-center">
                            <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                                <Target size={18} className="text-brand" /> Set New Target
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-secondary hover:text-primary"><X size={20} /></button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-2 gap-4">
                                <input
                                    type="text"
                                    value={editingGoal.title}
                                    onChange={(e) => setEditingGoal({ ...editingGoal, title: e.target.value })}
                                    placeholder="e.g. Dream House"
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
                                    <p className="text-xs font-bold text-secondary mb-2 uppercase">ICON</p>
                                    <div className="flex gap-2">
                                        {Object.keys(ICON_MAP).map((key) => {
                                            const Icon = ICON_MAP[key as keyof typeof ICON_MAP];
                                            const isSelected = editingGoal.iconType === key;
                                            return (
                                                <button
                                                    key={key}
                                                    onClick={() => setEditingGoal({ ...editingGoal, iconType: key as keyof typeof ICON_MAP })}
                                                    className={`p-2.5 rounded-lg border transition-all ${isSelected ? 'bg-brand text-white border-brand' : 'bg-subtle border-subtle text-secondary hover:text-primary'}`}
                                                >
                                                    <Icon size={18} />
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-secondary mb-2 uppercase">COLOR</p>
                                    <div className="flex gap-2">
                                        {['blue', 'indigo', 'emerald', 'orange', 'rose'].map(color => (
                                            <button
                                                key={color}
                                                onClick={() => setEditingGoal({ ...editingGoal, color })}
                                                className={`w-10 h-10 rounded-lg transition-all ${editingGoal.color === color ? 'ring-2 ring-primary scale-110' : 'opacity-60 hover:opacity-100'}`}
                                                style={{ backgroundColor: GOAL_COLOR_TOKENS[color] ?? 'var(--color-primary)' }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Tracking Method Container (Blue Border like screenshot) */}
                            <div className="border border-brand/30 rounded-xl bg-brand/5 p-4">
                                <p className="text-xs font-bold text-secondary mb-3 uppercase">TRACKING METHOD</p>
                                <div className="flex gap-4 mb-4">
                                    <button
                                        onClick={() => setEditingGoal({ ...editingGoal, method: 'dynamic' })}
                                        className={`flex-1 py-3 rounded-lg border font-medium text-sm flex items-center justify-center gap-2 transition-all ${editingGoal.method === 'dynamic' ? 'bg-subtle border-brand text-brand' : 'border-transparent text-secondary hover:text-primary'}`}
                                    >
                                        <Zap size={16} /> Auto-Track Assets
                                    </button>
                                    <button
                                        onClick={() => setEditingGoal({ ...editingGoal, method: 'manual' })}
                                        className={`flex-1 py-3 rounded-lg border font-medium text-sm flex items-center justify-center gap-2 transition-all ${editingGoal.method === 'manual' ? 'bg-subtle border-brand text-brand' : 'border-transparent text-secondary hover:text-primary'}`}
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
                                                <div className="flex items-center gap-2 mb-4 border-b border-subtle pb-2">
                                                    <button onClick={() => setEditingGroupId(null)} className="p-1 hover:bg-card-hover rounded"><ChevronLeft size={16} className="text-primary" /></button>
                                                    <p className="text-sm font-bold text-primary">Edit "{assetGroups.find(g => g.id === editingGroupId)?.name}"</p>
                                                </div>
                                                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                                                    {positions.map(pos => {
                                                        const group = assetGroups.find(g => g.id === editingGroupId);
                                                        const isIncluded = group?.symbols.includes(pos.symbol);
                                                        return (
                                                            <div key={pos.id} onClick={() => toggleAssetInGroup(editingGroupId, pos.symbol)} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer ${isIncluded ? 'bg-subtle border-brand/50' : 'border-subtle hover:bg-subtle/50'}`}>
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${isIncluded ? 'bg-brand border-brand' : 'border-subtle'}`}>
                                                                        {isIncluded && <CheckCircle size={12} className="text-white" />}
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-sm font-bold text-primary">{pos.instrument}</p>
                                                                        <p className="text-xs text-secondary flex gap-2">
                                                                            {pos.type === 'Cash' && pos.accountName ? <span>{pos.accountName} ({pos.currency})</span> : <span>{pos.symbol}</span>}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <span className="text-xs text-secondary">{pos.type}</span>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex gap-4 border-b border-subtle mb-4">
                                                    <button onClick={() => setLinkTab('asset')} className={`pb-2 text-xs font-bold uppercase ${linkTab === 'asset' ? 'text-primary border-b-2 border-brand' : 'text-secondary'}`}>Assets</button>
                                                    <button onClick={() => setLinkTab('class')} className={`pb-2 text-xs font-bold uppercase ${linkTab === 'class' ? 'text-primary border-b-2 border-brand' : 'text-secondary'}`}>Classes</button>
                                                    <button onClick={() => setLinkTab('group')} className={`pb-2 text-xs font-bold uppercase ${linkTab === 'group' ? 'text-primary border-b-2 border-brand' : 'text-secondary'}`}>Groups</button>
                                                </div>

                                                {/* List of Selectable Items */}
                                                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                                                    {linkTab === 'asset' && positions.map(pos => {
                                                        const link = editingGoal.linkedAssets?.find(l => l.id === pos.symbol && l.type === 'asset');
                                                        return (
                                                            <div key={pos.id} className={`flex items-center justify-between p-3 rounded-lg border ${link ? 'bg-subtle border-brand/50' : 'border-subtle hover:bg-subtle/50'}`}>
                                                                <div className="flex items-center gap-3">
                                                                    <input type="checkbox" checked={!!link} onChange={() => handleToggleLink('asset', pos.symbol, pos.instrument)} className="rounded border-subtle bg-subtle text-brand focus:ring-offset-0" />
                                                                    <div>
                                                                        <p className="text-sm font-bold text-primary">{pos.instrument}</p>
                                                                        <p className="text-xs text-secondary flex gap-2">
                                                                            {pos.type === 'Cash' && pos.accountName ? <span>{pos.bankName} - {pos.accountName}</span> : <span>{pos.symbol}</span>}
                                                                            <span>• ${pos.marketValue.toLocaleString()}</span>
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                {link && <div className="flex items-center gap-2"><span className="text-xs text-secondary">Include:</span><input type="number" value={link.percentage} onChange={(e) => updateLinkPercentage(pos.symbol, 'asset', parseInt(e.target.value))} className="w-12 bg-subtle text-primary text-xs p-1 rounded border border-subtle text-center" /> <span className="text-xs text-secondary">%</span></div>}
                                                            </div>
                                                        )
                                                    })}

                                                    {linkTab === 'class' && ['Equity', 'ETF', 'Crypto', 'Cash'].map(cls => {
                                                        const link = editingGoal.linkedAssets?.find(l => l.id === cls && l.type === 'class');
                                                        return (
                                                            <div key={cls} className={`flex items-center justify-between p-3 rounded-lg border ${link ? 'bg-subtle border-brand/50' : 'border-subtle hover:bg-subtle/50'}`}>
                                                                <div className="flex items-center gap-3">
                                                                    <input type="checkbox" checked={!!link} onChange={() => handleToggleLink('class', cls, `All ${cls}`)} className="rounded border-subtle bg-subtle text-brand" />
                                                                    <p className="text-sm font-bold text-primary">All {cls}</p>
                                                                </div>
                                                                {link && <div className="flex items-center gap-2"><input type="number" value={link.percentage} onChange={(e) => updateLinkPercentage(cls, 'class', parseInt(e.target.value))} className="w-12 bg-subtle text-primary text-xs p-1 rounded border border-subtle text-center" /> <span className="text-xs text-secondary">%</span></div>}
                                                            </div>
                                                        )
                                                    })}

                                                    {linkTab === 'group' && (
                                                        <>
                                                            <div className="flex gap-2 mb-2">
                                                                <input type="text" placeholder="New Group Name" value={newGroupname} onChange={e => setNewGroupName(e.target.value)} className="flex-1 bg-subtle border-none rounded text-xs px-2 text-primary placeholder-tertiary focus:ring-1 focus:ring-brand" />
                                                                <button onClick={handleCreateGroup} className="bg-brand text-white text-xs px-3 rounded flex items-center gap-1 hover:bg-brand/90"><Plus size={14} /> Create</button>
                                                            </div>
                                                            {assetGroups.map(grp => {
                                                                const link = editingGoal.linkedAssets?.find(l => l.id === grp.id && l.type === 'group');
                                                                return (
                                                                    <div key={grp.id} className={`flex items-center justify-between p-3 rounded-lg border ${link ? 'bg-subtle border-brand/50' : 'border-subtle hover:bg-subtle/50'}`}>
                                                                        <div className="flex items-center gap-3">
                                                                            <input type="checkbox" checked={!!link} onChange={() => handleToggleLink('group', grp.id, grp.name)} className="rounded border-subtle bg-subtle text-brand" />
                                                                            <div>
                                                                                <p className="text-sm font-bold text-primary">{grp.name}</p>
                                                                                <p className="text-xs text-secondary">{grp.symbols.length} Assets</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <button onClick={(e) => { e.stopPropagation(); setEditingGroupId(grp.id); }} className="p-1.5 rounded hover:bg-card-hover text-secondary hover:text-primary" title="Edit Members">
                                                                                <Settings size={14} />
                                                                            </button>
                                                                            {link && <div className="flex items-center gap-1"><input type="number" value={link.percentage} onChange={(e) => updateLinkPercentage(grp.id, 'group', parseInt(e.target.value))} className="w-10 bg-subtle text-primary text-xs p-1 rounded border border-subtle text-center" /> <span className="text-xs text-secondary">%</span></div>}
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
                                            className="w-full bg-subtle border border-subtle rounded-lg p-3 text-primary placeholder-tertiary focus:border-brand outline-none"
                                        />
                                    </div>
                                )}

                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-subtle flex justify-end gap-3 bg-card rounded-b-2xl">
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
                                    <h2 className="text-xl font-bold text-primary">{selectedAchievement.title}</h2>
                                    <p className="text-secondary text-sm">Level {selectedAchievement.currentLevel}</p>
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