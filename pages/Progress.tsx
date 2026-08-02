import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import Button from '../components/Button';
import { FinancialGoal, Achievement, LinkedAsset, AssetGroup } from '../types';
import { Home, Plane, Car, Shield, Wallet, PlusCircle, Pin, Trash2, Edit2, X, Zap, Link as LinkIcon, Target, Trophy, Lock, Medal, BarChart3, Star, CheckCircle, Settings, ChevronLeft, Plus, ArrowUpRight, Save } from 'lucide-react';
import GoalCard from '../components/GoalCard';
import AchievementBadge from '../components/AchievementBadge';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../utils/currency';
import { ANIMATION_DURATION_MS, ANIMATION_EASING, STAGGER_DELAY_MS } from '../src/constants/animations';

const ICON_MAP = { home: Home, plane: Plane, car: Car, emergency: Shield, other: Wallet };
const GOAL_COLOR_TOKENS: Record<string, string> = {
    blue: '#3b82f6',
    indigo: '#6366f1',
    emerald: '#10b981',
    orange: '#f97316',
    rose: '#f43f5e'
};

const Progress: React.FC = () => {
    const { t } = useTranslation();
    const { goals, positions, achievements, assetGroups, saveGoal, deleteGoal, toggleGoalPin, addAssetGroup, updateAssetGroup, deleteAssetGroup } = useData();
    const { user } = useAuth();
    const locale = user?.preferences?.language === 'fr' ? 'fr-FR' : 'en-US';
    const currency = user?.preferences?.currency || 'USD';
    const [activeTab, setActiveTab] = useState<'goals' | 'achievements'>('goals');
    const [searchParams, setSearchParams] = useSearchParams();
    const [animActive, setAnimActive] = useState(false);

    useEffect(() => {
        setAnimActive(false);
        const timer = setTimeout(() => setAnimActive(true), 50);
        return () => clearTimeout(timer);
    }, [activeTab]);

    // --- GOAL MODAL STATE ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingGoal, setEditingGoal] = useState<Partial<FinancialGoal> | null>(null);

    // Linker State
    const [linkTab, setLinkTab] = useState<'asset' | 'class' | 'group'>('asset');
    const [newGroupname, setNewGroupName] = useState('');
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

    // --- ACHIEVEMENT MODAL STATE ---
    const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);

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
    const sortedGoals = [...goals].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return 0;
    });

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
                <div className="space-y-6">
                    <div className="flex justify-end">
                        <Button onClick={handleAddNew} className="flex items-center gap-2 bg-brand text-white hover:bg-brand/90 shadow-lg shadow-brand/20">
                            <PlusCircle size={18} /> New Goal
                        </Button>
                    </div>
                    <div key={`goals-${activeTab}`} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {sortedGoals.map((goal, idx) => (
                            <div
                                key={goal.id}
                                className="animate-scale-up"
                                style={{
                                    animationDelay: `${idx * STAGGER_DELAY_MS}ms`
                                }}
                            >
                                <GoalCard
                                    goal={goal}
                                    onEdit={handleEdit}
                                    onDelete={deleteGoal}
                                    onPin={toggleGoalPin}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* --- ACHIEVEMENTS VIEW --- */}
            {activeTab === 'achievements' && (
                <div key={`achievements-${activeTab}`} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {achievements.map((ach, idx) => (
                        <div
                            key={ach.id}
                            className="animate-scale-up"
                            style={{
                                animationDelay: `${idx * STAGGER_DELAY_MS}ms`
                            }}
                        >
                            <AchievementBadge
                                achievement={ach}
                                onClick={() => setSelectedAchievement(ach)}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* --- GOAL MODAL (Styled like Screenshot) --- */}
            {isModalOpen && editingGoal && createPortal(
                <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setIsModalOpen(false)}>
                    <div className="w-full max-w-xl bg-card rounded-2xl shadow-2xl border border-subtle flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div className="p-6 border-b border-subtle flex justify-between items-center">
                            <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                                <Target size={18} className="text-brand" /> Set New Target
                            </h2>
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
                                                    type="button"
                                                    onClick={() => setEditingGoal({ ...editingGoal, iconType: key as any })}
                                                    className={`p-2.5 rounded-lg border transition-all ${isSelected ? 'bg-brand/10 border-brand text-brand' : 'border-subtle text-secondary hover:bg-subtle'}`}
                                                >
                                                    <Icon size={18} />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <p className="text-xs font-bold text-secondary mb-2 uppercase">COLOR</p>
                                    <div className="flex gap-2">
                                        {Object.keys(GOAL_COLOR_TOKENS).map((c) => {
                                            const isSelected = editingGoal.color === c;
                                            const hex = GOAL_COLOR_TOKENS[c];
                                            return (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onClick={() => setEditingGoal({ ...editingGoal, color: c })}
                                                    style={{ backgroundColor: hex }}
                                                    className={`w-8 h-8 rounded-lg transition-transform ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-card scale-110' : 'opacity-80 hover:opacity-100'}`}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Method Selector */}
                            <div className="border border-subtle rounded-xl p-4 space-y-4 bg-subtle/30">
                                <p className="text-xs font-bold text-secondary uppercase">TRACKING METHOD</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setEditingGoal({ ...editingGoal, method: 'dynamic' })}
                                        className={`p-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all ${editingGoal.method === 'dynamic' ? 'bg-card border-brand text-brand shadow-sm' : 'border-subtle text-secondary hover:bg-subtle'}`}
                                    >
                                        <Zap size={14} /> Auto-Track Assets
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditingGoal({ ...editingGoal, method: 'manual' })}
                                        className={`p-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all ${editingGoal.method === 'manual' ? 'bg-card border-brand text-brand shadow-sm' : 'border-subtle text-secondary hover:bg-subtle'}`}
                                    >
                                        <Target size={14} /> Fixed Manual Amount
                                    </button>
                                </div>

                                {editingGoal.method === 'dynamic' && (
                                    <div className="space-y-3 pt-2">
                                        <div className="flex border-b border-subtle">
                                            <button onClick={() => setLinkTab('asset')} className={`px-4 py-1.5 text-xs font-bold border-b-2 transition-all ${linkTab === 'asset' ? 'border-brand text-brand' : 'border-transparent text-secondary'}`}>ASSETS</button>
                                            <button onClick={() => setLinkTab('class')} className={`px-4 py-1.5 text-xs font-bold border-b-2 transition-all ${linkTab === 'class' ? 'border-brand text-brand' : 'border-transparent text-secondary'}`}>CLASSES</button>
                                            <button onClick={() => setLinkTab('group')} className={`px-4 py-1.5 text-xs font-bold border-b-2 transition-all ${linkTab === 'group' ? 'border-brand text-brand' : 'border-transparent text-secondary'}`}>GROUPS</button>
                                        </div>

                                        {editingGroupId ? (
                                            /* --- EDIT GROUP MEMBERS INLINE --- */
                                            <div className="p-3 bg-card rounded-lg border border-subtle space-y-3">
                                                <div className="flex justify-between items-center pb-2 border-b border-subtle">
                                                    <span className="text-xs font-bold text-primary">Edit Group Assets</span>
                                                    <button onClick={() => setEditingGroupId(null)} className="text-xs text-brand hover:underline font-bold">Done</button>
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
                                            <>
                                                {/* LIST OF ASSETS / CLASSES / GROUPS */}
                                                <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                                                    {linkTab === 'asset' && positions.map(pos => {
                                                        const link = editingGoal.linkedAssets?.find(l => l.id === pos.id && l.type === 'asset');
                                                        return (
                                                            <div key={pos.id} className={`flex items-center justify-between p-2.5 rounded-lg border ${link ? 'bg-subtle border-brand/50' : 'border-subtle hover:bg-subtle/50'}`}>
                                                                <div className="flex items-center gap-3">
                                                                    <input type="checkbox" checked={!!link} onChange={() => handleToggleLink('asset', pos.id, pos.symbol)} className="rounded border-subtle bg-subtle text-brand" />
                                                                    <div>
                                                                        <p className="text-xs font-bold text-primary">{pos.symbol}</p>
                                                                        <p className="text-[10px] text-secondary">{formatCurrency(pos.marketValue, currency, locale)}</p>
                                                                    </div>
                                                                </div>
                                                                {link && <div className="flex items-center gap-1"><input type="number" value={link.percentage} onChange={(e) => updateLinkPercentage(pos.id, 'asset', parseInt(e.target.value))} className="w-10 bg-subtle text-primary text-xs p-1 rounded border border-subtle text-center" /> <span className="text-xs text-secondary">%</span></div>}
                                                            </div>
                                                        )
                                                    })}

                                                    {linkTab === 'class' && Array.from(new Set(positions.map(p => p.type))).map(cls => {
                                                        const link = editingGoal.linkedAssets?.find(l => l.id === cls && l.type === 'class');
                                                        return (
                                                            <div key={cls} className={`flex items-center justify-between p-2.5 rounded-lg border ${link ? 'bg-subtle border-brand/50' : 'border-subtle hover:bg-subtle/50'}`}>
                                                                <div className="flex items-center gap-3">
                                                                    <input type="checkbox" checked={!!link} onChange={() => handleToggleLink('class', cls as string, cls as string)} className="rounded border-subtle bg-subtle text-brand" />
                                                                    <p className="text-xs font-bold text-primary">{cls}</p>
                                                                </div>
                                                                {link && <div className="flex items-center gap-1"><input type="number" value={link.percentage} onChange={(e) => updateLinkPercentage(cls as string, 'class', parseInt(e.target.value))} className="w-10 bg-subtle text-primary text-xs p-1 rounded border border-subtle text-center" /> <span className="text-xs text-secondary">%</span></div>}
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
                </div>,
                document.body
            )}

            {/* --- ACHIEVEMENT DETAIL MODAL --- */}
            {selectedAchievement && createPortal(
                <div
                    className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
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
                                    <h2 className="text-xl font-bold text-primary">{selectedAchievement.title}</h2>
                                    <p className="text-secondary text-sm">Level {selectedAchievement.currentLevel}</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 mb-6">
                            {selectedAchievement.levels?.map((lvl) => {
                                const isCompleted = selectedAchievement.currentLevel >= lvl.level;
                                const isCurrent = selectedAchievement.currentLevel + 1 === lvl.level;
                                return (
                                    <div key={lvl.level} className={`p-4 rounded-xl border flex justify-between items-center ${isCompleted ? 'bg-emerald-500/10 border-emerald-500/30' : isCurrent ? 'bg-brand/10 border-brand/50' : 'bg-subtle border-subtle'}`}>
                                        <div>
                                            <p className={`text-sm font-bold ${isCompleted ? 'text-emerald-500' : isCurrent ? 'text-brand' : 'text-secondary'}`}>Level {lvl.level}</p>
                                            <p className={`${isCompleted || isCurrent ? 'text-secondary' : 'text-tertiary'} text-sm`}>{lvl.description}</p>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-xs font-bold text-secondary">+{lvl.xpReward} XP</span>
                                            {isCompleted && <CheckCircle size={16} className="text-emerald-500 mt-1" />}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <Button onClick={handleCloseAchievementModal} className="w-full" variant="secondary">Close</Button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Progress;