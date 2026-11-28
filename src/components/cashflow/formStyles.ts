/**
 * Shared look of the cash flow forms and dialogs (Epic E52): every field and button has the same height, so a select,
 * a text field and its button line up; dialogs open without an entrance animation.
 */
export const CASHFLOW_FIELD = 'h-10 px-3 rounded-xl bg-subtle text-primary border border-subtle focus:ring-primary focus:border-primary text-sm';
export const CASHFLOW_TEXTAREA = 'w-full px-3 py-2 rounded-xl bg-subtle text-primary border border-subtle focus:ring-primary focus:border-primary text-sm';
const BUTTON = 'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold shrink-0 disabled:opacity-50';
export const CASHFLOW_PRIMARY_BUTTON = `${BUTTON} bg-primary text-white hover:bg-primary/90`;
export const CASHFLOW_GHOST_BUTTON = `${BUTTON} text-secondary hover:bg-subtle`;
export const CASHFLOW_DANGER_BUTTON = `${BUTTON} text-negative hover:bg-negative-subtle`;
export const CASHFLOW_DIALOG_BACKDROP = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm';
