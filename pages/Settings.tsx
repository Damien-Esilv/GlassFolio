import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import {
    User, Lock, Upload, Globe, Moon, Bell, Sun, Laptop, Languages, RotateCcw, Calendar, Scale, Check, Palette,
    TrendingUp, Trophy, ShieldAlert, SlidersHorizontal, ExternalLink, Download, FileText, Database, Sparkles,
    Info, AlertCircle, X, FileSpreadsheet, UserX, AlertTriangle
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserPreferences, NotificationCategoryPreferences } from '../types';
import ImportBatchList from '../components/ImportBatchList';
import { useData } from '../context/DataContext';
import { exportBackupJSON, exportRGPDZip, exportTransactionsCSV } from '../src/services/exportService';
import { BackupMergeWizard } from '../components/BackupMergeWizard';
import { FRENCH_DEPARTMENTS, getTaxZoneForDepartment } from '../src/services/fiscal/taxCalendarService';
import { SUPPORTED_CURRENCIES } from '../utils/currency';
import { AISettingsTab } from '../components/ai/AISettingsTab';
import { SecuritySettingsTab } from '../components/security/SecuritySettingsTab';
import { THEME_CATALOG, isThemeUnlocked, ThemeKey } from '../src/constants/themeCatalog';
import { authService } from '../src/services/security/authService';

