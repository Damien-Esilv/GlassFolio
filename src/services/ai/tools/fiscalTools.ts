import { AIToolDefinition } from '../types';
import { taxService } from '../../fiscal/taxService';
import { FiscalProfile } from '../../../types/types.backend';
import { userRepository } from '../../repositories';

/** The user's own fiscal profile (Settings > Tax), as the tax pages use it; never an invented income. */
const userFiscalProfile = async (): Promise<FiscalProfile> => {
  const user = await userRepository.getUser().catch(() => null);
  return { taxResidenceCountries: ['FR'], fiscalShares: 1, ...(user?.preferences?.fiscalProfile ?? {}) } as FiscalProfile;
};

export const getTaxSummaryTool: AIToolDefinition<
  { fiscalYear?: string },
  {
    fiscalYear: string;
    totalGrossCapitalGains: number;
    totalGrossCapitalLosses: number;
    netTaxableGain: number;
    totalTaxDue: number;
    recommendedRegime: string;
    taxSavingsWithOptimalRegime: number;
  }
> = {
  name: 'get_tax_summary',
  description:
    'Calculate and return capital gains, tax estimates, and tax comparison (PFU flat tax vs barème progressif) for a given fiscal year in France.',
  parameters: {
    type: 'object',
    properties: {
      fiscalYear: {
        type: 'string',
        description: 'Fiscal year (e.g. "2024", "2025"). Defaults to previous year or current year.',
      },
    },
  },
  execute: async (params) => {
    const currentYear = new Date().getFullYear();
    const year = params.fiscalYear || String(currentYear - 1);

    const profile = await userFiscalProfile();
    const summary = await taxService.getTaxSummary(year, profile, 'FR');
    const comparison = await taxService.comparePFUvsBareme(year, profile, 'FR', summary);

    const totalGrossCapitalGains = Math.round((summary.cto.totalGains + summary.crypto.totalGains) * 100) / 100;
    const totalGrossCapitalLosses = Math.round((summary.cto.totalLosses + summary.crypto.totalLosses) * 100) / 100;
    const netTaxableGain = Math.round((summary.cto.netResult + summary.crypto.netResult) * 100) / 100;
    const totalTaxDue = comparison.recommendation === 'BAREME' ? comparison.baremeTotal : comparison.pfuTotal;
    const taxSavings = Math.abs(Math.round((comparison.pfuTotal - comparison.baremeTotal) * 100) / 100);

    return {
      fiscalYear: year,
      totalGrossCapitalGains,
      totalGrossCapitalLosses,
      netTaxableGain,
      totalTaxDue,
      recommendedRegime: comparison.recommendation,
      taxSavingsWithOptimalRegime: taxSavings,
    };
  },
};

export const simulateTaxImpactTool: AIToolDefinition<
  { grossGain: number; assetType?: 'stock' | 'crypto' },
  { grossGain: number; estimatedFlatTax: number; socialContributions: number; incomeTaxPart: number; netGainAfterTax: number }
> = {
  name: 'simulate_tax_impact',
  description:
    'Simulate French flat-tax (PFU 30% - 12.8% income tax + 17.2% social contributions) impact for a hypothetical capital gain.',
  parameters: {
    type: 'object',
    properties: {
      grossGain: {
        type: 'number',
        description: 'Gross capital gain in EUR to simulate tax on',
      },
      assetType: {
        type: 'string',
        enum: ['stock', 'crypto'],
        description: 'Asset type, defaults to stock',
      },
    },
    required: ['grossGain'],
  },
  execute: async (params) => {
    const gain = Math.max(0, params.grossGain);
    const social = Math.round(gain * 0.172 * 100) / 100;
    const income = Math.round(gain * 0.128 * 100) / 100;
    const totalTax = Math.round((social + income) * 100) / 100;
    const net = Math.round((gain - totalTax) * 100) / 100;

    return {
      grossGain: gain,
      estimatedFlatTax: totalTax,
      socialContributions: social,
      incomeTaxPart: income,
      netGainAfterTax: net,
    };
  },
};
