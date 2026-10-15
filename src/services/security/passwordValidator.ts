/**
 * Client-Side NIST SP 800-63B Compliant Password Validator (TGLA-047).
 *
 * Checks:
 *   - Minimum 12 characters.
 *   - Character variety (uppercase, lowercase, digits, symbols).
 *   - Blacklist of trivial patterns and common weak sequences.
 *   - Shannon entropy estimate mapped to 0..4 score.
 */

import { PasswordRuleEvaluation, PasswordValidationResult } from './authTypes';

const MIN_LENGTH = 12;

const COMMON_PATTERNS = [
    'password',
    '12345678',
    'qwertyui',
    'admin123',
    'glassfolio',
    'azertyui',
    'letmein',
    'welcome1',
];

export const evaluatePassword = (password: string): PasswordValidationResult => {
    const trimmed = password ?? '';
    const length = trimmed.length;

    const hasUpper = /[A-Z]/.test(trimmed);
    const hasLower = /[a-z]/.test(trimmed);
    const hasDigit = /[0-9]/.test(trimmed);
    const hasSymbol = /[^A-Za-z0-9]/.test(trimmed);

    const lower = trimmed.toLowerCase();
    const isCommon = COMMON_PATTERNS.some(p => lower.includes(p));

    const rules: PasswordRuleEvaluation[] = [
        { id: 'length', passed: length >= MIN_LENGTH },
        { id: 'uppercase', passed: hasUpper },
        { id: 'lowercase', passed: hasLower },
        { id: 'digit', passed: hasDigit },
        { id: 'symbol', passed: hasSymbol },
        { id: 'common', passed: !isCommon },
    ];

    // Calculate approximate pool size for Shannon entropy
    let poolSize = 0;
    if (hasLower) poolSize += 26;
    if (hasUpper) poolSize += 26;
    if (hasDigit) poolSize += 10;
    if (hasSymbol) poolSize += 33;

    const entropyBits = poolSize > 0 && length > 0
        ? Math.round(length * Math.log2(poolSize))
        : 0;

    // Scoring logic (0 to 4)
    let score: 0 | 1 | 2 | 3 | 4 = 0;
    if (length < 8) {
        score = 0;
    } else if (isCommon) {
        score = 1;
    } else if (length < 12) {
        score = entropyBits > 40 ? 2 : 1;
    } else {
        const passedVarietyCount = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;
        if (passedVarietyCount >= 3 && entropyBits >= 60) {
            score = entropyBits >= 80 ? 4 : 3;
        } else {
            score = 2;
        }
    }

    const isValid = length >= MIN_LENGTH && !isCommon && score >= 3;

    return {
        score,
        rules,
        isValid,
        estimatedEntropyBits: entropyBits,
    };
};