const Settings: React.FC = () => {
    const { t } = useTranslation();
    const { user, updateProfile, deleteAccount } = useAuth();
    const { resetAccountDataToZero } = useData();
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'fiscal' | 'ai' | 'security'>('profile');
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [hasExportedBeforeReset, setHasExportedBeforeReset] = useState(false);
    const [isExportingForReset, setIsExportingForReset] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [showBackupWizard, setShowBackupWizard] = useState(false);

    // Delete Account (GDPR) Modal State
    const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    const handleDeleteAccount = async () => {
        setDeleteError('');
        setIsDeletingAccount(true);
        try {
            await deleteAccount({
                password: deletePassword,
                confirmationText: deleteConfirmText,
            });
            setShowDeleteAccountModal(false);
            window.location.assign('/login');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('settings:dataAndBackup.invalidPasswordOrConfirm');
            setDeleteError(msg);
        } finally {
            setIsDeletingAccount(false);
        }
    };

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

    const [isSaving, setIsSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [showEmailChangeModal, setShowEmailChangeModal] = useState(false);
    const [emailChangePassword, setEmailChangePassword] = useState('');
    const [emailChangeError, setEmailChangeError] = useState('');
    const [isChangingEmail, setIsChangingEmail] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setProfileData(prev => ({ ...prev, [name]: value }));
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

    const handleConfirmEmailChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setEmailChangeError('');
        setIsChangingEmail(true);
        try {
            if (authService.changeEmail) {
                await authService.changeEmail(emailChangePassword, profileData.email);
            }
            setShowEmailChangeModal(false);
            setEmailChangePassword('');
            // Save remaining profile data (like name)
            await updateProfile({ name: profileData.name });
            setSuccessMsg(t('settings:profile.emailChangeDispatched', 'Confirmation emails sent to verify email change.'));
            setTimeout(() => setSuccessMsg(''), 5000);
        } catch (err: unknown) {
            setEmailChangeError(err instanceof Error ? err.message : t('common:error'));
        } finally {
            setIsChangingEmail(false);
        }
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (profileData.email !== user?.email) {
            if (user?.authProvider === 'google') {
                setProfileData(prev => ({ ...prev, email: user?.email || '' }));
                return;
            }
            setShowEmailChangeModal(true);
            return;
        }

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

    const updatePreference = async <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
        const newPrefs: UserPreferences = { ...prefData, [key]: value };
        setPrefData(newPrefs);
        await updateProfile({ preferences: newPrefs });
    };

    const notifPrefs = prefData.notificationPreferences || {
        masterEnabled: prefData.notifications ?? true,
        inAppToasts: true,
        categories: {
            portfolio: true,
            fiscal: true,
            goals: true,
            security: true,
            system: true,
        },
        dormantCashThresholdPercent: 25,
        volatilityThresholdPercent: 15,
    };

    const handleToggleMasterNotifications = async () => {
        const nextMaster = !prefData.notifications;
        const updatedNotif: NotificationCategoryPreferences = {
            ...notifPrefs,
            masterEnabled: nextMaster,
        };
        const newPrefs: UserPreferences = {
            ...prefData,
            notifications: nextMaster,
            notificationPreferences: updatedNotif,
        };
        setPrefData(newPrefs);
        await updateProfile({ preferences: newPrefs });
    };

    const handleToggleToasts = async () => {
        const updatedNotif: NotificationCategoryPreferences = {
            ...notifPrefs,
            inAppToasts: !notifPrefs.inAppToasts,
        };
        const newPrefs: UserPreferences = {
            ...prefData,
            notificationPreferences: updatedNotif,
        };
        setPrefData(newPrefs);
        await updateProfile({ preferences: newPrefs });
    };

    const handleToggleCategory = async (cat: 'portfolio' | 'fiscal' | 'goals' | 'security') => {
        const updatedNotif: NotificationCategoryPreferences = {
            ...notifPrefs,
            categories: {
                ...notifPrefs.categories,
                [cat]: !notifPrefs.categories[cat],
            },
        };
        const newPrefs: UserPreferences = {
            ...prefData,
            notificationPreferences: updatedNotif,
        };
        setPrefData(newPrefs);
        await updateProfile({ preferences: newPrefs });
    };

    const handleDormantCashChange = async (val: number) => {
        const updatedNotif: NotificationCategoryPreferences = {
            ...notifPrefs,
            dormantCashThresholdPercent: val,
        };
        const newPrefs: UserPreferences = {
            ...prefData,
            notificationPreferences: updatedNotif,
        };
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
                                            <div className="flex items-center justify-between mb-1.5">
                                                <label className="block text-xs font-medium text-secondary">{t('settings:profile.emailAddress')}</label>
                                                {user?.authProvider === 'google' && (
                                                    <span className="text-[10px] text-subtle flex items-center gap-1 font-medium bg-subtle px-2 py-0.5 rounded border border-subtle">
                                                        <Lock size={10} className="text-brand" />
                                                        {t('settings:profile.managedByGoogle', 'Managed by Google')}
                                                    </span>
                                                )}
                                            </div>
                                            <input
                                                type="email"
                                                name="email"
                                                value={profileData.email}
                                                disabled={user?.authProvider === 'google'}
                                                onChange={handleProfileChange}
                                                className={`w-full bg-subtle border border-border text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5 ${user?.authProvider === 'google' ? 'opacity-60 cursor-not-allowed' : ''}`}
                                            />
                                            {user?.pendingEmail && (
                                                <p className="text-xs text-warning mt-1.5 flex items-center gap-1">
                                                    <Info size={12} />
                                                    {t('settings:profile.pendingEmailConfirmation', { email: user.pendingEmail, defaultValue: `Pending confirmation on ${user.pendingEmail}` })}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex justify-end">
                                        <Button type="submit" isLoading={isSaving} className="bg-primary text-white hover:bg-primary/90">{t('common:buttons.saveProfile')}</Button>
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

                                    {/* Granular Notifications Section */}
                                    <div className="border-t border-border pt-6 space-y-5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-subtle rounded-lg text-secondary"><Bell size={20} /></div>
                                                <div>
                                                    <p className="text-sm font-medium text-primary">{t('notifications:settings.master')}</p>
                                                    <p className="text-xs text-tertiary">{t('notifications:settings.masterDesc')}</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleToggleMasterNotifications}
                                                className={`w-12 h-6 rounded-full transition-colors relative ${prefData.notifications ? 'bg-primary' : 'bg-subtle border border-subtle'}`}
                                                aria-label={t('notifications:settings.master')}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${prefData.notifications ? 'left-7' : 'left-1'}`} />
                                            </button>
                                        </div>

                                        {prefData.notifications && (
                                            <div className="space-y-5 pl-2 sm:pl-4 border-l-2 border-primary/20 animate-in fade-in slide-in-from-top-1">
                                                {/* Live Toasts Toggle */}
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm font-medium text-primary">{t('notifications:settings.toasts')}</p>
                                                        <p className="text-xs text-tertiary">{t('notifications:settings.toastsDesc')}</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={handleToggleToasts}
                                                        className={`w-10 h-5 rounded-full transition-colors relative ${notifPrefs.inAppToasts ? 'bg-primary' : 'bg-subtle border border-subtle'}`}
                                                        aria-label={t('notifications:settings.toasts')}
                                                    >
                                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${notifPrefs.inAppToasts ? 'left-5' : 'left-0.5'}`} />
                                                    </button>
                                                </div>

                                                {/* Category Toggles */}
                                                <div className="pt-1">
                                                    <p className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
                                                        {t('notifications:settings.categoriesTitle')}
                                                    </p>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        {/* Portfolio */}
                                                        <div className="flex items-center justify-between p-3 rounded-xl bg-subtle border border-subtle">
                                                            <div className="flex items-center gap-2.5 mr-2">
                                                                <TrendingUp size={16} className="text-positive shrink-0" />
                                                                <div>
                                                                    <p className="text-xs font-medium text-primary">{t('notifications:settings.categoryPortfolio')}</p>
                                                                    <p className="text-[10px] text-tertiary line-clamp-1">{t('notifications:settings.categoryPortfolioDesc')}</p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleCategory('portfolio')}
                                                                className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${notifPrefs.categories.portfolio ? 'bg-primary' : 'bg-card border border-subtle'}`}
                                                                aria-label={t('notifications:settings.categoryPortfolio')}
                                                            >
                                                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${notifPrefs.categories.portfolio ? 'left-4' : 'left-0.5'}`} />
                                                            </button>
                                                        </div>

                                                        {/* Fiscal */}
                                                        <div className="flex items-center justify-between p-3 rounded-xl bg-subtle border border-subtle">
                                                            <div className="flex items-center gap-2.5 mr-2">
                                                                <Scale size={16} className="text-brand shrink-0" />
                                                                <div>
                                                                    <p className="text-xs font-medium text-primary">{t('notifications:settings.categoryFiscal')}</p>
                                                                    <p className="text-[10px] text-tertiary line-clamp-1">{t('notifications:settings.categoryFiscalDesc')}</p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleCategory('fiscal')}
                                                                className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${notifPrefs.categories.fiscal ? 'bg-primary' : 'bg-card border border-subtle'}`}
                                                                aria-label={t('notifications:settings.categoryFiscal')}
                                                            >
                                                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${notifPrefs.categories.fiscal ? 'left-4' : 'left-0.5'}`} />
                                                            </button>
                                                        </div>

                                                        {/* Goals */}
                                                        <div className="flex items-center justify-between p-3 rounded-xl bg-subtle border border-subtle">
                                                            <div className="flex items-center gap-2.5 mr-2">
                                                                <Trophy size={16} className="text-warning shrink-0" />
                                                                <div>
                                                                    <p className="text-xs font-medium text-primary">{t('notifications:settings.categoryGoals')}</p>
                                                                    <p className="text-[10px] text-tertiary line-clamp-1">{t('notifications:settings.categoryGoalsDesc')}</p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleCategory('goals')}
                                                                className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${notifPrefs.categories.goals ? 'bg-primary' : 'bg-card border border-subtle'}`}
                                                                aria-label={t('notifications:settings.categoryGoals')}
                                                            >
                                                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${notifPrefs.categories.goals ? 'left-4' : 'left-0.5'}`} />
                                                            </button>
                                                        </div>

                                                        {/* Security */}
                                                        <div className="flex items-center justify-between p-3 rounded-xl bg-subtle border border-subtle">
                                                            <div className="flex items-center gap-2.5 mr-2">
                                                                <ShieldAlert size={16} className="text-negative shrink-0" />
                                                                <div>
                                                                    <p className="text-xs font-medium text-primary">{t('notifications:settings.categorySecurity')}</p>
                                                                    <p className="text-[10px] text-tertiary line-clamp-1">{t('notifications:settings.categorySecurityDesc')}</p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleCategory('security')}
                                                                className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${notifPrefs.categories.security ? 'bg-primary' : 'bg-card border border-subtle'}`}
                                                                aria-label={t('notifications:settings.categorySecurity')}
                                                            >
                                                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${notifPrefs.categories.security ? 'left-4' : 'left-0.5'}`} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Dormant Cash Slider */}
                                                <div className="pt-3 border-t border-border">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div>
                                                            <p className="text-sm font-medium text-primary">{t('notifications:settings.dormantCashTitle')}</p>
                                                            <p className="text-xs text-tertiary">{t('notifications:settings.dormantCashDesc')}</p>
                                                        </div>
                                                        <span className="text-sm font-bold text-primary px-2.5 py-1 rounded-md bg-subtle border border-subtle">
                                                            {notifPrefs.dormantCashThresholdPercent}%
                                                        </span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min={5}
                                                        max={50}
                                                        step={5}
                                                        value={notifPrefs.dormantCashThresholdPercent}
                                                        onChange={(e) => handleDormantCashChange(parseInt(e.target.value, 10))}
                                                        className="w-full accent-primary bg-subtle h-2 rounded-lg cursor-pointer"
                                                    />
                                                    <div className="flex justify-between text-[10px] text-tertiary mt-1">
                                                        <span>5%</span>
                                                        <span>25%</span>
                                                        <span>50%</span>
                                                    </div>
                                                </div>

                                                {/* Link to Rules */}
                                                <div className="pt-2">
                                                    <Link
                                                        to="/notifications?tab=rules"
                                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline transition-colors"
                                                    >
                                                        <SlidersHorizontal size={14} />
                                                        <span>{t('notifications:settings.manageRules')}</span>
                                                        <ExternalLink size={12} />
                                                    </Link>
                                                </div>
                                            </div>
                                        )}
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

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <button
                                        onClick={exportTransactionsCSV}
                                        className="p-4 rounded-xl border border-border bg-subtle hover:bg-card-hover text-left flex flex-col justify-between gap-3 transition-all group"
                                    >
                                        <div className="p-2 rounded-lg bg-primary/10 text-primary w-fit group-hover:scale-110 transition-transform">
                                            <FileSpreadsheet size={20} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-primary">{t('settings:dataAndBackup.exportTransactions')}</p>
                                            <p className="text-xs text-tertiary mt-0.5">{t('settings:dataAndBackup.exportTransactionsInfo')}</p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={exportBackupJSON}
                                        className="p-4 rounded-xl border border-border bg-subtle hover:bg-card-hover text-left flex flex-col justify-between gap-3 transition-all group"
                                    >
                                        <div className="p-2 rounded-lg bg-brand/10 text-brand w-fit group-hover:scale-110 transition-transform">
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

                            {/* Reset Account Data */}
                            <div className="p-4 rounded-xl border border-negative/30 bg-negative-subtle">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 rounded-lg bg-negative-subtle text-negative shrink-0 mt-0.5">
                                            <RotateCcw size={18} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-primary">{t('settings:dataAndBackup.resetDemoTitle')}</p>
                                            <p className="text-xs text-tertiary mt-0.5 leading-relaxed">{t('settings:dataAndBackup.resetDemoInfo')}</p>
                                        </div>
                                    </div>
                                    {!showResetConfirm ? (
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            onClick={() => {
                                                setHasExportedBeforeReset(false);
                                                setShowResetConfirm(true);
                                            }}
                                            className="shrink-0 whitespace-nowrap"
                                        >
                                            {t('settings:dataAndBackup.reset')}
                                        </Button>
                                    ) : (
                                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                isLoading={isExportingForReset}
                                                onClick={async () => {
                                                    setIsExportingForReset(true);
                                                    try {
                                                        await exportBackupJSON();
                                                        await exportRGPDZip();
                                                        setHasExportedBeforeReset(true);
                                                    } finally {
                                                        setIsExportingForReset(false);
                                                    }
                                                }}
                                            >
                                                <Download size={14} className="mr-1.5" />
                                                {hasExportedBeforeReset
                                                    ? t('settings:dataAndBackup.backupsExportedReady')
                                                    : t('settings:dataAndBackup.exportAndUnlockReset')}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    setShowResetConfirm(false);
                                                    setHasExportedBeforeReset(false);
                                                }}
                                            >
                                                {t('settings:dataAndBackup.cancel')}
                                            </Button>
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                disabled={!hasExportedBeforeReset || isResetting}
                                                isLoading={isResetting}
                                                onClick={async () => {
                                                    setIsResetting(true);
                                                    await resetAccountDataToZero();
                                                    setIsResetting(false);
                                                    setShowResetConfirm(false);
                                                    setHasExportedBeforeReset(false);
                                                }}
                                            >
                                                {t('settings:dataAndBackup.yesReset')}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Delete Account (GDPR) */}
                            <div className="p-4 rounded-xl border border-negative/40 bg-negative-subtle">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 rounded-lg bg-negative-subtle text-negative shrink-0 mt-0.5">
                                            <UserX size={18} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-primary">{t('settings:dataAndBackup.deleteAccountTitle')}</p>
                                            <p className="text-xs text-tertiary mt-0.5 leading-relaxed">{t('settings:dataAndBackup.deleteAccountSubtitle')}</p>
                                        </div>
                                    </div>
                                    <Button variant="danger" size="sm" onClick={() => setShowDeleteAccountModal(true)} className="shrink-0 whitespace-nowrap">
                                        {t('settings:dataAndBackup.deleteAccountButton')}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Delete Account GDPR Confirmation Modal (Portal) */}
                    {showDeleteAccountModal && typeof document !== 'undefined' && createPortal(
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                            <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-5 animate-scale-up">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowDeleteAccountModal(false);
                                        setDeletePassword('');
                                        setDeleteConfirmText('');
                                        setDeleteError('');
                                    }}
                                    className="absolute top-4 right-4 p-1.5 text-tertiary hover:text-primary rounded-lg hover:bg-subtle transition-colors"
                                    aria-label={t('settings:dataAndBackup.cancel')}
                                >
                                    <X size={18} />
                                </button>

                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-negative-subtle text-negative flex items-center justify-center shrink-0">
                                        <AlertTriangle size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-semibold text-primary">
                                            {t('settings:dataAndBackup.deleteModalTitle')}
                                        </h3>
                                        <p className="text-xs text-negative font-medium mt-0.5">
                                            {t('settings:dataAndBackup.deleteModalWarning')}
                                        </p>
                                    </div>
                                </div>

                                <div className="p-3.5 bg-subtle border border-subtle rounded-xl space-y-2">
                                    <p className="text-xs text-secondary leading-relaxed">
                                        {t('settings:dataAndBackup.downloadBeforeDelete')}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={exportRGPDZip}
                                        className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline font-medium"
                                    >
                                        <Download size={14} />
                                        {t('settings:dataAndBackup.downloadGdprArchive')}
                                    </button>
                                </div>

                                {deleteError && (
                                    <div className="p-3 bg-error/10 border border-error/20 rounded-xl flex items-center gap-2 text-error text-xs">
                                        <AlertCircle size={16} className="shrink-0" />
                                        <span>{deleteError}</span>
                                    </div>
                                )}

                                <div className="space-y-3">
                                    {user?.authProvider === 'google' ? (
                                        <div>
                                            <label className="block text-xs font-medium text-primary mb-1">
                                                {t('settings:dataAndBackup.confirmGoogleLabel')}
                                            </label>
                                            <input
                                                type="text"
                                                value={deleteConfirmText}
                                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                                placeholder={t('settings:dataAndBackup.confirmGooglePlaceholder')}
                                                className="w-full px-3 py-2 text-sm bg-subtle text-primary border border-subtle rounded-xl focus:ring-1 focus:ring-negative focus:border-negative"
                                            />
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="block text-xs font-medium text-primary mb-1">
                                                {t('settings:dataAndBackup.confirmPasswordLabel')}
                                            </label>
                                            <input
                                                type="password"
                                                value={deletePassword}
                                                onChange={(e) => setDeletePassword(e.target.value)}
                                                placeholder={t('settings:dataAndBackup.confirmPasswordPlaceholder')}
                                                className="w-full px-3 py-2 text-sm bg-subtle text-primary border border-subtle rounded-xl focus:ring-1 focus:ring-negative focus:border-negative"
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-end gap-3 pt-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setShowDeleteAccountModal(false);
                                            setDeletePassword('');
                                            setDeleteConfirmText('');
                                            setDeleteError('');
                                        }}
                                    >
                                        {t('settings:dataAndBackup.cancel')}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="danger"
                                        size="sm"
                                        isLoading={isDeletingAccount}
                                        onClick={handleDeleteAccount}
                                    >
                                        {t('settings:dataAndBackup.confirmDeleteButton')}
                                    </Button>
                                </div>
                            </div>
                        </div>,
                        document.body
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

            {/* Secure Email Change Re-Authentication Modal */}
            {showEmailChangeModal && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
                    <div className="relative w-full max-w-md bg-card border border-subtle rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
                        <button
                            type="button"
                            onClick={() => {
                                setShowEmailChangeModal(false);
                                setProfileData(prev => ({ ...prev, email: user?.email || '' }));
                            }}
                            className="absolute top-4 right-4 p-2 text-tertiary hover:text-primary rounded-lg transition-colors"
                        >
                            <X size={18} />
                        </button>

                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-brand/15 border border-brand/30 text-brand flex items-center justify-center shrink-0">
                                <Lock size={24} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-primary">
                                    {t('settings:profile.confirmEmailChangeTitle', 'Confirm Email Change')}
                                </h2>
                                <p className="text-xs text-secondary mt-0.5">
                                    {t('settings:profile.confirmEmailChangeSubtitle', 'Enter your current master password to verify this security request.')}
                                </p>
                            </div>
                        </div>

                        {emailChangeError && (
                            <div className="p-3 bg-error/10 border border-error/20 rounded-xl flex items-center gap-2 text-error text-xs">
                                <AlertCircle size={16} className="shrink-0" />
                                <span>{emailChangeError}</span>
                            </div>
                        )}

                        <form onSubmit={handleConfirmEmailChange} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-secondary mb-1">
                                    {t('settings:profile.currentPassword', 'Current Master Password')}
                                </label>
                                <input
                                    type="password"
                                    required
                                    autoFocus
                                    value={emailChangePassword}
                                    onChange={(e) => setEmailChangePassword(e.target.value)}
                                    className="w-full bg-subtle border border-subtle text-primary text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5 placeholder-tertiary"
                                    placeholder="••••••••"
                                />
                            </div>

                            <p className="text-xs text-tertiary">
                                {t('settings:profile.emailConfirmationNotice', 'A confirmation email will be sent to both your current address and your new address.')}
                            </p>

                            <div className="flex gap-2 pt-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => {
                                        setShowEmailChangeModal(false);
                                        setProfileData(prev => ({ ...prev, email: user?.email || '' }));
                                    }}
                                    className="flex-1"
                                >
                                    {t('common:buttons.cancel')}
                                </Button>
                                <Button
                                    type="submit"
                                    isLoading={isChangingEmail}
                                    className="flex-1"
                                >
                                    {t('common:buttons.confirm')}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Settings;