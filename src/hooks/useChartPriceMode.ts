/**
 * Portfolio curve source preference (real historical closes vs. estimate),
 * persisted in the user's preferences.
 */

import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import type { ChartPriceMode, UserPreferences } from '../types/domain';

export const DEFAULT_CHART_PRICE_MODE: ChartPriceMode = 'historical';

export const useChartPriceMode = (): [ChartPriceMode, (mode: ChartPriceMode) => Promise<void>] => {
    const { user, updateProfile } = useAuth();
    const mode = user?.preferences?.chartPriceMode ?? DEFAULT_CHART_PRICE_MODE;

    const setMode = useCallback(async (next: ChartPriceMode) => {
        if (!user?.preferences) return;
        const preferences: UserPreferences = { ...user.preferences, chartPriceMode: next };
        await updateProfile({ preferences });
    }, [user?.preferences, updateProfile]);

    return [mode, setMode];
};
