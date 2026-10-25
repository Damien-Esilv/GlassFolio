/**
 * Mapping Template Service
 * 
 * Manages user-defined mapping profiles for CSV imports (history, snapshot and
 * cash wizards). A profile stores the column mapping plus the date format and
 * delimiter, and the header signature used to suggest it for similar files.
 */

import { MappingTemplate, MappingTemplateMode } from '../../types/types.backend';
import { db, delay } from '../db';
import { tokenizeHeader } from './columnMatcher';

export interface SaveMappingTemplateOptions {
    userId?: string;
    instituteId?: string;
    dateFormat?: string;
    delimiter?: string;
    mode?: MappingTemplateMode;
    /** Headers of the current file, used to compute the signature */
    headers?: string[];
}

export interface MappingTemplateFilter {
    mode?: MappingTemplateMode;
    instituteId?: string;
}

/**
 * Order-independent signature of a header row ("Date;Montant" ≡ "montant,date").
 */
export function computeHeaderSignature(headers: string[]): string {
    return headers
        .map(h => tokenizeHeader(h).join('_'))
        .filter(Boolean)
        .sort()
        .join('|');
}

const templateMode = (template: MappingTemplate): MappingTemplateMode => template.mode ?? 'history';

/**
 * Save a mapping template.
 * The third argument accepts an options object; a plain string is still read
 * as the legacy `userId` parameter.
 */
export async function saveMappingTemplate(
    name: string,
    mappings: object,
    options: SaveMappingTemplateOptions | string = {}
): Promise<MappingTemplate> {
    await delay(200);

    const opts: SaveMappingTemplateOptions = typeof options === 'string' ? { userId: options } : options;
    const now = new Date().toISOString();
    const cleanMappings: Record<string, string | number> = {};
    Object.entries(mappings).forEach(([field, value]) => {
        if (typeof value === 'string' ? value !== '' : typeof value === 'number') cleanMappings[field] = value;
    });

    const template: MappingTemplate = {
        id: `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        ownerId: opts.userId || 'default-user',
        name,
        instituteId: opts.instituteId,
        mappings: cleanMappings,
        dateFormat: opts.dateFormat,
        delimiter: opts.delimiter,
        mode: opts.mode ?? 'history',
        headerSignature: opts.headers ? computeHeaderSignature(opts.headers) : undefined,
        isPreset: false,
        createdAt: now,
        updatedAt: now
    };

    const templates = db.getMappingTemplates();
    db.saveMappingTemplates([...templates, template]);

    return template;
}

/**
 * Get mapping templates, optionally restricted to a wizard mode and institute
 * (profiles without institute apply everywhere).
 */
export async function getMappingTemplates(filter: MappingTemplateFilter = {}): Promise<MappingTemplate[]> {
    await delay(100);
    return db.getMappingTemplates().filter(t =>
        (!filter.mode || templateMode(t) === filter.mode) &&
        (!filter.instituteId || !t.instituteId || t.instituteId === filter.instituteId)
    );
}

/**
 * Rename a user template (system presets are read-only).
 */
export async function renameMappingTemplate(id: string, name: string): Promise<boolean> {
    await delay(100);
    const templates = db.getMappingTemplates();
    const target = templates.find(t => t.id === id);
    if (!target || target.isPreset || !name.trim()) return false;
    db.saveMappingTemplates(templates.map(t =>
        t.id === id ? { ...t, name: name.trim(), updatedAt: new Date().toISOString() } : t
    ));
    return true;
}

/**
 * Delete a user template by ID (system presets cannot be deleted).
 */
export async function deleteMappingTemplate(id: string): Promise<boolean> {
    await delay(100);
    const templates = db.getMappingTemplates();
    const target = templates.find(t => t.id === id);
    if (!target || target.isPreset) return false;
    db.saveMappingTemplates(templates.filter(t => t.id !== id));
    return true;
}

/**
 * Suggest the profile that best fits a file: identical header signature first,
 * otherwise the profile whose mapped columns all exist in the file (most fields wins).
 */
export function findTemplateForHeaders(templates: MappingTemplate[], headers: string[]): MappingTemplate | null {
    const signature = computeHeaderSignature(headers);
    const exact = templates.find(t => t.headerSignature && t.headerSignature === signature);
    if (exact) return exact;

    const headerSet = new Set(headers);
    let best: MappingTemplate | null = null;
    let bestCount = 0;
    for (const template of templates) {
        const columns = Object.values(template.mappings).filter((v): v is string => typeof v === 'string');
        if (columns.length === 0 || !columns.every(c => headerSet.has(c))) continue;
        if (columns.length > bestCount) {
            best = template;
            bestCount = columns.length;
        }
    }
    return best;
}
