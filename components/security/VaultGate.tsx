import React, { useState, useEffect } from 'react';
import { vaultService } from '../../src/services/security/vaultService';
import { VaultStatus } from '../../src/services/security/vaultTypes';
import { LockScreen } from './LockScreen';

interface VaultGateProps {
    children: React.ReactNode;
}

export const VaultGate: React.FC<VaultGateProps> = ({ children }) => {
    const [status, setStatus] = useState<VaultStatus>(() => vaultService.getStatus());

    useEffect(() => {
        const unsubscribe = vaultService.subscribeStatus((newStatus) => {
            setStatus(newStatus);
        });
        return unsubscribe;
    }, []);

    if (status === 'locked') {
        return <LockScreen />;
    }

    return <>{children}</>;
};
