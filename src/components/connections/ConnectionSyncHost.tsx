import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { vaultService } from '../../services/security/vaultService';
import { isDemoAccount } from '../../services/security/demoAccount';
import { connectionService, syncEngine } from '../../services/connectors';
import { notifySyncOutcome } from '../../services/connectors/syncNotifications';

/** Waits a little after unlocking, so the first screen renders before any sync starts. */
const FIRST_RUN_DELAY_MS = 10_000;
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Runs the automatic syncs (TGLA-221) while this tab is signed in and its vault is unlocked: the
 * credentials live in the vault, so nothing can sync anywhere else. Due connections run one after
 * the other on unlock, then every 30 minutes; the positions refresh when a sync changed something.
 */
export const ConnectionSyncHost: React.FC = () => {
    const { user } = useAuth();
    const { refreshData } = useData();
    const [unlocked, setUnlocked] = useState<boolean>(() => vaultService.isUnlocked());
    const active = Boolean(user) && unlocked && !isDemoAccount(user);

    useEffect(() => vaultService.subscribeStatus(status => setUnlocked(status === 'unlocked')), []);

    useEffect(() => {
        if (!active) return undefined;
        let cancelled = false;

        const runDue = async (): Promise<void> => {
            if (document.visibilityState === 'hidden') return;
            const due = (await connectionService.listConnections()).filter(connection => syncEngine.isDue(connection));
            let changed = false;
            for (const connection of due) {
                if (cancelled || !vaultService.isUnlocked()) return;
                const report = await syncEngine.runSync(connection.id);
                notifySyncOutcome(connection, report);
                changed ||= report.accounts.some(account => account.imported > 0);
            }
            if (changed && !cancelled) await refreshData();
        };

        const first = window.setTimeout(() => void runDue().catch(() => undefined), FIRST_RUN_DELAY_MS);
        const timer = window.setInterval(() => void runDue().catch(() => undefined), CHECK_INTERVAL_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(first);
            window.clearInterval(timer);
        };
    }, [active, refreshData]);

    return null;
};
