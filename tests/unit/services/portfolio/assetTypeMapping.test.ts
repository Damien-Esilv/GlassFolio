import { describe, it, expect } from 'vitest';
import { instrumentTypeToPositionType } from '../../../../src/services/portfolio/assetTypeMapping';
import { isAssetClassMatch } from '../../../../src/constants/assetClasses';

describe('instrumentTypeToPositionType', () => {
    it.each([
        ['stock', 'Equity'],
        ['etf', 'ETF'],
        ['fund', 'ETF'],
        ['crypto', 'Crypto'],
        ['cash', 'Cash'],
        ['bond', 'Other'],
        ['other', 'Other'],
    ] as const)('maps %s to %s', (type, expected) => {
        expect(instrumentTypeToPositionType(type)).toBe(expected);
    });

    it('keeps a row without instrument as an equity', () => {
        expect(instrumentTypeToPositionType(undefined)).toBe('Equity');
    });

    it('produces classes the Positions filters recognise, including Other', () => {
        expect(isAssetClassMatch(instrumentTypeToPositionType('other'), 'Other')).toBe(true);
        expect(isAssetClassMatch(instrumentTypeToPositionType('other'), 'ETFs')).toBe(false);
        expect(isAssetClassMatch(instrumentTypeToPositionType('fund'), 'ETFs')).toBe(true);
    });
});
