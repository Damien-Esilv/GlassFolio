import { describe, it, expect } from 'vitest';
import {
  ASSET_CLASSES_CONFIG,
  ASSET_CLASSES,
  DEFAULT_OTHER_CONFIG,
  getAssetClassConfig,
  getCanonicalAssetClass,
  isAssetClassMatch,
} from '../../../src/constants/assetClasses';
import { positions as mockPositions } from '../../../src/services/mockData';

describe('Asset Classes & Allocation Configuration', () => {
  it('includes Other in ASSET_CLASSES_CONFIG with dedicated cyan theme token', () => {
    const other = ASSET_CLASSES_CONFIG.find(c => c.id === 'Other');
    expect(other).toBeDefined();
    expect(other?.i18nKey).toBe('other');
    expect(other?.hex).toBe('var(--color-accent-cyan)');
    expect(other?.color).toBe('accent-cyan');
    expect(ASSET_CLASSES).toContain('Other');
  });

  it('correctly maps variations of other/autre to canonical Other', () => {
    const variations = ['Other', 'other', 'Autre', 'autre', 'Divers', 'divers', 'RealEstate', 'Bond'];
    variations.forEach(type => {
      expect(getCanonicalAssetClass(type)).toBe('Other');
      expect(isAssetClassMatch(type, 'Other')).toBe(true);
    });
  });

  it('assigns deterministic theme colors for custom unlisted asset classes', () => {
    const customConfig = getAssetClassConfig('CustomPreciousMetals');
    expect(customConfig).toBeDefined();
    expect(customConfig.hex).toContain('var(--color-accent-');
    expect(customConfig.id).toBe('CustomPreciousMetals');
  });

  it('demo mode: contains only Equities, ETFs, Crypto and Cash, no Other', () => {
    const typesInDemo = new Set(mockPositions.map(p => getCanonicalAssetClass(p.type)));
    expect(typesInDemo.has('Other')).toBe(false);
    expect(typesInDemo.has('Equities')).toBe(true);
    expect(typesInDemo.has('ETFs')).toBe(true);
    expect(typesInDemo.has('Crypto')).toBe(true);
    expect(typesInDemo.has('Cash')).toBe(true);
  });

  it('when an Other asset exists, it dynamically adds itself with its own color and label', () => {
    const positionsWithOther = [
      ...mockPositions,
      {
        id: 'gold-1',
        instrument: 'Lingot Or 50g',
        symbol: 'GOLD',
        quantity: 1,
        avgCost: 3500,
        lastPrice: 4000,
        marketValue: 4000,
        unrealizedPL: 500,
        unrealizedPLPercent: 14.28,
        currency: 'EUR',
        type: 'Other',
        source: 'Coffre',
      },
    ];

    const total = positionsWithOther.reduce((sum, p) => sum + p.marketValue, 0);
    const classTotals: Record<string, number> = {};
    positionsWithOther.forEach(p => {
      const canonicalId = getCanonicalAssetClass(p.type);
      classTotals[canonicalId] = (classTotals[canonicalId] || 0) + p.marketValue;
    });

    const breakdown = Object.entries(classTotals).map(([assetClassId, val]) => {
      const config = getAssetClassConfig(assetClassId);
      return {
        type: assetClassId,
        value: val,
        percentage: (val / total) * 100,
        color: config?.hex,
      };
    });

    const otherEntry = breakdown.find(b => b.type === 'Other');
    expect(otherEntry).toBeDefined();
    expect(otherEntry?.color).toBe('var(--color-accent-cyan)');
    expect(otherEntry?.percentage).toBeGreaterThan(0);
  });
});
