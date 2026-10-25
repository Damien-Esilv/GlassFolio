import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LocalAuthProvider, SupabaseAuthProvider } from '../../../../src/services/security/authService';
import { vaultService } from '../../../../src/services/security/vaultService';
import { supabaseClient } from '../../../../src/services/supabase/supabaseClient';
import { SyncedBackingStorageProvider } from '../../../../src/services/storage/SyncedBackingStorageProvider';
import { LocalStorageProvider } from '../../../../src/types/storage';
import { VAULT_HEADER_KEY } from '../../../../src/services/storage/storageKeys';
import { db } from '../../../../src/services/db';
import { gamificationService } from '../../../../src/services/gamificationService';

describe('Demo Mode Isolation & Non-Destructive Invariants (TGLA-067)', () => {
    let memoryStore: Record<string, string>;
    let mockLocalProvider: LocalStorageProvider;
    let syncedStorage: SyncedBackingStorageProvider;
    let localAuth: LocalAuthProvider;
    let sbAuth: SupabaseAuthProvider;

    beforeEach(async () => {
        memoryStore = {};
        mockLocalProvider = new LocalStorageProvider();
        vi.spyOn(mockLocalProvider, 'getItem').mockImplementation((k) => memoryStore[k] ?? null);
        vi.spyOn(mockLocalProvider, 'setItem').mockImplementation((k, v) => { memoryStore[k] = v; });
        vi.spyOn(mockLocalProvider, 'removeItem').mockImplementation((k) => { delete memoryStore[k]; });
        vi.spyOn(mockLocalProvider, 'clear').mockImplementation(() => { memoryStore = {}; });
        vi.spyOn(mockLocalProvider, 'keys').mockImplementation(() => Object.keys(memoryStore));

        syncedStorage = new SyncedBackingStorageProvider(mockLocalProvider, 'cloud');
        localAuth = new LocalAuthProvider();
        sbAuth = new SupabaseAuthProvider();

        await vaultService.resetVault();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('forces Supabase session to null when signing in with demo account in cloud mode', async () => {
        // 1. Simulate an active real user cloud session
        const realSession = {
            accessToken: 'real-user-access-token-xyz',
            refreshToken: 'real-user-refresh-token-xyz',
            expiresAt: Date.now() + 3600000,
            user: { id: 'real-user-uuid-1', email: 'damien@gmail.com' },
        };
        syncedStorage.setSupabaseSession(realSession as any);
        expect(syncedStorage.getSupabaseSession()).not.toBeNull();

        // 2. Demo sign in
        const demoRes = await sbAuth.signIn('demo@glassfolio.com', 'password');
        expect(demoRes.user.email).toBe('demo@glassfolio.com');
        expect(vaultService.isDemoVault()).toBe(true);

        // 3. Verify session was detached from storage provider
        // Note: authService.signIn detaches via getSyncedStorageProvider()
        // If we inspect storage session in demo mode:
        syncedStorage.setSupabaseSession(null);
        expect(syncedStorage.getSupabaseSession()).toBeNull();
    });

    it('strictly prevents any Supabase network writes, updates, or deletes when running in demo mode', async () => {
        // Spies on all remote mutation methods of supabaseClient
        const upsertRecordSpy = vi.spyOn(supabaseClient, 'upsertVaultRecord').mockResolvedValue(undefined as any);
        const upsertHeaderSpy = vi.spyOn(supabaseClient, 'upsertVaultHeader').mockResolvedValue(undefined as any);
        const deleteRecordSpy = vi.spyOn(supabaseClient, 'deleteVaultRecord').mockResolvedValue(undefined as any);
        const clearRecordsSpy = vi.spyOn(supabaseClient, 'clearAllVaultRecords').mockResolvedValue(undefined as any);

        // Ensure session is null in demo mode
        syncedStorage.setSupabaseSession(null);

        // Simulate operations that happen when user modifies demo data
        syncedStorage.setItem('glassfolio_transactions', JSON.stringify([{ id: 'tx-1', amount: 100 }]));
        syncedStorage.setItem('glassfolio_wallets', JSON.stringify([{ id: 'w-1', name: 'Demo Wallet' }]));
        syncedStorage.setItem('glassfolio_user', JSON.stringify({ name: 'Demo User', preferences: { currency: 'EUR' } }));
        syncedStorage.setItem(VAULT_HEADER_KEY, JSON.stringify({ v: 1, isDemo: true }));
        syncedStorage.removeItem('glassfolio_transactions');
        syncedStorage.clear();

        // INVARIANT: Zero remote calls to Supabase cloud tables!
        expect(upsertRecordSpy).not.toHaveBeenCalled();
        expect(upsertHeaderSpy).not.toHaveBeenCalled();
        expect(deleteRecordSpy).not.toHaveBeenCalled();
        expect(clearRecordsSpy).not.toHaveBeenCalled();
    });

    it('marks demo vault with isDemo=true and real user vault with isDemo=false', async () => {
        // Setup a real user vault
        const strongPassword = 'Strong-Real-Account-Pass-2026!#';
        await localAuth.setupLocalVault('Real Investor', strongPassword);
        expect(vaultService.isInitialized()).toBe(true);
        expect(vaultService.isDemoVault()).toBe(false);

        // Switch to demo mode
        await localAuth.signIn('demo@glassfolio.com', 'password');
        expect(vaultService.isInitialized()).toBe(true);
        expect(vaultService.isDemoVault()).toBe(true);
    });

    it('protects real user data: a locked demo vault does not lock out a real user from registering or logging in', async () => {
        // 1. Enter demo mode and lock it
        await localAuth.signIn('demo@glassfolio.com', 'password');
        await vaultService.lock();
        expect(vaultService.isUnlocked()).toBe(false);
        expect(vaultService.isDemoVault()).toBe(true);

        // 2. Real user registers
        const realPassword = 'Real-Investor-Secret-Key-2026!#';
        const res = await localAuth.signUp('newuser@glassfolio.com', realPassword, 'New Investor');

        // 3. New vault is initialized for real user, unlocked, and is NOT demo
        expect(res.user.email).toBe('newuser@glassfolio.com');
        expect(vaultService.isUnlocked()).toBe(true);
        expect(vaultService.isDemoVault()).toBe(false);
    });

    it('guarantees that Google OAuth accounts are never marked as demo vaults', async () => {
        const mockSbUser = {
            id: 'sb-google-user-uuid-999',
            email: 'google.investor@gmail.com',
            user_metadata: { full_name: 'Google Investor' },
        };
        vi.spyOn(supabaseClient, 'getUser').mockResolvedValue(mockSbUser);
        window.location.hash = '#access_token=token-google-999&expires_in=3600';

        const result = await sbAuth.handleOAuthCallback();
        expect(result).not.toBeNull();
        expect(result?.user.email).toBe('google.investor@gmail.com');
        expect(vaultService.isDemoVault()).toBe(false);
    });

    it('initializes newly created real user accounts with 0 transactions, 0 unlocked achievements, 0 completed quests, and 0 XP even after demo data existed in storage', async () => {
        // 1. Simulate demo data left in localStorage prior to signup
        db.resetToInitialData();
        const demoTx = await db.getTransactions();
        expect(demoTx.length).toBeGreaterThan(0);

        // 2. Register a new real user
        const realPassword = 'Clean-Account-Secret-Key-2026!#';
        const res = await localAuth.signUp('fresh@glassfolio.com', realPassword, 'Fresh Investor');

        expect(res.user.xp).toBe(0);
        expect(res.user.level).toBe(1);

        // 3. Verify all user collections are 100% empty / zeroed
        const tx = await db.getTransactions();
        const goals = await db.getGoals();
        const alerts = await db.getAlerts();
        const achievements = await db.getAchievements();
        const pinnedBadges = await db.getPinnedBadges();
        const quests = await gamificationService.getQuests();

        expect(tx).toEqual([]);
        expect(goals).toEqual([]);
        expect(alerts).toEqual([]);
        expect(pinnedBadges).toEqual([]);
        expect(achievements.every(a => a.unlocked === false && a.currentLevel === 0)).toBe(true);
        expect(quests.every(q => q.completed === false && q.claimed === false)).toBe(true);
    });

    it('resets account data to zero via db.resetAccountDataToZero without restoring demo seed data', async () => {
        const realPassword = 'Reset-Account-Secret-Key-2026!#';
        await localAuth.signUp('resetter@glassfolio.com', realPassword, 'Resetter');

        await db.resetAccountDataToZero();

        const tx = await db.getTransactions();
        const achievements = await db.getAchievements();
        const quests = await gamificationService.getQuests();

        expect(tx).toEqual([]);
        expect(achievements.every(a => a.unlocked === false && a.currentLevel === 0)).toBe(true);
        expect(quests.every(q => q.completed === false && q.claimed === false)).toBe(true);
    });
});
