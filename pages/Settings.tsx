import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import { User, Lock, Upload, Globe, Moon, Bell, Sun, Laptop, Languages, RotateCcw, Calendar } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserPreferences } from '../types';
import ImportBatchList from '../components/ImportBatchList';
import { useData } from '../context/DataContext';
import { SUPPORTED_CURRENCIES } from '../utils/currency';
import { exportBackupJSON, exportRGPDZip } from '../src/services/exportService';
import { BackupMergeWizard } from '../components/BackupMergeWizard';
import { Download, FileText, Database } from 'lucide-react';

const Settings: React.FC = () => {
    const { t } = useTranslation();
    const { user, updateProfile } = useAuth();
    const { resetToSeedData } = useData();
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<'profile' | 'preferences'>('profile');
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [showBackupWizard, setShowBackupWizard] = useState(false);

    // Check URL params for active tab
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'preferences') setActiveTab('preferences');
        else if (tab === 'profile') setActiveTab('profile');
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

    if (!user) return null;

    const cardStyle = "bg-card rounded-xl p-6 shadow-lg border border-border";

    return (
        <div className="max-w-4xl mx-auto pb-12">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-primary mb-2">{t('settings:title')}</h1>
                <p className="text-secondary">{t('settings:subtitle')}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Sidebar Navigation */}
                <div className="space-y-2 lg:col-span-1">
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'profile' ? 'bg-primary text-white shadow-lg' : 'text-secondary hover:bg-card-hover'}`}
                    >
                        <User size={18} /> {t('settings:tabs.profile')}
                    </button>
                    <button
                        onClick={() => setActiveTab('preferences')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'preferences' ? 'bg-primary text-white shadow-lg' : 'text-secondary hover:bg-card-hover'}`}
                    >
                        <Globe size={18} /> {t('settings:tabs.preferences')}
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="lg:col-span-3 space-y-6">

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

                                    {/* Theme Selector */}
                                    <div className="border-t border-border pt-6">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="p-2 bg-subtle rounded-lg text-secondary"><Moon size={20} /></div>
                                            <div>
                                                <p className="text-sm font-medium text-primary">{t('settings:preferences.appearance')}</p>
                                                <p className="text-xs text-tertiary">{t('settings:preferences.appearanceInfo')}</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            <button
                                                onClick={() => updatePreference('theme', 'light')}
                                                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${prefData.theme === 'light' ? 'bg-primary/10 border-primary text-primary' : 'bg-subtle border-transparent text-secondary hover:border-black/20 dark:hover:border-white/20'}`}
                                            >
                                                <Sun size={20} />
                                                <span className="text-xs font-medium">{t('settings:preferences.light')}</span>
                                            </button>
                                            <button
                                                onClick={() => updatePreference('theme', 'dark')}
                                                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${prefData.theme === 'dark' ? 'bg-primary/10 border-primary text-primary' : 'bg-subtle border-transparent text-secondary hover:border-black/20 dark:hover:border-white/20'}`}
                                            >
                                                <Moon size={20} />
                                                <span className="text-xs font-medium">{t('settings:preferences.dark')}</span>
                                            </button>
                                            <button
                                                onClick={() => updatePreference('theme', 'night')}
                                                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${prefData.theme === 'night' ? 'bg-primary/10 border-primary text-primary' : 'bg-subtle border-transparent text-secondary hover:border-black/20 dark:hover:border-white/20'}`}
                                            >
                                                <div data-theme="night" className="w-5 h-5 rounded-full bg-canvas border border-subtle"></div>
                                                <span className="text-xs font-medium">{t('settings:preferences.night')}</span>
                                            </button>
                                            <button
                                                onClick={() => updatePreference('theme', 'system')}
                                                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${prefData.theme === 'system' ? 'bg-primary/10 border-primary text-primary' : 'bg-subtle border-transparent text-secondary hover:border-black/20 dark:hover:border-white/20'}`}
                                            >
                                                <Laptop size={20} />
                                                <span className="text-xs font-medium">{t('settings:preferences.system')}</span>
                                            </button>
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

                            {/* Data Export & Backup Section */}
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
                                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 w-fit group-hover:scale-110 transition-transform">
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
                            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500">
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
                                            <span className="text-xs text-rose-500 font-medium">{t('settings:dataAndBackup.confirmReset')}</span>
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