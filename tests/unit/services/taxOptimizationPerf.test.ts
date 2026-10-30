import { describe, it, expect, vi } from 'vitest';
import { taxService } from '../../../src/services/fiscal/taxService';
import { FiscalProfile } from '../../../src/types/types.backend';

describe('Tax Optimization Performance & Mutualized Summary', () => {
    const mockProfile: FiscalProfile = {
        taxResidenceCountries: ['FR'],
        estimatedTMI: 30,
        hasOpted2OP: false,
    };

    it('reuses existingSummary without triggering duplicate getTaxSummary calls', async () => {
        const getTaxSummarySpy = vi.spyOn(taxService, 'getTaxSummary');

        const summary = await taxService.getTaxSummary('2024', mockProfile);
        expect(getTaxSummarySpy).toHaveBeenCalledTimes(1);

        const [pfuResult, suggestions] = await Promise.all([
            taxService.comparePFUvsBareme('2024', mockProfile, undefined, summary),
            taxService.getOptimizationSuggestions('2024', mockProfile, undefined, summary),
        ]);

        // Neither comparePFUvsBareme nor getOptimizationSuggestions should have called getTaxSummary again
        expect(getTaxSummarySpy).toHaveBeenCalledTimes(1);
        expect(pfuResult).toBeDefined();
        expect(pfuResult.recommendation).toBeDefined();
        expect(Array.isArray(suggestions)).toBe(true);

        // getCachedTaxSummary should synchronously return the cached summary
        const cached = taxService.getCachedTaxSummary('2024', mockProfile);
        expect(cached).toBe(summary);

        getTaxSummarySpy.mockRestore();
    });
});
