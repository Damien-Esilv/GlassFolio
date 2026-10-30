import type { InstrumentType } from '../../types';

/** Asset class shown for a position and carried by a transaction. */
export type PositionAssetType = 'Equity' | 'ETF' | 'Crypto' | 'Cash' | 'Other';

/**
 * Single mapping from an instrument type to the asset class shown in the app (positions, transactions).
 * `other` and `bond` have no price tracker: they land in "Other" and are priced by hand.
 * No instrument (legacy rows): equity.
 */
export const instrumentTypeToPositionType = (type: InstrumentType | undefined): PositionAssetType => {
    switch (type) {
        case undefined: return 'Equity';
        case 'stock': return 'Equity';
        case 'etf':
        case 'fund': return 'ETF';
        case 'crypto': return 'Crypto';
        case 'cash': return 'Cash';
        case 'bond':
        case 'other': return 'Other';
        default: return 'Equity';
    }
};
