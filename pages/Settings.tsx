import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import { User, Lock, Upload, Globe, Moon, Bell, Sun, Laptop } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

const Settings: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences'>('profile');
  
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
  const [prefData, setPrefData] = useState({
      currency: user?.preferences?.currency || 'USD',
      theme: user?.preferences?.theme || 'night',
      notifications: user?.preferences?.notifications ?? true
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
          setSuccessMsg('Profile details updated successfully');
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
          alert("New passwords do not match!");
          return;
      }
      setIsSaving(true);
      // Simulate API Call
      setTimeout(() => {
          setIsSaving(false);
          setSuccessMsg('Password changed successfully');
          setPasswords({ current: '', new: '', confirm: '' });
          setTimeout(() => setSuccessMsg(''), 3000);
      }, 1000);
  };

  const updatePreference = async (key: string, value: any) => {
      const newPrefs = { ...prefData, [key]: value };
      setPrefData(newPrefs);
      await updateProfile({ preferences: newPrefs as any });
  };

  if (!user) return null;

  const cardStyle = "bg-white/50 dark:bg-black/20 rounded-xl p-6 shadow-lg ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-lg";

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-black dark:text-white mb-2">Settings</h1>
        <p className="text-black/60 dark:text-white/60">Manage your profile settings and application preferences.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Navigation */}
        <div className="space-y-2 lg:col-span-1">
            <button 
                onClick={() => setActiveTab('profile')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'profile' ? 'bg-primary text-white shadow-lg' : 'text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/10'}`}
            >
                <User size={18} /> Profile
            </button>
            <button 
                onClick={() => setActiveTab('preferences')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${activeTab === 'preferences' ? 'bg-primary text-white shadow-lg' : 'text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/10'}`}
            >
                <Globe size={18} /> Preferences
            </button>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-3 space-y-6">
            
            {/* ================= PROFILE TAB ================= */}
            {activeTab === 'profile' && (
                <div className="space-y-6 animate-fade-in">
                    <div className={cardStyle}>
                        <h2 className="text-xl font-semibold text-black dark:text-white mb-6">Public Profile</h2>
                        
                        {/* Avatar Section */}
                        <div className="flex items-center gap-6 mb-8 pb-8 border-b border-black/10 dark:border-white/10">
                            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white dark:border-slate-800 bg-slate-200 dark:bg-slate-800 shrink-0">
                                {user.avatar ? (
                                    <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-slate-500">
                                        {user.name.charAt(0)}
                                    </div>
                                )}
                            </div>
                            
                            <div>
                                <h3 className="text-lg font-medium text-black dark:text-white">Profile Picture</h3>
                                <p className="text-sm text-black/50 dark:text-white/50 mb-3">Supports JPG, PNG or GIF. Max size 2MB.</p>
                                <div className="flex gap-3">
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                                    <Button size="sm" variant="secondary" onClick={triggerFileInput}>
                                        <Upload size={14} className="mr-2" />
                                        Upload New
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10" onClick={() => updateProfile({ avatar: '' })}>
                                        Remove
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Basic Info Form */}
                        <form onSubmit={handleSaveProfile} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-medium text-black/60 dark:text-white/60 mb-1.5">Display Name</label>
                                    <input 
                                        type="text" 
                                        name="name"
                                        value={profileData.name}
                                        onChange={handleProfileChange}
                                        className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-black/60 dark:text-white/60 mb-1.5">Email Address</label>
                                    <input 
                                        type="email" 
                                        name="email"
                                        value={profileData.email}
                                        onChange={handleProfileChange}
                                        className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5"
                                    />
                                </div>
                            </div>
                            
                            <div className="flex justify-end">
                                <Button type="submit" isLoading={isSaving} className="bg-primary text-white hover:bg-primary/90">Save Profile</Button>
                            </div>
                        </form>
                    </div>

                    {/* Change Password Section (Moved here) */}
                    <div className={cardStyle}>
                        <h2 className="text-xl font-semibold text-black dark:text-white mb-6 flex items-center gap-2">
                            <Lock size={20} className="text-black/40 dark:text-white/40"/>
                            Change Password
                        </h2>
                        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                            <div>
                                <label className="block text-xs font-medium text-black/60 dark:text-white/60 mb-1.5">Current Password</label>
                                <input 
                                    type="password" 
                                    name="current"
                                    value={passwords.current}
                                    onChange={handlePasswordChange}
                                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-black/60 dark:text-white/60 mb-1.5">New Password</label>
                                <input 
                                    type="password" 
                                    name="new"
                                    value={passwords.new}
                                    onChange={handlePasswordChange}
                                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-black/60 dark:text-white/60 mb-1.5">Confirm New Password</label>
                                <input 
                                    type="password" 
                                    name="confirm"
                                    value={passwords.confirm}
                                    onChange={handlePasswordChange}
                                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white text-sm rounded-lg focus:ring-primary focus:border-primary p-2.5"
                                />
                            </div>
                            <div className="pt-2 flex justify-between items-center">
                                <span className="text-accent-green text-sm font-medium">{successMsg}</span>
                                <Button type="submit" variant="secondary">Update Password</Button>
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
                        <h2 className="text-xl font-semibold text-black dark:text-white mb-6">Application Settings</h2>
                        <div className="space-y-8">
                             {/* Currency */}
                             <div className="flex items-center justify-between">
                                 <div className="flex items-center gap-3">
                                     <div className="p-2 bg-black/5 dark:bg-white/5 rounded-lg text-black/60 dark:text-white/60"><Globe size={20}/></div>
                                     <div>
                                         <p className="text-sm font-medium text-black dark:text-white">Base Currency</p>
                                         <p className="text-xs text-black/50 dark:text-white/50">Select your preferred currency for aggregation.</p>
                                     </div>
                                 </div>
                                 <select 
                                    value={prefData.currency}
                                    onChange={(e) => updatePreference('currency', e.target.value)}
                                    className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white text-sm rounded-lg p-2 min-w-[100px]"
                                 >
                                     <option value="USD">USD ($)</option>
                                     <option value="EUR">EUR (€)</option>
                                     <option value="GBP">GBP (£)</option>
                                 </select>
                             </div>

                             {/* Theme Selector */}
                             <div className="border-t border-black/10 dark:border-white/10 pt-6">
                                 <div className="flex items-center gap-3 mb-4">
                                     <div className="p-2 bg-black/5 dark:bg-white/5 rounded-lg text-black/60 dark:text-white/60"><Moon size={20}/></div>
                                     <div>
                                         <p className="text-sm font-medium text-black dark:text-white">Appearance</p>
                                         <p className="text-xs text-black/50 dark:text-white/50">Customize your interface theme.</p>
                                     </div>
                                 </div>
                                 
                                 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                     <button 
                                        onClick={() => updatePreference('theme', 'light')}
                                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${prefData.theme === 'light' ? 'bg-primary/10 border-primary text-primary' : 'bg-black/5 dark:bg-white/5 border-transparent text-black/60 dark:text-white/60 hover:border-black/20 dark:hover:border-white/20'}`}
                                     >
                                         <Sun size={20} />
                                         <span className="text-xs font-medium">Light</span>
                                     </button>
                                     <button 
                                        onClick={() => updatePreference('theme', 'dark')}
                                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${prefData.theme === 'dark' ? 'bg-primary/10 border-primary text-primary' : 'bg-black/5 dark:bg-white/5 border-transparent text-black/60 dark:text-white/60 hover:border-black/20 dark:hover:border-white/20'}`}
                                     >
                                         <Moon size={20} />
                                         <span className="text-xs font-medium">Dark</span>
                                     </button>
                                     <button 
                                        onClick={() => updatePreference('theme', 'night')}
                                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${prefData.theme === 'night' ? 'bg-primary/10 border-primary text-primary' : 'bg-black/5 dark:bg-white/5 border-transparent text-black/60 dark:text-white/60 hover:border-black/20 dark:hover:border-white/20'}`}
                                     >
                                         <div className="w-5 h-5 rounded-full bg-[#101922] border border-slate-700"></div>
                                         <span className="text-xs font-medium">Night</span>
                                     </button>
                                     <button 
                                        onClick={() => updatePreference('theme', 'system')}
                                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${prefData.theme === 'system' ? 'bg-primary/10 border-primary text-primary' : 'bg-black/5 dark:bg-white/5 border-transparent text-black/60 dark:text-white/60 hover:border-black/20 dark:hover:border-white/20'}`}
                                     >
                                         <Laptop size={20} />
                                         <span className="text-xs font-medium">System</span>
                                     </button>
                                 </div>
                             </div>

                             {/* Notifications */}
                             <div className="flex items-center justify-between border-t border-black/10 dark:border-white/10 pt-6">
                                 <div className="flex items-center gap-3">
                                     <div className="p-2 bg-black/5 dark:bg-white/5 rounded-lg text-black/60 dark:text-white/60"><Bell size={20}/></div>
                                     <div>
                                         <p className="text-sm font-medium text-black dark:text-white">Notifications</p>
                                         <p className="text-xs text-black/50 dark:text-white/50">Receive updates about your portfolio.</p>
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
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default Settings;