import { AIToolDefinition } from '../types';
import { parseCSVText } from '../../import/csvParser';
import { detectDateFormat } from '../../import/typeNormalizer';
import { detectPreset } from '../../import/presetDetector';
import {
  matchHistoryColumns,
  matchSnapshotColumns,
  proposeColumnMapping,
  proposalsToMappings,
  HISTORY_COLUMN_SPECS,
  SNAPSHOT_COLUMN_SPECS,
  ColumnStatus,
} from '../../import/columnMatcher';
import {
  parseSnapshotFile,
  getExistingPositions,
  calculateReconciliation,
  commitSnapshotImport,
  SnapshotFieldMappings,
} from '../../import/snapshotService';
import { accountService } from '../../instituteService';
import type { CostBasisMethod } from '../../../types/types.backend';

type CsvImportMode = 'history' | 'snapshot';

interface CsvPreviewResult {
  delimiter: string;
  headerRowIndex: number;
  headers: string[];
  rowCount: number;
  detectedPreset: string | null;
  dateFormat: string | null;
  mapping: Record<string, string | number>;
  unmappedHeaders: string[];
}

interface SnapshotPreviewResult {
  validPositions: number;
  invalidRows: number;
  changes: Array<{
    asset: string;
    action: 'new' | 'increase' | 'decrease' | 'close' | 'cost_basis' | 'unchanged';
    quantityBefore: number;
    quantityAfter: number;
    avgPriceBefore: number;
    avgPriceAfter: number;
  }>;
  investedBefore: number;
  investedAfter: number;
}

const toMapping = (mapping: object): Record<string, string | number> =>
  Object.fromEntries(Object.entries(mapping).filter(([, v]) => v !== undefined && v !== '')) as Record<string, string | number>;

async function analyseSnapshot(accountId: string, csvText: string, closeMissing: boolean) {
  const { headers } = parseCSVText(csvText);
  const mapping = matchSnapshotColumns(headers);
  if (!mapping.quantity || !mapping.avgPrice || (!mapping.assetSymbol && !mapping.assetIsin)) {
    throw new Error('Could not recognise the quantity, average price and symbol/ISIN columns of this snapshot.');
  }
  const parsed = await parseSnapshotFile(csvText, mapping as SnapshotFieldMappings);
  const positions = parsed.positions.filter(p => p.status === 'valid').map(p => p.position);
  const reconciliation = await calculateReconciliation(positions, await getExistingPositions(accountId), { closeMissing });
  return { parsed, positions, reconciliation };
}

export const previewCsvImportTool: AIToolDefinition<{ csvText: string; mode?: CsvImportMode }, CsvPreviewResult> = {
  name: 'preview_csv_import',
  description:
    'Read-only. Detect how a broker/bank CSV export would be imported: delimiter, header row, broker preset, date order and the proposed column mapping (history = transaction journal, snapshot = current holdings). Nothing is saved.',
  parameters: {
    type: 'object',
    properties: {
      csvText: { type: 'string', description: 'Raw CSV content' },
      mode: { type: 'string', description: 'history (transactions) or snapshot (current positions)', enum: ['history', 'snapshot'] },
    },
    required: ['csvText'],
  },
  execute: async ({ csvText, mode = 'history' }) => {
    const { headers, rows, delimiter, headerRowIndex } = parseCSVText(csvText);
    const preset = mode === 'history' ? detectPreset(headers) : null;
    const mapping = toMapping(mode === 'snapshot' ? matchSnapshotColumns(headers) : preset?.mappings ?? matchHistoryColumns(headers));
    const dateColumn = mapping[mode === 'snapshot' ? 'purchaseDate' : 'transactionDate'];
    const dateIdx = typeof dateColumn === 'string' ? headers.indexOf(dateColumn) : -1;
    const used = new Set(Object.values(mapping));

    return {
      delimiter,
      headerRowIndex: headerRowIndex ?? 0,
      headers,
      rowCount: rows.length,
      detectedPreset: preset?.presetName ?? null,
      dateFormat: dateIdx >= 0 ? detectDateFormat(rows.map(r => r[dateIdx] || '')) ?? null : null,
      mapping,
      unmappedHeaders: headers.filter(h => !used.has(h)),
    };
  },
};

