/**
 * Reads and writes the bank hints of a journal row (`metadata.bankHints`). The CSV importer, the OFX
 * reader and the Woob sync all write this shape; the categoriser reads it (Epic E52).
 */
import type { BankHints } from '../../types/cashflow';

const HINT_KEYS: readonly (keyof BankHints)[] = ['category', 'categoryParent', 'txType', 'counterparty'];

const cleanHint = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim().slice(0, 120);
    return trimmed.length > 0 ? trimmed : undefined;
};

/** Typed, defensive read: metadata comes from files and providers. */
export function readBankHints(metadata: Record<string, unknown> | undefined | null): BankHints {
    const raw = metadata?.bankHints;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const source = raw as Record<string, unknown>;
    const hints: BankHints = {};
    for (const key of HINT_KEYS) {
        const value = cleanHint(source[key]);
        if (value) hints[key] = value;
    }
    return hints;
}

/** Merges hints into existing metadata without dropping what is already there. */
export function withBankHints(
    metadata: Record<string, unknown> | undefined,
    hints: BankHints,
): Record<string, unknown> | undefined {
    const clean: BankHints = {};
    for (const key of HINT_KEYS) {
        const value = cleanHint(hints[key]);
        if (value) clean[key] = value;
    }
    if (Object.keys(clean).length === 0) return metadata;
    return { ...(metadata ?? {}), bankHints: { ...readBankHints(metadata), ...clean } };
}
