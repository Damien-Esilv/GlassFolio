/**
 * Instrument drafts of an import in review.
 *
 * Parsing a file used to create its new instruments on the spot, so cancelling the wizard left orphans
 * behind. They now stay drafts here until the import is confirmed (`commitBatch` persists the ones its
 * rows use). A draft can be edited, or merged into an instrument that already exists: rows pointing at it
 * follow through an alias.
 */

import type { Instrument } from '../../types';
import { db } from '../db';
import {
    InstrumentIssue,
    InstrumentPatch,
    InstrumentValidationError,
    applyInstrumentPatch,
    findDuplicateInstruments,
    isInstrumentMarketReady,
    validateInstrumentDraft,
} from '../instrumentService';

const drafts = new Map<string, Instrument>();
/** Draft id -> id of the instrument it was merged into. */
const aliases = new Map<string, string>();

export function stageInstrument(instrument: Instrument): void {
    drafts.set(instrument.id, instrument);
}

export function clearStagedInstruments(): void {
    drafts.clear();
    aliases.clear();
}

export function getStagedInstrument(id: string): Instrument | undefined {
    return drafts.get(resolveInstrumentId(id));
}

export function isStagedInstrument(id: string): boolean {
    return drafts.has(resolveInstrumentId(id));
}

/** The instrument a row points at, following merges. */
export function resolveInstrumentId(id: string): string {
    let current = id;
    for (let hops = 0; aliases.has(current) && hops < 10; hops++) current = aliases.get(current) as string;
    return current;
}

/** The instrument for an id: a draft, else a persisted one. */
export function findInstrument(id: string): Instrument | undefined {
    const resolved = resolveInstrumentId(id);
    return drafts.get(resolved) ?? db.getInstrumentById(resolved);
}

const othersOf = (id: string): Instrument[] => [
    ...db.getInstruments().filter(i => i.id !== id),
    ...[...drafts.values()].filter(d => d.id !== id),
];

/** Live integrity checks of a draft being edited. */
export function previewStagedIssues(id: string, patch: InstrumentPatch): InstrumentIssue[] {
    const current = drafts.get(resolveInstrumentId(id));
    if (!current) return [];
    return validateInstrumentDraft(applyInstrumentPatch(current, patch), othersOf(current.id));
}

/**
 * Edit a draft. Errors (and a duplicate without `mergeInto`) throw an InstrumentValidationError.
 * With `mergeInto` the draft disappears into that instrument; the returned instrument is the one kept.
 */
export function updateStagedInstrument(id: string, patch: InstrumentPatch, mergeInto?: string): Instrument {
    const current = drafts.get(resolveInstrumentId(id));
    if (!current) throw new Error('INSTRUMENT_NOT_FOUND');

    const draft = applyInstrumentPatch(current, patch);
    const others = othersOf(current.id);
    const issues = validateInstrumentDraft(draft, others);
    const target = mergeInto ? findDuplicateInstruments(draft, others).find(d => d.id === mergeInto) : undefined;
    if (mergeInto && !target) throw new Error('INSTRUMENT_MERGE_TARGET_INVALID');
    if (issues.some(i => i.severity === 'error' && !(target && i.code === 'INSTRUMENT_DUPLICATE'))) {
        throw new InstrumentValidationError(issues);
    }

    const saved: Instrument = { ...draft, isMarketReady: isInstrumentMarketReady(draft), updatedAt: new Date().toISOString() };
    if (!target) {
        drafts.set(current.id, saved);
        return saved;
    }

    // Merged: the target keeps its own fields, the draft only completes what the target lacks
    const t = target.marketIdentifier;
    const s = saved.marketIdentifier;
    const merged: Instrument = {
        ...target,
        marketIdentifier: {
            ...t,
            isin: t.isin ?? s.isin,
            exchange: t.exchange ?? s.exchange,
            network: t.network ?? s.network,
            contractAddress: t.contractAddress ?? s.contractAddress,
        },
    };
    merged.isMarketReady = isInstrumentMarketReady(merged);
    drafts.delete(current.id);
    aliases.set(current.id, target.id);
    if (drafts.has(target.id)) drafts.set(target.id, merged);
    else db.saveInstruments(db.getInstruments().map(i => (i.id === target.id ? merged : i)));
    return merged;
}

/**
 * Persists the drafts the given ids point at (after following merges). A draft whose twin has appeared
 * in the meantime (same ISIN or symbol) is merged into it instead. Returns the ids actually added, so a
 * failed commit can take them back.
 */
export function commitStagedInstruments(ids: Iterable<string>): string[] {
    const added: Instrument[] = [];
    const persisted = db.getInstruments();
    for (const id of new Set([...ids].map(resolveInstrumentId))) {
        const draft = drafts.get(id);
        if (!draft) continue;
        const twin = findDuplicateInstruments(draft, [...persisted, ...added])[0];
        if (twin) {
            aliases.set(draft.id, twin.id);
            drafts.delete(draft.id);
            continue;
        }
        added.push(draft);
    }
    if (added.length > 0) db.saveInstruments([...persisted, ...added]);
    return added.map(i => i.id);
}

/** Takes back instruments persisted by a commit that then failed. */
export function removeInstruments(ids: string[]): void {
    if (ids.length === 0) return;
    const gone = new Set(ids);
    db.saveInstruments(db.getInstruments().filter(i => !gone.has(i.id)));
}
