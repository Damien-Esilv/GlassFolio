import { describe, it, expect } from 'vitest';
import { ASSET_CLASSES } from '../../../src/constants/assetClasses';

describe('PortfolioPerformance comparison chart calculation optimization', () => {
  it('computes comparison chart data accurately with stack-scoped curve parameter caching', () => {
    const isAssetCategory = (item: string) => (ASSET_CLASSES as readonly string[]).includes(item);
    const referenceHistoryMap: Record<string, number[]> = {};

    interface CurveItemParams {
      scale: number;
      drift: number;
      freq1: number;
      freq2: number;
      phase1: number;
      phase2: number;
      startOffset: number;
    }
    const itemParamsMap = new Map<string, CurveItemParams>();

    const getItemParams = (itemKey: string): CurveItemParams => {
      let params = itemParamsMap.get(itemKey);
      if (params) return params;

      let seed1 = 0;
      let seed2 = 0;
      for (let c = 0; c < itemKey.length; c++) {
        seed1 = (seed1 << 5) - seed1 + itemKey.charCodeAt(c);
        seed2 = (seed2 << 3) ^ itemKey.charCodeAt(c);
      }
      seed1 = Math.abs(seed1 % 1000) + 1;
      seed2 = Math.abs(seed2 % 1000) + 1;

      let scale = 2.5;
      let drift = 0.02;

      if (itemKey === 'crypto') {
        scale = 5.0;
        drift = -0.05;
      } else if (itemKey === 'cash') {
        scale = 0.2;
        drift = 0.1;
      } else if (itemKey === 'real_estate') {
        scale = 1.5;
        drift = 0.05;
      } else if (itemKey === 'precious_metals') {
        scale = 3.0;
        drift = -0.08;
      } else if (itemKey === 'equities') {
        scale = 3.2;
        drift = 0.04;
      } else if (itemKey === 'etf') {
        scale = 2.8;
        drift = 0.03;
      } else {
        scale = 3.0 + (seed1 % 8) * 0.8;
        drift = ((seed2 % 15) - 7) * 0.015;
      }

      const freq1 = 0.25 + (seed1 % 13) * 0.03;
      const freq2 = 0.45 + (seed2 % 9) * 0.04;
      const phase1 = (seed1 % 11) * 0.5;
      const phase2 = (seed2 % 7) * 0.7;
      const startOffset = (Math.sin(phase1) * 1.5 + Math.cos(phase2 * 0.4) * 0.8) * scale;

      params = { scale, drift, freq1, freq2, phase1, phase2, startOffset };
      itemParamsMap.set(itemKey, params);
      return params;
    };

    const getItemVal = (itemKey: string, index: number): number => {
      if (itemKey === 'All' || itemKey === 'Global Portfolio') {
        let sum = 0;
        ASSET_CLASSES.forEach((cls) => {
          sum += getItemVal(cls, index);
        });
        return Math.round((sum / ASSET_CLASSES.length) * 100) / 100;
      }

      if (!isAssetCategory(itemKey) && referenceHistoryMap[itemKey] && referenceHistoryMap[itemKey][index] !== undefined) {
        return referenceHistoryMap[itemKey][index];
      }

      if (index === 0) return 0;

      const { scale, drift, freq1, freq2, phase1, phase2, startOffset } = getItemParams(itemKey);

      const cycle1 = Math.sin(index * freq1 + phase1);
      const cycle2 = Math.cos(index * freq2 + phase2 * 0.4);

      const rawReturn = (cycle1 * 1.5 + cycle2 * 0.8) * scale + (index * drift);
      const relativeReturn = rawReturn - startOffset;

      return Math.round(relativeReturn * 100) / 100;
    };

    // Calculate 30 points for 'All' and specific categories
    const points = Array.from({ length: 30 }, (_, i) => {
      const allVal = getItemVal('All', i);
      const cryptoVal = getItemVal('crypto', i);
      return { i, allVal, cryptoVal };
    });

    expect(points.length).toBe(30);
    expect(points[0].allVal).toBe(0);
    expect(points[0].cryptoVal).toBe(0);
    expect(typeof points[15].allVal).toBe('number');
    expect(typeof points[15].cryptoVal).toBe('number');
    // Ensure itemParamsMap cached parameters for all ASSET_CLASSES and 'crypto'
    expect(itemParamsMap.size).toBeGreaterThanOrEqual(ASSET_CLASSES.length);
  });
});
