import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import { User, Lock, Upload, Globe, Moon, Bell, Sun, Laptop, Languages, RotateCcw, Calendar, Scale, Check, Palette } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserPreferences } from '../types';
import ImportBatchList from '../components/ImportBatchList';
import { useData } from '../context/DataContext';
import { exportBackupJSON, exportRGPDZip } from '../src/services/exportService';
import { BackupMergeWizard } from '../components/BackupMergeWizard';
import { Download, FileText, Database, Sparkles } from 'lucide-react';
import { FRENCH_DEPARTMENTS, getTaxZoneForDepartment } from '../src/services/fiscal/taxCalendarService';
import { SUPPORTED_CURRENCIES } from '../utils/currency';
import { AISettingsTab } from '../components/ai/AISettingsTab';
import { SecuritySettingsTab } from '../components/security/SecuritySettingsTab';
import { THEME_CATALOG, isThemeUnlocked, ThemeKey } from '../src/constants/themeCatalog';

const Settings: React.FC = () => {
    const { t } = useTranslation();
    const { user, updateProfile } = useAuth();
    const { resetToSeedData } = useData();
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'fiscal' | 'ai' | 'security'>('profile');
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [showBackupWizard, setShowBackupWizard] = useState(false);

    // Check URL params for active tab
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'preferences') setActiveTab('preferences');
        else if (tab === 'profile') setActiveTab('profile');
        else if (tab === 'fiscal') setActiveTab('fiscal');
        else if (tab === 'ai') setActiveTab('ai');
        else if (tab === 'security') setActiveTab('security');
    }, [searchParams]);

    // Profile Form State
    const [profileData, setProfileData] = useState({
        name: user?.name || '',
        email: user?.email || '',
    });

    // Preferences State
    const [prefData, setPrefData] = useState<UserPreferences>({
        currency: user?.preferences?.currency || 'USD',
        theme: user?.preferences?.theme || 'night',
        notifications: user?.preferences?.notifications ?? true,
        language: user?.preferences?.language || 'en',
        dateFormat: user?.preferences?.dateFormat || 'DD/MM/YYYY'
    });

    // Fiscal Profile State
    const [fiscalData, setFiscalData] = useState({
        familyStatus: user?.preferences?.fiscalProfile?.familyStatus || '',
        fiscalShares: user?.preferences?.fiscalProfile?.fiscalShares || 1,
        otherTaxableIncome: user?.preferences?.fiscalProfile?.otherTaxableIncome || 0,
        hasOpted2OP: user?.preferences?.fiscalProfile?.hasOpted2OP || false,
        taxResidenceCountries: user?.preferences?.fiscalProfile?.taxResidenceCountries || ['FR'],
        department: user?.preferences?.fiscalProfile?.department || '75',
        taxZone: user?.preferences?.fiscalProfile?.taxZone || 'zone_3',
    });

    // Password State
    const [passwords, setPasswords] = useState({
        current: '',
        new: '',
        confirm: ''
    });

    const [isSaving, setIsSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setProfileData(prev => ({ ...prev, [name]: value }));
    };

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setPasswords(prev => ({ ...prev, [name]: value }));
    };

    const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                updateProfile({ avatar: base64String });
            };
            reader.readAsDataURL(file);
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await updateProfile(profileData);
            setSuccessMsg(t('settings:profile.profileUpdated'));
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (error) {
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleChangePassword = (e: React.FormEvent) => {
        e.preventDefault();
        if (passwords.new !== passwords.confirm) {
            setSuccessMsg(t('common:errors.passwordsDoNotMatch'));
            setTimeout(() => setSuccessMsg(''), 3000);
            return;
        }
        setIsSaving(true);
        // Simulate API Call
        setTimeout(() => {
            setIsSaving(false);
            setSuccessMsg(t('settings:profile.passwordUpdated'));
            setPasswords({ current: '', new: '', confirm: '' });
            setTimeout(() => setSuccessMsg(''), 3000);
        }, 1000);
    };

    const updatePreference = async <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
        const newPrefs: UserPreferences = { ...prefData, [key]: value };
        setPrefData(newPrefs);
        await updateProfile({ preferences: newPrefs });
    };

    const saveFiscalProfile = async () => {
        setIsSaving(true);
        try {
            await updateProfile({
                preferences: {
                    ...prefData,
                    fiscalProfile: fiscalData,
                }
            });
            setSuccessMsg(t('tax:settings.saved'));
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    if (!user) return null;

    const cardStyle = "bg-card rounded-xl p-6 shadow-lg border border-border";

    return (
        <div className="max-w-5xl mx-auto pb-12">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-primary mb-2">{t('settings:title')}</h1>
                <p className="text-secondary">{t('settings:subtitle')}</p>
            </div>

            <div className="flex flex-col md:flex-row gap-6 lg:gap-8">
                {/* Sidebar Navigation */}
                <div className="w-full md:w-60 lg:w-64 shrink-0 space-y-2">
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${activeTab === 'profile' ? 'bg-primary text-white shadow-lg' : 'text-secondary hover:bg-card-hover'}`}
                    >
                        <User size={18} className="shrink-0" />
                        <span>{t('settings:tabs.profile')}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('preferences')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${activeTab === 'preferences' ? 'bg-primary text-white shadow-lg' : 'text-secondary hover:bg-card-hover'}`}
                    >
                        <Globe size={18} className="shrink-0" />
                        <span>{t('settings:tabs.preferences')}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('fiscal')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${activeTab === 'fiscal' ? 'bg-primary text-white shadow-lg' : 'text-secondary hover:bg-card-hover'}`}
                    >
                        <Scale size={18} className="shrink-0" />
                        <span>{t('tax:settings.title')}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('ai')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${activeTab === 'ai' ? 'bg-primary text-white shadow-lg' : 'text-secondary hover:bg-card-hover'}`}
                    >
                        <Sparkles size={18} className="shrink-0" />
                        <span>{t('ai:settings.tab')}</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('security')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${activeTab === 'security' ? 'bg-primary text-white shadow-lg' : 'text-secondary hover:bg-card-hover'}`}
                    >
                        <Lock size={18} className="shrink-0" />
                        <span>{t('settings:tabs.security')}</span>
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 min-w-0 space-y-6">

                    {/* ================= PROFILE TAB ================= */}
                    {activeTab === 'profile' && (
                        <div className="space-y-6 animate-fade-in">
                            <div className={cardStyle}>
                                <h2 className="text-xl font-semibold text-primary mb-6">{t('settings:profile.publicProfile')}</h2>

                                {/* Avatar Section */}
                                <div className="flex items-center gap-6 mb-8 pb-8 border-b border-border">
                                    <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-card bg-subtle shrink-0">
                                        {user.avatar ? (
                                            <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-tertiary">
                                                {user.name.charAt(0)}
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <h3 className="text-lg font-medium text-primary">{t('settings:profile.profilePicture')}</h3>
                                        <p className="text-sm text-tertiary mb-3">{t('settings:profile.profilePictureInfo')}</p>
                                        <div className="flex gap-3">
                                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                                            <Button size="sm" variant="secondary" onClick={triggerFileInput}>
                                                <Upload size={14} className="mr-2" />
                                                {t('common:buttons.upload')}
                                            </Button>
                                            <Button size="sm" variant="ghost" className="text-error hover:bg-error/10" onClick={() => updateProfile({ avatar: '' })}>
                                                {t('common:buttons.remove')}
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {/* Basic Info Form */}
                                <form onSubmit={handleSaveProfile} className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-xs font-medium text-secondary mb-1.5">{t('settings:profile.displayName')}</label>
                                            <input
                                                type="text"
                                                name="name"
                                                value={profileData.name}
                                                onChange={handleProfileChange}
                                                className="w-full bg-subtle border border-border text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-secondary mb-1.5">{t('settings:profile.emailAddress')}</label>
                                            <input
                                                type="email"
                                                name="email"
                                                value={profileData.email}
                                                onChange={handleProfileChange}
                                                className="w-full bg-subtle border border-border text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-end">
                                        <Button type="submit" isLoading={isSaving} className="bg-primary text-white hover:bg-primary/90">{t('common:buttons.saveProfile')}</Button>
                                    </div>
                                </form>
                            </div>

                            {/* Change Password Section (Moved here) */}
                            <div className={cardStyle}>
                                <h2 className="text-xl font-semibold text-primary mb-6 flex items-center gap-2">
                                    <Lock size={20} className="text-tertiary" />
                                    {t('settings:profile.changePassword')}
                                </h2>
                                <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                                    <div>
                                        <label className="block text-xs font-medium text-secondary mb-1.5">{t('settings:profile.currentPassword')}</label>
                                        <input
                                            type="password"
                                            name="current"
                                            value={passwords.current}
                                            onChange={handlePasswordChange}
                                            className="w-full bg-subtle border border-border text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-secondary mb-1.5">{t('settings:profile.newPassword')}</label>
                                        <input
                                            type="password"
                                            name="new"
                                            value={passwords.new}
                                            onChange={handlePasswordChange}
                                            className="w-full bg-subtle border border-border text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-secondary mb-1.5">{t('settings:profile.confirmNewPassword')}</label>
                                        <input
                                            type="password"
                                            name="confirm"
                                            value={passwords.confirm}
                                            onChange={handlePasswordChange}
                                            className="w-full bg-subtle border border-border text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5"
                                        />
                                    </div>
                                    <div className="pt-2 flex justify-between items-center">
                                        <span className="text-accent-green text-sm font-medium">{successMsg}</span>
                                        <Button type="submit" variant="secondary">{t('common:buttons.updatePassword')}</Button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* ================= PREFERENCES TAB ================= */}
                    {activeTab === 'preferences' && (
                        <div className="space-y-6 animate-fade-in">
                            {/* App Settings */}
                            <div className={cardStyle}>
                                <h2 className="text-xl font-semibold text-primary mb-6">{t('settings:preferences.applicationSettings')}</h2>
                                <div className="space-y-8">
                                    {/* Currency */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-subtle rounded-lg text-secondary"><Globe size={20} /></div>
                                            <div>
                                                <p className="text-sm font-medium text-primary">{t('settings:preferences.baseCurrency')}</p>
                                                <p className="text-xs text-tertiary">{t('settings:preferences.baseCurrencyInfo')}</p>
                                            </div>
                                        </div>
                                        <select
                                            value={prefData.currency}
                                            onChange={(e) => updatePreference('currency', e.target.value)}
                                            className="bg-subtle border border-border text-primary text-sm rounded-lg p-2 min-w-[100px]"
                                        >
                                            {SUPPORTED_CURRENCIES.map(curr => (
                                                <option key={curr.code} value={curr.code}>
                                                    {curr.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Language Selector */}
                                    <div className="flex items-center justify-between border-t border-border pt-6">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-subtle rounded-lg text-secondary"><Languages size={20} /></div>
                                            <div>
                                                <p className="text-sm font-medium text-primary">{t('settings:preferences.language')}</p>
                                                <p className="text-xs text-tertiary">{t('settings:preferences.languageInfo')}</p>
                                            </div>
                                        </div>
                                        <select
                                            value={prefData.language}
                                            onChange={(e) => updatePreference('language', e.target.value)}
                                            className="bg-subtle border border-border text-primary text-sm rounded-lg p-2 min-w-[120px]"
                                        >
                                            <option value="en">{t('settings:preferences.english')}</option>
                                            <option value="fr">{t('settings:preferences.french')}</option>
                                        </select>
                                    </div>

                                    {/* Date Format Selector */}
                                    <div className="flex items-center justify-between border-t border-border pt-6">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-subtle rounded-lg text-secondary"><Calendar size={20} /></div>
                                            <div>
                                                <p className="text-sm font-medium text-primary">{t('settings:preferences.dateFormat')}</p>
                                                <p className="text-xs text-tertiary">{t('settings:preferences.dateFormatInfo')}</p>
                                            </div>
                                        </div>
                                        <select
                                            value={prefData.dateFormat || 'DD/MM/YYYY'}
                                            onChange={(e) => updatePreference('dateFormat', e.target.value as any)}
                                            className="bg-subtle border border-border text-primary text-sm rounded-lg p-2 min-w-[160px]"
                                        >
                                            <option value="DD/MM/YYYY">{t('settings:preferences.dateFormatFR')}</option>
                                            <option value="MM/DD/YYYY">{t('settings:preferences.dateFormatUS')}</option>
                                            <option value="YYYY-MM-DD">{t('settings:preferences.dateFormatISO')}</option>
                                        </select>
                                    </div>

                                    {/* Appearance & Themes Section */}
                                    <div className="border-t border-border pt-6 space-y-5">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-subtle rounded-lg text-secondary"><Palette size={20} /></div>
                                            <div>
                                                <p className="text-sm font-medium text-primary">{t('settings:preferences.appearance')}</p>
                                                <p className="text-xs text-tertiary">{t('settings:preferences.appearanceInfo')}</p>
                                            </div>
                                        </div>

                                        {/* 1. Automatic Mode Card */}
                                        <div className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${prefData.theme === 'system' ? 'border-primary bg-primary/5 shadow-sm' : 'border-subtle bg-subtle/40'}`}>
                                            <div className="flex items-start gap-3.5">
                                                <div className="p-2.5 rounded-xl bg-card border border-subtle text-primary shrink-0 mt-0.5">
                                                    <Laptop size={18} />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="text-sm font-semibold text-primary">{t('settings:preferences.autoThemeTitle')}</h3>
                                                        {prefData.theme === 'system' && (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand/15 text-brand border border-brand/30">
                                                                {t('gamification:themes.active')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-secondary mt-0.5 max-w-md">
                                                        {t('settings:preferences.autoThemeDesc')}
                                                    </p>
                                                </div>
                                            </div>

                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={prefData.theme === 'system' ? 'primary' : 'secondary'}
                                                onClick={() => updatePreference('theme', 'system')}
                                                className="shrink-0 text-xs font-semibold"
                                            >
                                                {prefData.theme === 'system' ? t('gamification:themes.active') : t('gamification:themes.apply')}
                                            </Button>
                                        </div>

                                        {/* 2. Color Themes Grid */}
                                        <div className="space-y-3 pt-2">
                                            <div>
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-secondary">
                                                    {t('settings:preferences.colorThemesTitle')}
                                                </h3>
                                                <p className="text-[11px] text-tertiary mt-0.5">
                                                    {t('settings:preferences.colorThemesDesc')}
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                {THEME_CATALOG.map((themeItem) => {
                                                    const isUnlocked = isThemeUnlocked(themeItem.key, user?.level || 1) || prefData.theme === themeItem.key;
                                                    const isSelected = prefData.theme === themeItem.key;

                                                    return (
                                                        <button
                                                            key={themeItem.id}
                                                            type="button"
                                                            disabled={!isUnlocked}
                                                            onClick={() => isUnlocked && updatePreference('theme', themeItem.key)}
                                                            title={!isUnlocked ? t('settings:preferences.lockedThemeTooltip', { level: themeItem.requiredLevel }) : undefined}
                                                            className={`p-3.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-all ${
                                                                isSelected
                                                                    ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40'
                                                                    : isUnlocked
                                                                        ? 'border-subtle bg-card hover:bg-card-hover hover:border-strong cursor-pointer'
                                                                        : 'border-subtle/50 bg-subtle/30 opacity-60 cursor-not-allowed'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                {/* Dynamic Mini Color Dot applying exact theme variables */}
                                                                <div
                                                                    data-theme={themeItem.key}
                                                                    className="w-7 h-7 rounded-full bg-canvas border border-subtle flex items-center justify-center shrink-0 shadow-sm"
                                                                >
                                                                    <div className="w-3 h-3 rounded-full bg-brand" />
                                                                </div>

                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-semibold text-primary truncate">
                                                                        {t(themeItem.nameKey, { defaultValue: themeItem.key })}
                                                                    </p>
                                                                    {!isUnlocked ? (
                                                                        <span className="text-[10px] text-tertiary inline-flex items-center gap-1 mt-0.5">
                                                                            <Lock size={10} className="shrink-0" />
                                                                            {t('settings:preferences.requiredLevelBadge', { level: themeItem.requiredLevel })}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-[10px] text-secondary">
                                                                            {themeItem.requiredLevel <= 1 ? t('gamification:unlocked') : t('gamification:level') + ` ${themeItem.requiredLevel}+`}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="shrink-0">
                                                                {isSelected ? (
                                                                    <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center shadow-sm">
                                                                        <Check size={12} strokeWidth={3} />
                                                                    </div>
                                                                ) : !isUnlocked ? (
                                                                    <div className="p-1 rounded-full bg-subtle text-tertiary">
                                                                        <Lock size={12} />
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Notifications */}
                                    <div className="flex items-center justify-between border-t border-border pt-6">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-subtle rounded-lg text-secondary"><Bell size={20} /></div>
                                            <div>
                                                <p className="text-sm font-medium text-primary">{t('settings:preferences.notifications')}</p>
                                                <p className="text-xs text-tertiary">{t('settings:preferences.notificationsInfo')}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => updatePreference('notifications', !prefData.notifications)}
                                            className={`w-12 h-6 rounded-full transition-colors relative ${prefData.notifications ? 'bg-primary' : 'bg-black/20 dark:bg-white/20'}`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${prefData.notifications ? 'left-7' : 'left-1'}`}></div>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* ── Fiscal Profile Card ── */}
                            <div className={cardStyle}>
                                <div className="flex items-center gap-2 mb-2">
                                    <Scale size={20} className="text-brand" />
                                    <h2 className="text-xl font-semibold text-primary">{t('tax:settings.title')}</h2>
                                </div>
                                <p className="text-xs text-tertiary mb-6">{t('tax:settings.subtitle')}</p>

                                <div className="space-y-5">
                                    {/* Required fields banner */}
                                    <div className="text-xs font-semibold text-brand uppercase tracking-wide">{t('tax:settings.requiredFields')}</div>

                                    {/* Family Status */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-primary">{t('tax:settings.familyStatus')}</p>
                                            <p className="text-xs text-tertiary">{t('tax:settings.familyStatusInfo')}</p>
                                        </div>
                                        <select
                                            value={fiscalData.familyStatus}
                                            onChange={e => setFiscalData(prev => ({ ...prev, familyStatus: e.target.value as any }))}
                                            className="bg-subtle border border-subtle text-primary text-sm rounded-lg p-2 min-w-[180px] focus:ring-primary focus:border-primary"
                                        >
                                            <option value="">—</option>
                                            {(['single', 'married', 'pacs', 'divorced', 'widowed'] as const).map(s => (
                                                <option key={s} value={s}>{t(`tax:settings.familyStatusOptions.${s}`)}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Fiscal Shares */}
                                    <div className="flex items-center justify-between border-t border-border pt-5">
                                        <div>
                                            <p className="text-sm font-medium text-primary">{t('tax:settings.fiscalShares')}</p>
                                            <p className="text-xs text-tertiary">{t('tax:settings.fiscalSharesInfo')}</p>
                                        </div>
                                        <select
                                            value={fiscalData.fiscalShares}
                                            onChange={e => setFiscalData(prev => ({ ...prev, fiscalShares: parseFloat(e.target.value) }))}
                                            className="bg-subtle border border-subtle text-primary text-sm rounded-lg p-2 min-w-[80px] focus:ring-primary focus:border-primary"
                                        >
                                            {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(n => (
                                                <option key={n} value={n}>{n}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Optional fields separator */}
                                    <div className="border-t border-border pt-5">
                                        <div className="text-xs font-semibold text-secondary uppercase tracking-wide mb-4">{t('tax:settings.optionalFields')}</div>
                                    </div>

                                    {/* Other Taxable Income */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-primary">{t('tax:settings.otherIncome')}</p>
                                            <p className="text-xs text-tertiary">{t('tax:settings.otherIncomeInfo')}</p>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min={0}
                                                step={1000}
                                                value={fiscalData.otherTaxableIncome}
                                                onChange={e => setFiscalData(prev => ({ ...prev, otherTaxableIncome: parseFloat(e.target.value) || 0 }))}
                                                className="bg-subtle border border-subtle text-primary text-sm rounded-lg p-2 pr-8 w-36 focus:ring-primary focus:border-primary text-right"
                                            />
                                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary text-sm">€</span>
                                        </div>
                                    </div>

                                    {/* 2OP Option */}
                                    <div className="flex items-center justify-between border-t border-border pt-5">
                                        <div>
                                            <p className="text-sm font-medium text-primary">{t('tax:settings.hasOpted2OP')}</p>
                                            <p className="text-xs text-tertiary">{t('tax:settings.hasOpted2OPInfo')}</p>
                                        </div>
                                        <button
                                            onClick={() => setFiscalData(prev => ({ ...prev, hasOpted2OP: !prev.hasOpted2OP }))}
                                            className={`w-12 h-6 rounded-full transition-colors relative ${fiscalData.hasOpted2OP ? 'bg-brand' : 'bg-black/20 dark:bg-white/20'}`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${fiscalData.hasOpted2OP ? 'left-7' : 'left-1'}`} />
                                        </button>
                                    </div>

                                    {/* French Department & Zone Selector */}
                                    <div className="border-t border-border pt-5">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-medium text-primary mb-0.5">{t('tax:settings.department')}</p>
                                                <p className="text-xs text-tertiary">{t('tax:settings.departmentInfo')}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={fiscalData.department}
                                                    onChange={e => {
                                                        const dept = e.target.value;
                                                        const zone = getTaxZoneForDepartment(dept);
                                                        setFiscalData(prev => ({ ...prev, department: dept, taxZone: zone }));
                                                    }}
                                                    className="bg-subtle border border-border text-primary text-sm rounded-lg p-2 min-w-[200px]"
                                                >
                                                    {FRENCH_DEPARTMENTS.map(d => (
                                                        <option key={d.code} value={d.code}>
                                                            {d.code} - {d.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <span className="px-2.5 py-1 rounded-lg bg-brand/10 text-brand text-xs font-bold uppercase shrink-0">
                                                    {fiscalData.taxZone?.replace('_', ' ') || 'ZONE 3'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tax Residence Countries */}
                                    <div className="border-t border-border pt-5">
                                        <p className="text-sm font-medium text-primary mb-1">{t('tax:settings.taxResidence')}</p>
                                        <p className="text-xs text-tertiary mb-3">{t('tax:settings.taxResidenceInfo')}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {fiscalData.taxResidenceCountries.map(c => (
                                                <span key={c} className="px-3 py-1 rounded-full bg-brand/10 text-brand text-xs font-semibold">{t(`tax:common.country.${c}`, { defaultValue: c })}</span>
                                            ))}
                                        </div>
                                        <p className="text-xs text-tertiary mt-2 italic">Multi-country support coming soon.</p>
                                    </div>

                                    {/* Save */}
                                    <div className="flex justify-between items-center border-t border-border pt-5">
                                        <span className="text-success text-sm font-medium">{successMsg}</span>
                                        <Button onClick={saveFiscalProfile} isLoading={isSaving}>{t('common:buttons.save')}</Button>
                                    </div>
                                </div>
                            </div>
                            <div className={cardStyle}>
                                <h2 className="text-xl font-semibold text-primary mb-2 flex items-center gap-2">
                                    <Database size={20} className="text-primary" />
                                    {t('settings:dataAndBackup.title')}
                                </h2>
                                <p className="text-xs text-tertiary mb-6">
                                    {t('settings:dataAndBackup.subtitle')}
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <button
                                        onClick={exportBackupJSON}
                                        className="p-4 rounded-xl border border-border bg-subtle hover:bg-card-hover text-left flex flex-col justify-between gap-3 transition-all group"
                                    >
                                        <div className="p-2 rounded-lg bg-primary/10 text-primary w-fit group-hover:scale-110 transition-transform">
                                            <Download size={20} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-primary">{t('settings:dataAndBackup.exportBackup')}</p>
                                            <p className="text-xs text-tertiary mt-0.5">{t('settings:dataAndBackup.exportBackupInfo')}</p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={exportRGPDZip}
                                        className="p-4 rounded-xl border border-border bg-subtle hover:bg-card-hover text-left flex flex-col justify-between gap-3 transition-all group"
                                    >
                                        <div className="p-2 rounded-lg bg-positive-subtle text-positive w-fit group-hover:scale-110 transition-transform">
                                            <FileText size={20} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-primary">{t('settings:dataAndBackup.exportGdpr')}</p>
                                            <p className="text-xs text-tertiary mt-0.5">{t('settings:dataAndBackup.exportGdprInfo')}</p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => setShowBackupWizard(true)}
                                        className="p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 text-left flex flex-col justify-between gap-3 transition-all group"
                                    >
                                        <div className="p-2 rounded-lg bg-primary text-white w-fit group-hover:scale-110 transition-transform">
                                            <Database size={20} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-primary">{t('settings:dataAndBackup.restoreBackup')}</p>
                                            <p className="text-xs text-tertiary mt-0.5">{t('settings:dataAndBackup.restoreBackupInfo')}</p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Import History & Rollback Section */}
                            <div className={cardStyle}>
                                <ImportBatchList compact limit={5} showTitle />
                            </div>

                            {/* Reset Demo Data */}
                            <div className="p-4 rounded-xl border border-negative/30 bg-negative-subtle">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-negative-subtle text-negative">
                                            <RotateCcw size={18} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-primary">{t('settings:dataAndBackup.resetDemoTitle')}</p>
                                            <p className="text-xs text-tertiary mt-0.5">{t('settings:dataAndBackup.resetDemoInfo')}</p>
                                        </div>
                                    </div>
                                    {!showResetConfirm ? (
                                        <Button variant="danger" size="sm" onClick={() => setShowResetConfirm(true)}>
                                            {t('settings:dataAndBackup.reset')}
                                        </Button>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-negative font-medium">{t('settings:dataAndBackup.confirmReset')}</span>
                                            <Button variant="ghost" size="sm" onClick={() => setShowResetConfirm(false)}>{t('settings:dataAndBackup.cancel')}</Button>
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                isLoading={isResetting}
                                                onClick={async () => {
                                                    setIsResetting(true);
                                                    await resetToSeedData();
                                                    setIsResetting(false);
                                                    setShowResetConfirm(false);
                                                }}
                                            >
                                                {t('settings:dataAndBackup.yesReset')}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ================= FISCAL TAB ================= */}
                    {activeTab === 'fiscal' && (
                        <div className="animate-fade-in">
                            <div className={cardStyle}>
                                <div className="flex items-center gap-2 mb-2">
                                    <Scale size={20} className="text-brand" />
                                    <h2 className="text-xl font-semibold text-primary">{t('tax:settings.title')}</h2>
                                </div>
                                <p className="text-xs text-tertiary mb-6">{t('tax:settings.subtitle')}</p>
                                <div className="space-y-5">
                                    <div className="text-xs font-semibold text-brand uppercase tracking-wide">{t('tax:settings.requiredFields')}</div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-primary">{t('tax:settings.familyStatus')}</p>
                                            <p className="text-xs text-tertiary">{t('tax:settings.familyStatusInfo')}</p>
                                        </div>
                                        <select
                                            value={fiscalData.familyStatus}
                                            onChange={e => setFiscalData(prev => ({ ...prev, familyStatus: e.target.value as any }))}
                                            className="bg-subtle border border-subtle text-primary text-sm rounded-lg p-2 min-w-[180px] focus:ring-primary focus:border-primary"
                                        >
                                            <option value="">—</option>
                                            {(['single', 'married', 'pacs', 'divorced', 'widowed'] as const).map(s => (
                                                <option key={s} value={s}>{t(`tax:settings.familyStatusOptions.${s}`)}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-border pt-5">
                                        <div>
                                            <p className="text-sm font-medium text-primary">{t('tax:settings.fiscalShares')}</p>
                                            <p className="text-xs text-tertiary">{t('tax:settings.fiscalSharesInfo')}</p>
                                        </div>
                                        <select
                                            value={fiscalData.fiscalShares}
                                            onChange={e => setFiscalData(prev => ({ ...prev, fiscalShares: parseFloat(e.target.value) }))}
                                            className="bg-subtle border border-subtle text-primary text-sm rounded-lg p-2 min-w-[80px] focus:ring-primary focus:border-primary"
                                        >
                                            {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(n => (
                                                <option key={n} value={n}>{n}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="border-t border-border pt-5">
                                        <div className="text-xs font-semibold text-secondary uppercase tracking-wide mb-4">{t('tax:settings.optionalFields')}</div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-primary">{t('tax:settings.otherIncome')}</p>
                                            <p className="text-xs text-tertiary">{t('tax:settings.otherIncomeInfo')}</p>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min={0}
                                                step={1000}
                                                value={fiscalData.otherTaxableIncome}
                                                onChange={e => setFiscalData(prev => ({ ...prev, otherTaxableIncome: parseFloat(e.target.value) || 0 }))}
                                                className="bg-subtle border border-subtle text-primary text-sm rounded-lg p-2 pr-8 w-36 focus:ring-primary focus:border-primary text-right"
                                            />
                                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary text-sm">€</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-border pt-5">
                                        <div>
                                            <p className="text-sm font-medium text-primary">{t('tax:settings.hasOpted2OP')}</p>
                                            <p className="text-xs text-tertiary">{t('tax:settings.hasOpted2OPInfo')}</p>
                                        </div>
                                        <button
                                            onClick={() => setFiscalData(prev => ({ ...prev, hasOpted2OP: !prev.hasOpted2OP }))}
                                            className={`w-12 h-6 rounded-full transition-colors relative ${fiscalData.hasOpted2OP ? 'bg-brand' : 'bg-black/20 dark:bg-white/20'}`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${fiscalData.hasOpted2OP ? 'left-7' : 'left-1'}`} />
                                        </button>
                                    </div>
                                    {/* French Department & Zone Selector */}
                                    <div className="border-t border-border pt-5">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-medium text-primary mb-0.5">{t('tax:settings.department')}</p>
                                                <p className="text-xs text-tertiary">{t('tax:settings.departmentInfo')}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={fiscalData.department}
                                                    onChange={e => {
                                                        const dept = e.target.value;
                                                        const zone = getTaxZoneForDepartment(dept);
                                                        setFiscalData(prev => ({ ...prev, department: dept, taxZone: zone }));
                                                    }}
                                                    className="bg-subtle border border-border text-primary text-sm rounded-lg p-2 min-w-[200px]"
                                                >
                                                    {FRENCH_DEPARTMENTS.map(d => (
                                                        <option key={d.code} value={d.code}>
                                                            {d.code} - {d.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <span className="px-2.5 py-1 rounded-lg bg-brand/10 text-brand text-xs font-bold uppercase shrink-0">
                                                    {fiscalData.taxZone?.replace('_', ' ') || 'ZONE 3'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border-t border-border pt-5">
                                        <p className="text-sm font-medium text-primary mb-1">{t('tax:settings.taxResidence')}</p>
                                        <p className="text-xs text-tertiary mb-3">{t('tax:settings.taxResidenceInfo')}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {fiscalData.taxResidenceCountries.map(c => (
                                                <span key={c} className="px-3 py-1 rounded-full bg-brand/10 text-brand text-xs font-semibold">{t(`tax:common.country.${c}`, { defaultValue: c })}</span>
                                            ))}
                                        </div>
                                        <p className="text-xs text-tertiary mt-2 italic">Multi-country support coming soon.</p>
                                    </div>
                                    <div className="flex justify-between items-center border-t border-border pt-5">
                                        <span className="text-success text-sm font-medium">{successMsg}</span>
                                        <Button onClick={saveFiscalProfile} isLoading={isSaving}>{t('common:buttons.save')}</Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ================= AI & MCP TAB ================= */}
                    {activeTab === 'ai' && (
                        <div className="space-y-6 animate-fade-in">
                            <AISettingsTab />
                        </div>
                    )}

                    {/* ================= SECURITY & ACCESS TAB ================= */}
                    {activeTab === 'security' && (
                        <SecuritySettingsTab />
                    )}
                </div>
            </div>

            {/* Backup Merge Wizard Modal */}
            <BackupMergeWizard
                isOpen={showBackupWizard}
                onClose={() => setShowBackupWizard(false)}
                onSuccess={(msg) => {
                    setSuccessMsg(msg);
                    setTimeout(() => setSuccessMsg(''), 4000);
                }}
            />
        </div>
    );
};

export default Settings;