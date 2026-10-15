import { describe, it, expect } from 'vitest';
import { evaluatePassword } from '../../../../src/services/security/passwordValidator';

describe('passwordValidator (NIST SP 800-63B)', () => {
    it('rejects passwords shorter than 12 characters', () => {
        const res = evaluatePassword('Short1!Aa');
        expect(res.isValid).toBe(false);
        const lengthRule = res.rules.find(r => r.id === 'length');
        expect(lengthRule?.passed).toBe(false);
    });

    it('flags common blacklist patterns regardless of length', () => {
        const res = evaluatePassword('password123456789!');
        expect(res.isValid).toBe(false);
        const commonRule = res.rules.find(r => r.id === 'common');
        expect(commonRule?.passed).toBe(false);
    });

    it('flags other known common patterns like admin123 or glassfolio', () => {
        const res1 = evaluatePassword('SuperAdmin123!ExtraLong');
        const commonRule1 = res1.rules.find(r => r.id === 'common');
        expect(commonRule1?.passed).toBe(false);

        const res2 = evaluatePassword('MyGlassFolioPassword2026!');
        const commonRule2 = res2.rules.find(r => r.id === 'common');
        expect(commonRule2?.passed).toBe(false);
    });

    it('accepts strong compliant passwords with 12+ chars and character variety', () => {
        const res = evaluatePassword('Correct-Horse-Battery-Staple-99!');
        expect(res.isValid).toBe(true);
        expect(res.score).toBeGreaterThanOrEqual(3);
        expect(res.estimatedEntropyBits).toBeGreaterThan(60);
        expect(res.rules.every(r => r.passed)).toBe(true);
    });

    it('calculates score 0 for empty or very short strings', () => {
        const resEmpty = evaluatePassword('');
        expect(resEmpty.score).toBe(0);
        expect(resEmpty.isValid).toBe(false);

        const resTiny = evaluatePassword('abc');
        expect(resTiny.score).toBe(0);
        expect(resTiny.isValid).toBe(false);
    });

    it('evaluates rule checks correctly', () => {
        const res = evaluatePassword('alllowercaseonly12chars');
        expect(res.rules.find(r => r.id === 'lowercase')?.passed).toBe(true);
        expect(res.rules.find(r => r.id === 'uppercase')?.passed).toBe(false);
        expect(res.rules.find(r => r.id === 'digit')?.passed).toBe(true);
        expect(res.rules.find(r => r.id === 'symbol')?.passed).toBe(false);
    });
});