interface CsvMappingProposalResult {
  delimiter: string;
  headerRowIndex: number;
  rowCount: number;
  detectedPreset: string | null;
  columns: Array<{
    header: string;
    samples: string[];
    field: string | null;
    status: ColumnStatus;
    alternatives: string[];
  }>;
  summary: { matched: number; ambiguous: number; unmatched: number };
  /** Field -> header, for the matched and ambiguous columns */
  mapping: Record<string, string>;
}

export const proposeCsvMappingTool: AIToolDefinition<{ csvText: string; mode?: CsvImportMode }, CsvMappingProposalResult> = {
  name: 'propose_csv_mapping',
  description:
    'Read-only. Propose which GlassFolio field each column of any broker/bank CSV should feed, from its header and its cells (works on unknown layouts and foreign languages). Every column is reported as matched, ambiguous (a weak or contested guess) or unmatched, with example values and alternatives, so the user only has to decide the doubtful ones. Nothing is saved.',
  parameters: {
    type: 'object',
    properties: {
      csvText: { type: 'string', description: 'Raw CSV content' },
      mode: { type: 'string', description: 'history (transactions) or snapshot (current positions)', enum: ['history', 'snapshot'] },
    },
    required: ['csvText'],
  },
  execute: async ({ csvText, mode = 'history' }) => {
    const { headers, rows, delimiter, headerRowIndex } = parseCSVText(csvText);
    const preset = mode === 'history' ? detectPreset(headers) : null;
    const proposals = mode === 'snapshot'
      ? proposeColumnMapping(headers, rows, SNAPSHOT_COLUMN_SPECS)
      : proposeColumnMapping(headers, rows, HISTORY_COLUMN_SPECS);

    // A known broker format knows better than the generic guess (GlassFolio's own export calls the quantity "amount")
    const presetMapping: Record<string, string | number> = preset ? toMapping(preset.mappings) : {};
    const presetFieldOf = (header: string): string | undefined => Object.keys(presetMapping).find(field => presetMapping[field] === header);
    const columns = proposals.map(p => {
      const presetField = presetFieldOf(p.header);
      return presetField
        ? { header: p.header, samples: p.samples, field: presetField, status: 'matched' as ColumnStatus, alternatives: [] as string[] }
        : { header: p.header, samples: p.samples, field: p.field as string | null, status: p.status, alternatives: p.alternatives as string[] };
    });

    return {
      delimiter,
      headerRowIndex: headerRowIndex ?? 0,
      rowCount: rows.length,
      detectedPreset: preset?.presetName ?? null,
      columns,
      summary: {
        matched: columns.filter(c => c.status === 'matched').length,
        ambiguous: columns.filter(c => c.status === 'ambiguous').length,
        unmatched: columns.filter(c => c.status === 'unmatched').length,
      },
      mapping: preset
        ? Object.fromEntries(Object.entries(presetMapping).map(([field, header]) => [field, String(header)]))
        : (toMapping(proposalsToMappings(proposals)) as Record<string, string>),
    };
  },
};

export const previewSnapshotImportTool: AIToolDefinition<
  { accountId: string; csvText: string; closeMissing?: boolean },
  SnapshotPreviewResult
> = {
  name: 'preview_snapshot_import',
  description:
    'Read-only. Compare a holdings snapshot CSV with the current positions of an account and list what would change (new, increased, decreased, closed positions, average price updates). Nothing is saved.',
  parameters: {
    type: 'object',
    properties: {
      accountId: { type: 'string', description: 'Target account id' },
      csvText: { type: 'string', description: 'Raw snapshot CSV (symbol or ISIN, quantity, average price)' },
      closeMissing: { type: 'boolean', description: 'Close positions absent from the file (default true)' },
    },
    required: ['accountId', 'csvText'],
  },
  execute: async ({ accountId, csvText, closeMissing = true }) => {
    const { parsed, reconciliation } = await analyseSnapshot(accountId, csvText, closeMissing);
    const changes = reconciliation.diffs.map(d => {
      const oldQty = parseFloat(d.oldQty);
      let action: SnapshotPreviewResult['changes'][number]['action'] = 'unchanged';
      if (d.syntheticType !== 'NONE') {
        if (d.isClosure) action = 'close';
        else if (oldQty === 0 && d.direction === 'increase') action = 'new';
        else if (d.direction === 'increase') action = 'increase';
        else if (d.direction === 'decrease') action = 'decrease';
        else action = 'cost_basis';
      }
      return {
        asset: d.displayName,
        action,
        quantityBefore: oldQty,
        quantityAfter: parseFloat(d.newQty),
        avgPriceBefore: parseFloat(d.oldAvgPrice),
        avgPriceAfter: parseFloat(d.newAvgPrice),
      };
    });

    return {
      validPositions: parsed.stats.valid,
      invalidRows: parsed.stats.errors,
      changes,
      investedBefore: reconciliation.diffs.reduce((s, d) => s + parseFloat(d.oldTotalCost), 0),
      investedAfter: reconciliation.diffs.reduce((s, d) => s + parseFloat(d.newTotalCost), 0),
    };
  },
};

