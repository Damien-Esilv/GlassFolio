import React, { useState, useEffect } from 'react';
import { vaultService } from '../../services/security/vaultService';
import { VaultStatus } from '../../services/security/vaultTypes';
import { LockScreen } from './LockScreen';
import { EmailVerificationGate } from './EmailVerificationGate';
import { useAuth } from '../../context/AuthContext';

interface VaultGateProps {
    children: React.ReactNode;
}

export const VaultGate: React.FC<VaultGateProps> = ({ children }) => {
    const { user, logout } = useAuth();
    const [status, setStatus] = useState<VaultStatus>(() => vaultService.getStatus());

    useEffect(() => {
        const unsubscribe = vaultService.subscribeStatus((newStatus) => {
            setStatus(newStatus);
        });
        return unsubscribe;
    }, []);

    const hasAutoUnlockedRef = React.useRef(false);

    // Seamless Zero-Password auto-unlock for Google OAuth accounts (Option A)
    // If the vault locks again after initial unlock (e.g. inactivity auto-lock), log out securely.
    useEffect(() => {
        if (!user || user.authProvider !== 'google') {
            hasAutoUnlockedRef.current = false;
            return;
        }

        if (status === 'locked') {
            if (!hasAutoUnlockedRef.current && vaultService.isInitialized()) {
                const oauthEmail = user.email.trim().toLowerCase();
                const oauthVaultSecret = `gf-oauth-e2ee-v1:${user.id}:${oauthEmail}`;
                vaultService.unlockOAuthVault(oauthVaultSecret).then(() => {
                    hasAutoUnlockedRef.current = true;
                }).catch((err) => {
                    // Never recreate a vault here: a fresh sign-in re-checks the server copy first.
                    console.warn('[VaultGate] Google OAuth auto-unlock failed, signing out', err);
                    logout();
                });
            } else if (hasAutoUnlockedRef.current) {
                logout();
            }
        } else if (status === 'unlocked') {
            hasAutoUnlockedRef.current = true;
        }
    }, [user, status, logout]);

    // A signed-in user without any vault (e.g. reset elsewhere) must not see plaintext storage.
    useEffect(() => {
        if (user && status === 'uninitialized') {
            logout();
        }
    }, [user, status, logout]);

    if (user && status === 'uninitialized') {
        return null;
    }

    // 1. Cloud Email Verification Gate
    if (user && user.authProvider === 'email' && user.emailVerified === false) {
        return (
            <EmailVerificationGate
                userEmail={user.email}
                onVerified={() => {
                    window.location.reload();
                }}
                onSignOut={logout}
            />
        );
    }

    // 2. Lock screen for locked master password vaults
    if (status === 'locked') {
        return <LockScreen />;
    }

    return <>{children}</>;
};
