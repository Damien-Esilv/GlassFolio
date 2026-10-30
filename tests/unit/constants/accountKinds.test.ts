import { describe, it, expect } from 'vitest';
import { ACCOUNT_KINDS, accountKindToFields, fieldsToAccountKind } from '../../../src/constants/accountKinds';

describe('account kinds', () => {
    it('one choice sets both the account type and the tax wrapper', () => {
        expect(accountKindToFields('CTO')).toEqual({ type: 'investment', wrapperType: 'CTO' });
        expect(accountKindToFields('PEA')).toEqual({ type: 'investment', wrapperType: 'PEA' });
        expect(accountKindToFields('CRYPTO')).toEqual({ type: 'crypto_spot', wrapperType: 'OTHER' });
        expect(accountKindToFields('CASH')).toEqual({ type: 'checking', wrapperType: 'OTHER' });
        expect(accountKindToFields('OTHER')).toEqual({ type: 'other', wrapperType: 'OTHER' });
    });

    it('every kind survives a round trip', () => {
        for (const kind of ACCOUNT_KINDS) {
            const { type, wrapperType } = accountKindToFields(kind);
            expect(fieldsToAccountKind(type, wrapperType)).toBe(kind);
        }
    });

    it('returns a copy, so a caller cannot change the table', () => {
        const fields = accountKindToFields('CTO');
        fields.wrapperType = 'PEA';
        expect(accountKindToFields('CTO').wrapperType).toBe('CTO');
    });

    it('places the other account types of demo and older data under the closest kind', () => {
        expect(fieldsToAccountKind('savings', 'LIVRET')).toBe('CASH');
        expect(fieldsToAccountKind('crypto_earn', 'OTHER')).toBe('CRYPTO');
        expect(fieldsToAccountKind('crypto_futures', undefined)).toBe('CRYPTO');
        expect(fieldsToAccountKind('investment', 'PEA_PME')).toBe('PEA');
        expect(fieldsToAccountKind('investment', 'ASSURANCE_VIE')).toBe('OTHER');
        expect(fieldsToAccountKind('investment', 'PER')).toBe('OTHER');
        expect(fieldsToAccountKind('investment', undefined)).toBe('CTO');
        expect(fieldsToAccountKind(undefined, undefined)).toBe('OTHER');
    });
});
