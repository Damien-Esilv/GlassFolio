/**
 * Registry of the sync source adapters (TGLA-221). Adding a source = registering one adapter;
 * the engine, the store and the UI read everything else from here.
 */
import type { SourceId } from '../../types/connections';
import type { SourceAdapter } from './types';

const adapters = new Map<SourceId, SourceAdapter>();

export const sourceRegistry = {
    register(adapter: SourceAdapter): void {
        adapters.set(adapter.id, adapter);
    },

    get(id: SourceId): SourceAdapter | undefined {
        return adapters.get(id);
    },

    list(): SourceAdapter[] {
        return [...adapters.values()];
    },

    /** Test helper: forget every adapter. */
    clear(): void {
        adapters.clear();
    },
};
