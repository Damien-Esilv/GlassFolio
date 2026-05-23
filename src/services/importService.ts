/**
 * Import Service (Legacy Wrapper)
 * 
 * This file provides backward compatibility for existing code that imports
 * from importService.ts. All functionality has been moved to import/importManager.ts.
 * 
 * @deprecated Use import/importManager.ts directly for new code.
 */

// Re-export everything from the new importManager
export {
    parseFile,
    parseCSVText,
    detectPreset,
    normalizeTransactionType,
    parseDate,
    parseDecimal,
    commitBatch,
    rollbackBatch,
    getImportHistory,
    saveMappingTemplate,
    getMappingTemplates,
    deleteMappingTemplate,
    importManager
} from './import/importManager';

// Re-export types
export type {
    FieldMappings,
    ImportConfig,
    StagedTransaction,
    ParseResult
} from './import/importManager';

// For very old code that might use "importService" namespace
export { importManager as importService } from './import/importManager';
