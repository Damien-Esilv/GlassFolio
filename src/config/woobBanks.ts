/**
 * French banks through the local Woob worker (TGLA-236, TGLA-240).
 *
 * The list of banks and their credential forms comes from the worker at run time (every bank module of
 * the Woob version shipped: `woobClient.status()`), never from here. This file only holds what GlassFolio
 * itself knows about some of them: which one was tested on a real account, and known limits from the
 * feasibility study (Obsidian GlassFolio/02-Features/FEAT-E03-Woob-Etude-Faisabilite.md).
 */

/** Banks tested by GlassFolio on a real account; the others are offered as "not verified". */
export const VERIFIED_WOOB_BANKS: readonly string[] = ['boursorama'];

/** Translated under `settings:connections.banks.limits.<limit>`. */
export type WoobBankLimit = 'strongAuth' | 'validationEachLogin';

export const WOOB_BANK_LIMITS: Readonly<Record<string, WoobBankLimit>> = {
    // Woob does not perform their strong authentication: it asks to do it on the bank's website
    bnp: 'strongAuth',
    lcl: 'strongAuth',
    ing: 'strongAuth',
    // Its headless-browser login needs a browser GlassFolio does not ship: the classic login asks a code each time
    bp: 'validationEachLogin',
};

/** Current brand names where Woob still uses an older one. */
export const WOOB_BANK_DISPLAY_NAMES: Readonly<Record<string, string>> = {
    boursorama: 'BoursoBank',
};

export const woobBankName = (bank: { module: string; name: string }): string => WOOB_BANK_DISPLAY_NAMES[bank.module] ?? bank.name;

/** Credential fields with a translated label (`settings:connections.banks.fields.<id>`); others keep the bank's own label. */
export const TRANSLATED_WOOB_FIELDS: readonly string[] = ['login', 'password', 'birthdate'];

export const isVerifiedWoobBank = (module: string | undefined): boolean => Boolean(module && VERIFIED_WOOB_BANKS.includes(module));
