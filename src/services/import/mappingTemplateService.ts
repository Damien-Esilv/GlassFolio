/**
 * Mapping Template Service
 * 
 * Manages custom user-defined mapping templates for CSV imports.
 */

import { MappingTemplate } from '../../types/types.backend';
import { FieldMappings } from './types';
import { db, delay } from '../db';

/**
 * Save or update a mapping template
 */
export async function saveMappingTemplate(
    name: string,
    mappings: FieldMappings,
    userId: string = 'default-user',
    instituteId?: string,
    dateFormat?: string,
    delimiter?: string
): Promise<MappingTemplate> {
    await delay(200);

    const now = new Date().toISOString();
    const template: MappingTemplate = {
        id: `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        ownerId: userId,
        name,
        instituteId,
        mappings: mappings as unknown as Record<string, string | number>,
        dateFormat,
        delimiter,
        isPreset: false,
        createdAt: now,
        updatedAt: now
    };

    const templates = db.getMappingTemplates();
    db.saveMappingTemplates([...templates, template]);

    return template;
}

/**
 * Get all mapping templates
 */
export async function getMappingTemplates(): Promise<MappingTemplate[]> {
    await delay(100);
    return db.getMappingTemplates();
}

/**
 * Delete a mapping template by ID
 */
export async function deleteMappingTemplate(id: string): Promise<boolean> {
    await delay(100);
    const templates = db.getMappingTemplates();
    const filtered = templates.filter(t => t.id !== id);
    if (filtered.length === templates.length) return false;
    db.saveMappingTemplates(filtered);
    return true;
}
