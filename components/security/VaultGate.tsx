import React, { useState, useEffect } from 'react';
import { vaultService } from '../../src/services/security/vaultService';
import { VaultStatus } from '../../src/services/security/vaultTypes';
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
                    console.warn('[VaultGate] Seamless Google OAuth auto-unlock fallback', err);
                });
            } else if (hasAutoUnlockedRef.current) {
                logout();
            }
        } else if (status === 'unlocked') {
            hasAutoUnlockedRef.current = true;
        }
    }, [user, status, logout]);

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
