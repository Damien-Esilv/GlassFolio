import { describe, it, expect } from 'vitest';
import { simulateTaxImpactTool } from '../../../../src/services/ai/tools/fiscalTools';

describe('simulate_tax_impact rates', () => {
  it('applies the 31.4 % flat tax from fiscal year 2025', async () => {
    const result = await simulateTaxImpactTool.execute({ grossGain: 1000, fiscalYear: '2025' });
    expect(result).toMatchObject({ estimatedFlatTax: 314, socialContributions: 186, incomeTaxPart: 128, netGainAfterTax: 686 });
  });

  it('keeps the 30 % flat tax for fiscal year 2024', async () => {
    const result = await simulateTaxImpactTool.execute({ grossGain: 1000, fiscalYear: '2024' });
    expect(result).toMatchObject({ estimatedFlatTax: 300, socialContributions: 172, incomeTaxPart: 128 });
  });
});
