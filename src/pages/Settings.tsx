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
import { canExportAccountData, exportBackupJSON, exportRGPDZip, exportTransactionsCSV } from '../services/exportService';
import { BackupMergeWizard } from '../components/BackupMergeWizard';
import { FRENCH_DEPARTMENTS, getTaxZoneForDepartment } from '../services/fiscal/taxCalendarService';
import { SUPPORTED_CURRENCIES } from '../utils/currency';
import { AISettingsTab } from '../components/ai/AISettingsTab';
import { SecuritySettingsTab } from '../components/security/SecuritySettingsTab';
import { UserAvatar } from '../components/ui/UserAvatar';
import { openConsentPreferences } from '../services/consentService';
import { LEGAL_CONTACT_EMAIL, LEGAL_DOCUMENTS_VERSION } from '../config/legal';
import { THEME_CATALOG, isThemeUnlocked, ThemeKey } from '../constants/themeCatalog';
import { authService } from '../services/security/authService';
import { StepUpAuthModal } from '../components/security/StepUpAuthModal';
import { LocalStorageStatusCard } from '../components/security/LocalStorageStatusCard';
import { AssetLookupToggle } from '../components/settings/AssetLookupToggle';

const Settings: React.FC = () => {
    const { t } = useTranslation();
    const { user, updateProfile, deleteAccount } = useAuth();
    const { resetAccountDataToZero } = useData();
    const [searchParams] = useSearchParams();
    const initialTab = searchParams.get('tab');
    const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'fiscal' | 'ai' | 'security'>(() => {
        if (initialTab === 'fiscal' || initialTab === 'ai' || initialTab === 'security' || initialTab === 'preferences') {
            return initialTab;
        }
        return 'profile';
    });
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [hasExportedBeforeReset, setHasExportedBeforeReset] = useState(false);
    const [isExportingForReset, setIsExportingForReset] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [showBackupWizard, setShowBackupWizard] = useState(false);

    // Delete Account (GDPR) Modal State
    const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleteError, setDeleteError] = useState('');

    // Account deletion, email change and data exports all go through the step-up (stepUpService).
    type SettingsStepUp = { kind: 'deleteAccount' } | { kind: 'changeEmail' } | { kind: 'export'; run: () => Promise<void> | void };
    const [settingsStepUp, setSettingsStepUp] = useState<SettingsStepUp | null>(null);
    const emailChangeDoneRef = useRef(false);
    const protectExport = (run: () => Promise<void> | void) => () => setSettingsStepUp({ kind: 'export', run });
    // The demo account owns no personal data: exports are only offered for a real account.
    const exportAllowed = canExportAccountData();
    const exportButtonState = exportAllowed ? '' : 'opacity-50 cursor-not-allowed';

    const handleRequestDeleteAccount = () => {
        setDeleteError('');
        if (user?.authProvider === 'google') {
            const confirm = deleteConfirmText.trim().toUpperCase();
            if (confirm !== t('settings:dataAndBackup.confirmGooglePlaceholder').toUpperCase()) {
                setDeleteError(t('settings:dataAndBackup.invalidPasswordOrConfirm'));
                return;
            }
        }
        setSettingsStepUp({ kind: 'deleteAccount' });
    };

    const runSettingsStepUp = async ({ password }: { password: string }) => {
        if (!settingsStepUp) return;
        if (settingsStepUp.kind === 'export') {
            await settingsStepUp.run();
            return;
        }
        if (settingsStepUp.kind === 'changeEmail') {
            if (authService.changeEmail) {
                await authService.changeEmail(password, profileData.email);
            }
            emailChangeDoneRef.current = true;
            await updateProfile({ name: profileData.name });
            setSuccessMsg(t('settings:profile.emailChangeDispatched'));
            setTimeout(() => setSuccessMsg(''), 5000);
            return;
        }
        // Google account: the Drive key file is removed first, which needs a fresh Google round trip.
        // The page is left here; the callback page deletes the key file, then the account.
        if (user?.authProvider === 'google' && authService.startGoogleReauth) {
            await authService.startGoogleReauth('delete-account');
            return;
        }
        // The account is deleted server-side first (cloud); nothing local is wiped if that fails.
        await deleteAccount({
            password,
            confirmationText: user?.authProvider === 'google' ? 'DELETE' : undefined,
        });
        setShowDeleteAccountModal(false);
        window.location.assign('/login');
    };

    const closeSettingsStepUp = () => {
        if (settingsStepUp?.kind === 'changeEmail' && !emailChangeDoneRef.current) {
            setProfileData(prev => ({ ...prev, email: user?.email || '' }));
        }
        emailChangeDoneRef.current = false;
        setSettingsStepUp(null);
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
        taxResidenceCountries: user?.preferences?.fiscalProfile?.taxResidenceCountries || [],
        department: user?.preferences?.fiscalProfile?.department || '',
        taxZone: user?.preferences?.fiscalProfile?.taxZone || '',
    });

    const [isSaving, setIsSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setProfileData(prev => ({ ...prev, [name]: value }));
    };

    const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!file.type.startsWith('image/')) return;
            if (file.size > 2 * 1024 * 1024) return;
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                if (typeof base64String === 'string' && base64String.startsWith('data:image/')) {
                    updateProfile({ avatar: base64String });
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (profileData.email !== user?.email) {
            if (user?.authProvider === 'google') {
                setProfileData(prev => ({ ...prev, email: user?.email || '' }));
                return;
            }
            setSettingsStepUp({ kind: 'changeEmail' });
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

    const handleFiscalChange = async (updates: Partial<typeof fiscalData>) => {
        const newFiscal = { ...fiscalData, ...updates };
        setFiscalData(newFiscal);
        try {
            await updateProfile({
                preferences: {
                    ...prefData,
                    fiscalProfile: newFiscal,
                }
            });
            setSuccessMsg(t('tax:settings.autoSaved'));
            setTimeout(() => setSuccessMsg(''), 2500);
        } catch (err) {
            console.error('Failed to auto-save fiscal profile', err);
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
                        onClick={() => setActiveTab('security')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${activeTab === 'security' ? 'bg-primary text-white shadow-lg' : 'text-secondary hover:bg-card-hover'}`}
                    >
                        <Lock size={18} className="shrink-0" />
                        <span>{t('settings:tabs.security')}</span>
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
                                    <UserAvatar
                                        name={user?.name}
                                        email={user?.email}
                                        avatar={user?.avatar}
                                        size="xl"
                                        className="border-4 border-card"
                                    />

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

                                    <AssetLookupToggle />

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
                                                                        : 'border-subtle bg-subtle/30 opacity-60 cursor-not-allowed'
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
                                            <div className="space-y-5 animate-in fade-in slide-in-from-top-1">
                                                {/* Live Toasts Toggle */}
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm font-medium text-primary">{t('notifications:settings.toasts')}</p>
                                                        <p className="text-xs text-tertiary">{t('notifications:settings.toastsDesc')}</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={handleToggleToasts}
                                                        className={`w-10 h-5 rounded-full transition-colors relative p-0.5 inline-flex items-center ${notifPrefs.inAppToasts ? 'bg-primary' : 'bg-subtle border border-subtle'}`}
                                                        aria-label={t('notifications:settings.toasts')}
                                                    >
                                                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${notifPrefs.inAppToasts ? 'translate-x-[20px]' : 'translate-x-0'}`} />
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
                                                                className={`w-9 h-5 rounded-full transition-colors relative shrink-0 p-0.5 inline-flex items-center ${notifPrefs.categories.portfolio ? 'bg-primary' : 'bg-card border border-subtle'}`}
                                                                aria-label={t('notifications:settings.categoryPortfolio')}
                                                            >
                                                                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${notifPrefs.categories.portfolio ? 'translate-x-[16px]' : 'translate-x-0'}`} />
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
                                                                className={`w-9 h-5 rounded-full transition-colors relative shrink-0 p-0.5 inline-flex items-center ${notifPrefs.categories.fiscal ? 'bg-primary' : 'bg-card border border-subtle'}`}
                                                                aria-label={t('notifications:settings.categoryFiscal')}
                                                            >
                                                                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${notifPrefs.categories.fiscal ? 'translate-x-[16px]' : 'translate-x-0'}`} />
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
                                                                className={`w-9 h-5 rounded-full transition-colors relative shrink-0 p-0.5 inline-flex items-center ${notifPrefs.categories.goals ? 'bg-primary' : 'bg-card border border-subtle'}`}
                                                                aria-label={t('notifications:settings.categoryGoals')}
                                                            >
                                                                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${notifPrefs.categories.goals ? 'translate-x-[16px]' : 'translate-x-0'}`} />
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
                                                                className={`w-9 h-5 rounded-full transition-colors relative shrink-0 p-0.5 inline-flex items-center ${notifPrefs.categories.security ? 'bg-primary' : 'bg-card border border-subtle'}`}
                                                                aria-label={t('notifications:settings.categorySecurity')}
                                                            >
                                                                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${notifPrefs.categories.security ? 'translate-x-[16px]' : 'translate-x-0'}`} />
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
                                                        step={1}
                                                        value={notifPrefs.dormantCashThresholdPercent}
                                                        onChange={(e) => handleDormantCashChange(parseInt(e.target.value, 10))}
                                                        className="w-full appearance-none h-2 rounded-lg cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                                                        style={{
                                                            background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${Math.min(100, Math.max(0, ((notifPrefs.dormantCashThresholdPercent - 5) / (50 - 5)) * 100))}%, var(--bg-subtle) ${Math.min(100, Math.max(0, ((notifPrefs.dormantCashThresholdPercent - 5) / (50 - 5)) * 100))}%, var(--bg-subtle) 100%)`
                                                        }}
                                                    />
                                                    <div className="relative text-[10px] text-tertiary mt-1 h-3.5">
                                                        <span className="absolute left-0">5%</span>
                                                        <span className="absolute -translate-x-1/2" style={{ left: '44.44%' }}>25%</span>
                                                        <span className="absolute right-0">50%</span>
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

                            <LocalStorageStatusCard />

                            <div className={cardStyle}>
                                <h2 className="text-xl font-semibold text-primary mb-2 flex items-center gap-2">
                                    <Database size={20} className="text-primary" />
                                    {t('settings:dataAndBackup.title')}
                                </h2>
                                <p className="text-xs text-tertiary mb-6">
                                    {t('settings:dataAndBackup.subtitle')}
                                </p>
                                {!exportAllowed && (
                                    <p className="text-xs text-warning bg-warning-subtle border border-warning/30 rounded-lg p-3 mb-4" role="note">
                                        {t('settings:dataAndBackup.exportUnavailableDemo')}
                                    </p>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <button
                                        onClick={protectExport(exportTransactionsCSV)}
                                        disabled={!exportAllowed}
                                        title={exportAllowed ? undefined : t('settings:dataAndBackup.exportUnavailableDemo')}
                                        className={`p-4 rounded-xl border border-border bg-subtle hover:bg-card-hover text-left flex flex-col justify-between gap-3 transition-all group ${exportButtonState}`}
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
                                        onClick={protectExport(exportBackupJSON)}
                                        disabled={!exportAllowed}
                                        title={exportAllowed ? undefined : t('settings:dataAndBackup.exportUnavailableDemo')}
                                        className={`p-4 rounded-xl border border-border bg-subtle hover:bg-card-hover text-left flex flex-col justify-between gap-3 transition-all group ${exportButtonState}`}
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
                                        onClick={protectExport(exportRGPDZip)}
                                        disabled={!exportAllowed}
                                        title={exportAllowed ? undefined : t('settings:dataAndBackup.exportUnavailableDemo')}
                                        className={`p-4 rounded-xl border border-border bg-subtle hover:bg-card-hover text-left flex flex-col justify-between gap-3 transition-all group ${exportButtonState}`}
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
                                        <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto">
                                            {exportAllowed && (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                isLoading={isExportingForReset}
                                                className="w-full justify-center text-xs whitespace-nowrap"
                                                onClick={protectExport(async () => {
                                                    setIsExportingForReset(true);
                                                    try {
                                                        await exportBackupJSON();
                                                        await exportRGPDZip();
                                                        setHasExportedBeforeReset(true);
                                                    } finally {
                                                        setIsExportingForReset(false);
                                                    }
                                                })}
                                            >
                                                <Download size={14} className="mr-1.5 shrink-0" />
                                                {hasExportedBeforeReset
                                                    ? t('settings:dataAndBackup.backupsExportedReady')
                                                    : t('settings:dataAndBackup.exportAndUnlockReset')}
                                            </Button>
                                            )}
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                disabled={(exportAllowed && !hasExportedBeforeReset) || isResetting}
                                                isLoading={isResetting}
                                                className="w-full justify-center text-xs whitespace-nowrap"
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
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="w-full justify-center text-xs"
                                                onClick={() => {
                                                    setShowResetConfirm(false);
                                                    setHasExportedBeforeReset(false);
                                                }}
                                            >
                                                {t('settings:dataAndBackup.cancel')}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Legal & Privacy (E15) */}
                            <div className={cardStyle}>
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                                        <Scale size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-semibold text-primary">{t('settings:legal.title')}</h3>
                                        <p className="text-xs text-tertiary mt-0.5 leading-relaxed">
                                            {t('settings:legal.subtitle', { version: LEGAL_DOCUMENTS_VERSION })}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {(['legal', 'privacy', 'terms', 'cookies', 'accessibility'] as const).map((doc) => (
                                        <Link
                                            key={doc}
                                            to={`/${doc}`}
                                            className="px-3 py-2 rounded-lg bg-subtle hover:bg-card-hover border border-subtle text-xs font-semibold text-secondary hover:text-primary transition-colors"
                                        >
                                            {t(`legal:center.tabs.${doc}`)}
                                        </Link>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={openConsentPreferences}
                                        className="px-3 py-2 rounded-lg bg-subtle hover:bg-card-hover border border-subtle text-xs font-semibold text-secondary hover:text-primary transition-colors"
                                    >
                                        {t('settings:legal.cookiePreferences')}
                                    </button>
                                </div>
                                <p className="text-xs text-tertiary mt-4 leading-relaxed">
                                    {t('settings:legal.rightsHint', { email: LEGAL_CONTACT_EMAIL })}
                                </p>
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
                                    {exportAllowed && (
                                    <button
                                        type="button"
                                        onClick={protectExport(exportRGPDZip)}
                                        className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline font-medium"
                                    >
                                        <Download size={14} />
                                        {t('settings:dataAndBackup.downloadGdprArchive')}
                                    </button>
                                    )}
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
                                            <p className="text-[11px] text-tertiary mt-1.5 leading-relaxed">
                                                {t('settings:dataAndBackup.deleteGoogleDriveNote')}
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-secondary">{t('security:stepUp.description')}</p>
                                    )}
                                </div>

                                <div className="flex items-center justify-end gap-3 pt-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setShowDeleteAccountModal(false);
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
                                        onClick={handleRequestDeleteAccount}
                                    >
                                        {t('settings:dataAndBackup.confirmDeleteButton')}
                                    </Button>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}

                    {/* ================= SECURITY & ACCESS TAB ================= */}
                    {activeTab === 'security' && (
                        <SecuritySettingsTab />
                    )}

                    {/* ================= FISCAL TAB ================= */}
                    {activeTab === 'fiscal' && (
                        <div className="animate-fade-in">
                            <div className={cardStyle}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <Scale size={20} className="text-brand" />
                                        <h2 className="text-xl font-semibold text-primary">{t('tax:settings.title')}</h2>
                                    </div>
                                    {successMsg && (
                                        <span className="text-success text-xs font-medium animate-fade-in flex items-center gap-1">
                                            <Check size={14} />
                                            {successMsg}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-tertiary mb-6">{t('tax:settings.subtitle')}</p>

                                <div className="space-y-5">
                                    <div className="text-xs font-semibold text-brand uppercase tracking-wide">{t('tax:settings.requiredFields')}</div>

                                    {/* 1. Tax Residence Country */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-medium text-primary mb-0.5">{t('tax:settings.taxResidence')}</p>
                                            <p className="text-xs text-tertiary">{t('tax:settings.taxResidenceInfo')}</p>
                                        </div>
                                        <select
                                            value={fiscalData.taxResidenceCountries[0] || ''}
                                            onChange={e => {
                                                const val = e.target.value;
                                                const newCountries = val ? [val] : [];
                                                handleFiscalChange({
                                                    taxResidenceCountries: newCountries,
                                                    department: val === 'FR' ? fiscalData.department : '',
                                                    taxZone: val === 'FR' ? fiscalData.taxZone : '',
                                                });
                                            }}
                                            className="bg-subtle border border-subtle text-primary text-sm rounded-lg p-2 min-w-[200px] focus:ring-primary focus:border-primary"
                                        >
                                            <option value="">{t('tax:settings.noneOrUnspecified')}</option>
                                            <option value="FR">{t('tax:settings.france')}</option>
                                        </select>
                                    </div>

                                    {/* 2. French Department & Zone Selector (Conditional on FR) */}
                                    {fiscalData.taxResidenceCountries.includes('FR') && (
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
                                                            const zone = dept ? getTaxZoneForDepartment(dept) : '';
                                                            handleFiscalChange({ department: dept, taxZone: zone });
                                                        }}
                                                        className="bg-subtle border border-border text-primary text-sm rounded-lg p-2 min-w-[200px]"
                                                    >
                                                        <option value="">{t('tax:settings.selectDepartment')}</option>
                                                        {FRENCH_DEPARTMENTS.map(d => (
                                                            <option key={d.code} value={d.code}>
                                                                {d.code} - {d.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {fiscalData.taxZone && (
                                                        <span className="px-2.5 py-1 rounded-lg bg-brand/10 text-brand text-xs font-bold uppercase shrink-0">
                                                            {fiscalData.taxZone.replace('_', ' ')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* 3. Family Status */}
                                    <div className="flex items-center justify-between border-t border-border pt-5">
                                        <div>
                                            <p className="text-sm font-medium text-primary">{t('tax:settings.familyStatus')}</p>
                                            <p className="text-xs text-tertiary">{t('tax:settings.familyStatusInfo')}</p>
                                        </div>
                                        <select
                                            value={fiscalData.familyStatus}
                                            onChange={e => handleFiscalChange({ familyStatus: e.target.value as any })}
                                            className="bg-subtle border border-subtle text-primary text-sm rounded-lg p-2 min-w-[180px] focus:ring-primary focus:border-primary"
                                        >
                                            <option value="">—</option>
                                            {(['single', 'married', 'pacs', 'divorced', 'widowed'] as const).map(s => (
                                                <option key={s} value={s}>{t(`tax:settings.familyStatusOptions.${s}`)}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 4. Fiscal Shares */}
                                    <div className="flex items-center justify-between border-t border-border pt-5">
                                        <div>
                                            <p className="text-sm font-medium text-primary">{t('tax:settings.fiscalShares')}</p>
                                            <p className="text-xs text-tertiary">{t('tax:settings.fiscalSharesInfo')}</p>
                                        </div>
                                        <select
                                            value={fiscalData.fiscalShares}
                                            onChange={e => handleFiscalChange({ fiscalShares: parseFloat(e.target.value) })}
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

                                    {/* 5. Other Taxable Income */}
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
                                                onChange={e => handleFiscalChange({ otherTaxableIncome: parseFloat(e.target.value) || 0 })}
                                                className="bg-subtle border border-subtle text-primary text-sm rounded-lg p-2 pr-8 w-36 focus:ring-primary focus:border-primary text-right"
                                            />
                                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary text-sm">€</span>
                                        </div>
                                    </div>

                                    {/* 6. 2OP Option */}
                                    <div className="flex items-center justify-between border-t border-border pt-5">
                                        <div>
                                            <p className="text-sm font-medium text-primary">{t('tax:settings.hasOpted2OP')}</p>
                                            <p className="text-xs text-tertiary">{t('tax:settings.hasOpted2OPInfo')}</p>
                                        </div>
                                        <button
                                            onClick={() => handleFiscalChange({ hasOpted2OP: !fiscalData.hasOpted2OP })}
                                            className={`w-12 h-6 rounded-full transition-colors relative ${fiscalData.hasOpted2OP ? 'bg-brand' : 'bg-black/20 dark:bg-white/20'}`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${fiscalData.hasOpted2OP ? 'left-7' : 'left-1'}`} />
                                        </button>
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

            <StepUpAuthModal
                isOpen={settingsStepUp !== null}
                title={settingsStepUp?.kind === 'deleteAccount'
                    ? t('settings:dataAndBackup.deleteModalTitle')
                    : settingsStepUp?.kind === 'changeEmail'
                        ? t('settings:profile.confirmEmailChangeTitle')
                        : t('security:stepUp.title')}
                description={settingsStepUp?.kind === 'changeEmail'
                    ? t('settings:profile.emailConfirmationNotice')
                    : t('security:stepUp.description')}
                actionLabel={settingsStepUp?.kind === 'deleteAccount' ? t('settings:dataAndBackup.confirmDeleteButton') : undefined}
                actionVariant={settingsStepUp?.kind === 'deleteAccount' ? 'danger' : 'primary'}
                onVerified={runSettingsStepUp}
                onClose={closeSettingsStepUp}
            />
        </div>
    );
};

export default Settings;