export const importSnapshotTool: AIToolDefinition<
  { accountId: string; csvText: string; closeMissing?: boolean; fileName?: string },
  { success: boolean; transactionCount: number; batchId: string | null; message: string }
> = {
  name: 'import_snapshot',
  description:
    'Import a holdings snapshot CSV into an account so its positions match the file exactly (non-fiscal adjustments, re-importing the same file changes nothing). Requires explicit human confirmation before execution. Use preview_snapshot_import first.',
  requiresConfirmation: true,
  parameters: {
    type: 'object',
    properties: {
      accountId: { type: 'string', description: 'Target account id' },
      csvText: { type: 'string', description: 'Raw snapshot CSV' },
      closeMissing: { type: 'boolean', description: 'Close positions absent from the file (default true)' },
      fileName: { type: 'string', description: 'Original file name for the import history' },
    },
    required: ['accountId', 'csvText'],
  },
  execute: async ({ accountId, csvText, closeMissing = true, fileName = 'assistant_snapshot.csv' }, context) => {
    const { parsed, positions } = await analyseSnapshot(accountId, csvText, closeMissing);
    const result = await commitSnapshotImport({
      mode: 'replace',
      positions,
      accountId,
      userId: context?.userId || 'default-user',
      closeMissing,
      rawContent: csvText,
      fileName,
      totalRows: parsed.stats.total,
    });
    return {
      success: result.success,
      transactionCount: result.transactionCount,
      batchId: result.batchId,
      message: result.success
        ? `Snapshot imported: ${result.transactionCount} adjustment(s) recorded.`
        : `Snapshot import failed: ${result.error ?? 'unknown error'}`,
    };
  },
};

export const getCostBasisMethodTool: AIToolDefinition<
  { accountId?: string },
  Array<{ accountId: string; name: string; method: CostBasisMethod }>
> = {
  name: 'get_cost_basis_method',
  description:
    'Read-only. Return the cost basis method of accounts: WAC (weighted average cost, French PRU) or FIFO (first in, first out lots).',
  parameters: {
    type: 'object',
    properties: {
      accountId: { type: 'string', description: 'Optional account id; all accounts when omitted' },
    },
  },
  execute: async ({ accountId }) => {
    const accounts = await accountService.getAccounts();
    return accounts
      .filter(a => !accountId || a.id === accountId)
      .map(a => ({ accountId: a.id, name: a.name, method: a.costBasisMethod ?? 'WAC' }));
  },
};

export const setCostBasisMethodTool: AIToolDefinition<
  { accountId: string; method: CostBasisMethod },
  { success: boolean; message: string }
> = {
  name: 'set_cost_basis_method',
  description:
    'Change the cost basis method of an account (WAC = weighted average cost / PRU, FIFO = first in first out) and recompute its positions and realized P&L. Requires explicit human confirmation before execution.',
  requiresConfirmation: true,
  parameters: {
    type: 'object',
    properties: {
      accountId: { type: 'string', description: 'Account id' },
      method: { type: 'string', description: 'WAC or FIFO', enum: ['WAC', 'FIFO'] },
    },
    required: ['accountId', 'method'],
  },
  execute: async ({ accountId, method }) => {
    const updated = await accountService.setCostBasisMethod(accountId, method);
    return updated
      ? { success: true, message: `Account '${updated.name}' now uses ${method}.` }
      : { success: false, message: `Account ${accountId} not found.` };
  },
};
