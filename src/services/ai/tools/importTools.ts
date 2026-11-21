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
  parseFile,
  revalidateStagedRow,
  commitBatch,
  type FieldMappings,
  type ParseResult,
} from '../../import/importManager';
import { clearStagedInstruments } from '../../import/instrumentDrafts';
import {
  parseSnapshotFile,
  getExistingPositions,
  calculateReconciliation,
  commitSnapshotImport,
  SnapshotFieldMappings,
} from '../../import/snapshotService';
import { db } from '../../db';
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
  const keepAssets = parsed.positions.filter(p => p.status !== 'valid').map(p => p.position);
  const reconciliation = await calculateReconciliation(positions, await getExistingPositions(accountId), { closeMissing, keepAssets });
  return { parsed, positions, keepAssets, reconciliation };
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
    const { parsed, positions, keepAssets } = await analyseSnapshot(accountId, csvText, closeMissing);
    const result = await commitSnapshotImport({
      mode: 'replace',
      positions,
      accountId,
      userId: context?.userId || 'default-user',
      closeMissing,
      keepAssets,
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

// ============================================================================
// E37 — AI-DRIVEN TRANSACTION HISTORY PREVIEW & IMPORT
// ============================================================================

export interface ExtractedTransactionRow {
  date: string;
  type: string;
  symbol?: string;
  isin?: string;
  name?: string;
  quantity?: string | number;
  price?: string | number;
  amount: string | number;
  fee?: string | number;
  feeAsset?: string;
  tax?: string | number;
  currency?: string;
  label?: string;
}

export interface TransactionImportInput {
  accountId?: string;
  csvText?: string;
  mapping?: Record<string, string>;
  rows?: ExtractedTransactionRow[];
  fileName?: string;
}

export interface TransactionSampleRow {
  date: string;
  type: string;
  asset: string;
  quantity?: string;
  amount: string;
  currency?: string;
  status: string;
}

export interface TransactionImportPreviewResult {
  accountId: string;
  accountName: string;
  fileName: string;
  detectedPreset: string | null;
  stats: {
    total: number;
    valid: number;
    warnings: number;
    duplicates: number;
    errors: number;
    importable: number;
  };
  dateRange: { start: string; end: string } | null;
  newInstruments: string[];
  sampleRows: TransactionSampleRow[];
  errorSamples: Array<{ rowIndex: number; message: string }>;
}

const CANONICAL_ROW_HEADERS = [
  'date',
  'type',
  'symbol',
  'isin',
  'name',
  'quantity',
  'price',
  'amount',
  'fee',
  'feeAsset',
  'tax',
  'currency',
  'label',
] as const;

const CANONICAL_ROW_MAPPINGS: FieldMappings = {
  transactionDate: 'date',
  type: 'type',
  assetSymbol: 'symbol',
  assetIsin: 'isin',
  assetName: 'name',
  quantity: 'quantity',
  priceUnit: 'price',
  amountPrimary: 'amount',
  feeAmount: 'fee',
  feeAsset: 'feeAsset',
  taxAmount: 'tax',
  currency: 'currency',
  rawLabel: 'label',
};

const escapeCsvField = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  const str = String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

function rowsToCanonicalCsv(rows: ExtractedTransactionRow[]): string {
  const headerLine = CANONICAL_ROW_HEADERS.join(',');
  const bodyLines = rows.map((row) =>
    CANONICAL_ROW_HEADERS.map((key) => escapeCsvField(row[key])).join(',')
  );
  return [headerLine, ...bodyLines].join('\n');
}

function resolveTargetAccount(accountId?: string) {
  const accounts = db.getAccounts();
  if (accountId && accountId.trim()) {
    const found = db.getAccountById(accountId.trim());
    if (!found) {
      const choices = accounts.map((a) => `${a.name} (${a.id})`).join(', ');
      throw new Error(
        `Account '${accountId}' not found.${choices ? ` Available accounts: ${choices}` : ''}`
      );
    }
    return found;
  }

  const active = accounts.filter((a) => a.isActive !== false);
  if (active.length === 1) return active[0];
  if (accounts.length === 1) return accounts[0];
  if (accounts.length === 0) {
    throw new Error('No account available. Create an account before importing transactions.');
  }
  const list = (active.length > 0 ? active : accounts).map((a) => `${a.name} [${a.id}]`).join(', ');
  throw new Error(`Multiple accounts exist (${list}). Specify accountId.`);
}

function resolveCsvCustomMappings(
  csvText: string,
  explicitMapping?: Record<string, string>
): { mappings: FieldMappings; detectedPreset: string | null } {
  const { headers, rows } = parseCSVText(csvText);
  if (explicitMapping && Object.keys(explicitMapping).length > 0) {
    return {
      mappings: {
        transactionDate: explicitMapping.transactionDate ?? '',
        amountPrimary: explicitMapping.amountPrimary ?? '',
        ...explicitMapping,
      } as FieldMappings,
      detectedPreset: null,
    };
  }

  const preset = detectPreset(headers);
  if (preset) {
    return { mappings: preset.mappings, detectedPreset: preset.presetName };
  }

  const proposals = proposeColumnMapping(headers, rows, HISTORY_COLUMN_SPECS);
  const proposed = proposalsToMappings(proposals);
  const heuristic = matchHistoryColumns(headers);
  return {
    mappings: {
      ...heuristic,
      ...proposed,
      transactionDate: proposed.transactionDate ?? heuristic.transactionDate ?? '',
      amountPrimary: proposed.amountPrimary ?? heuristic.amountPrimary ?? '',
    } as FieldMappings,
    detectedPreset: null,
  };
}

async function stageTransactionsInput(input: TransactionImportInput): Promise<{
  account: ReturnType<typeof resolveTargetAccount>;
  parsed: ParseResult;
  detectedPreset: string | null;
  fileName: string;
}> {
  const hasCsv = typeof input.csvText === 'string' && input.csvText.trim().length > 0;
  const hasRows = Array.isArray(input.rows) && input.rows.length > 0;
  if (!hasCsv && !hasRows) {
    throw new Error('Provide either csvText or a non-empty rows array.');
  }

  const account = resolveTargetAccount(input.accountId);
  let effectiveCsv: string;
  let customMappings: FieldMappings;
  let detectedPreset: string | null = null;
  const fromRows = !hasCsv && hasRows;

  if (hasCsv) {
    effectiveCsv = input.csvText as string;
    const resolved = resolveCsvCustomMappings(effectiveCsv, input.mapping);
    customMappings = resolved.mappings;
    detectedPreset = resolved.detectedPreset;
  } else {
    effectiveCsv = rowsToCanonicalCsv(input.rows as ExtractedTransactionRow[]);
    customMappings = CANONICAL_ROW_MAPPINGS;
  }

  const parsed = await parseFile(effectiveCsv, {
    accountId: account.id,
    mode: 'history',
    customMappings,
  });

  if (fromRows) {
    parsed.candidates = parsed.candidates.map((c) => revalidateStagedRow(c, 'history'));
    parsed.stats = {
      total: parsed.candidates.length,
      valid: parsed.candidates.filter((c) => c.status === 'valid').length,
      errors: parsed.candidates.filter((c) => c.status === 'error').length,
      duplicates: parsed.candidates.filter((c) => c.status === 'duplicate').length,
      warnings: parsed.candidates.filter((c) => c.status === 'warning').length,
    };
  }

  return {
    account,
    parsed,
    detectedPreset: parsed.detectedPreset ?? detectedPreset,
    fileName: input.fileName?.trim() || (fromRows ? 'assistant_extracted.csv' : 'assistant_import.csv'),
  };
}

function summarizeStagedImport(
  account: ReturnType<typeof resolveTargetAccount>,
  parsed: ParseResult,
  detectedPreset: string | null,
  fileName: string
): TransactionImportPreviewResult {
  const importable = parsed.candidates.filter(
    (c) =>
      c.status !== 'error' &&
      (c.resolution === 'import' ||
        (c.status === 'valid' && c.resolution === 'pending') ||
        (c.status === 'warning' && c.resolution === 'pending'))
  );

  const dates = parsed.candidates
    .map((c) => c.parsed.transactionDate)
    .filter((d): d is string => Boolean(d))
    .sort();

  const dateRange =
    dates.length > 0
      ? { start: dates[0].slice(0, 10), end: dates[dates.length - 1].slice(0, 10) }
      : null;

  const sampleRows: TransactionSampleRow[] = parsed.candidates.slice(0, 10).map((c) => ({
    date: (c.parsed.transactionDate ?? '').slice(0, 10),
    type: String(c.parsed.type ?? 'BUY'),
    asset: c.parsed.assetSymbol || c.parsed.assetIsin || '-',
    ...(c.parsed.quantity ? { quantity: c.parsed.quantity } : {}),
    amount: c.parsed.amountPrimary ?? '0',
    ...(c.parsed.originalCurrency ? { currency: c.parsed.originalCurrency } : {}),
    status: c.status,
  }));

  const errorSamples = parsed.candidates
    .filter((c) => c.status === 'error')
    .slice(0, 5)
    .map((c) => ({
      rowIndex: c.rowIndex + 1,
      message: c.errors.find((e) => e.severity === 'error')?.message ?? 'Invalid row',
    }));

  const newInstruments = parsed.instruments
    .filter((inst) => inst.isNew)
    .map((inst) => inst.instrument.marketIdentifier.symbol);

  return {
    accountId: account.id,
    accountName: account.name,
    fileName,
    detectedPreset,
    stats: {
      total: parsed.stats.total,
      valid: parsed.stats.valid,
      warnings: parsed.stats.warnings,
      duplicates: parsed.stats.duplicates,
      errors: parsed.stats.errors,
      importable: importable.length,
    },
    dateRange,
    newInstruments,
    sampleRows,
    errorSamples,
  };
}

/**
 * Compute lightweight preview metadata for the Human-in-the-loop approval card without
 * persisting staged instrument drafts.
 */
export async function buildTransactionImportPreview(
  rawArgs: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    const input: TransactionImportInput = {
      accountId: typeof rawArgs.accountId === 'string' ? rawArgs.accountId : undefined,
      csvText: typeof rawArgs.csvText === 'string' ? rawArgs.csvText : undefined,
      mapping:
        rawArgs.mapping && typeof rawArgs.mapping === 'object' && !Array.isArray(rawArgs.mapping)
          ? (rawArgs.mapping as Record<string, string>)
          : undefined,
      rows: Array.isArray(rawArgs.rows) ? (rawArgs.rows as ExtractedTransactionRow[]) : undefined,
      fileName: typeof rawArgs.fileName === 'string' ? rawArgs.fileName : undefined,
    };
    const staged = await stageTransactionsInput(input);
    const summary = summarizeStagedImport(
      staged.account,
      staged.parsed,
      staged.detectedPreset,
      staged.fileName
    );
    return {
      accountName: summary.accountName,
      fileName: summary.fileName,
      validCount: summary.stats.valid + summary.stats.warnings,
      duplicateCount: summary.stats.duplicates,
      errorCount: summary.stats.errors,
      totalCount: summary.stats.total,
      importableCount: summary.stats.importable,
      dateRange: summary.dateRange,
      sampleRows: summary.sampleRows.slice(0, 5),
    };
  } catch (err) {
    return {
      fileName: typeof rawArgs.fileName === 'string' ? rawArgs.fileName : 'assistant_import.csv',
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearStagedInstruments();
  }
}

const EXTRACTED_ROW_SCHEMA = {
  type: 'object',
  description: 'One transaction row extracted from a PDF or screenshot',
  properties: {
    date: { type: 'string', description: 'Transaction date in ISO YYYY-MM-DD format' },
    type: {
      type: 'string',
      description: 'Transaction type (BUY, SELL, DEPOSIT, WITHDRAW, INCOME, EXPENSE, TRANSFER, SWAP)',
    },
    symbol: { type: 'string', description: 'Asset ticker symbol (e.g. AAPL, BTC, EUR)' },
    isin: { type: 'string', description: 'Optional 12-character ISIN code' },
    name: { type: 'string', description: 'Optional instrument name' },
    quantity: { type: 'string', description: 'Optional unit quantity' },
    price: { type: 'string', description: 'Optional unit price' },
    amount: { type: 'string', description: 'Cash amount of the transaction' },
    fee: { type: 'string', description: 'Optional fee amount' },
    feeAsset: { type: 'string', description: 'Optional fee asset/currency code' },
    tax: { type: 'string', description: 'Optional withholding tax amount' },
    currency: { type: 'string', description: 'Optional ISO 4217 currency code (EUR, USD, ...)' },
    label: { type: 'string', description: 'Optional raw description label' },
  },
  required: ['date', 'type', 'amount'],
};

export const previewTransactionImportTool: AIToolDefinition<
  TransactionImportInput,
  TransactionImportPreviewResult
> = {
  name: 'preview_transaction_import',
  description:
    'Read-only. Validate and preview a transaction history import into an account from raw CSV text (or XLSX-converted CSV) OR structured rows extracted from a PDF/screenshot. Reports valid, warning, duplicate and error counts plus sample rows. Nothing is saved.',
  parameters: {
    type: 'object',
    properties: {
      accountId: {
        type: 'string',
        description: 'Target account ID (optional when only one account exists)',
      },
      csvText: {
        type: 'string',
        description: 'Raw CSV content (use this or rows)',
      },
      mapping: {
        type: 'object',
        description: 'Optional explicit field->header overrides (transactionDate, amountPrimary, assetSymbol, ...)',
        additionalProperties: { type: 'string', description: 'CSV column header name' },
      },
      rows: {
        type: 'array',
        description: 'Structured transaction rows extracted from an image or PDF statement',
        items: EXTRACTED_ROW_SCHEMA,
      },
      fileName: {
        type: 'string',
        description: 'Original statement filename',
      },
    },
  },
  execute: async (input) => {
    try {
      const staged = await stageTransactionsInput(input);
      return summarizeStagedImport(
        staged.account,
        staged.parsed,
        staged.detectedPreset,
        staged.fileName
      );
    } finally {
      clearStagedInstruments();
    }
  },
};

export const importTransactionsTool: AIToolDefinition<
  TransactionImportInput,
  {
    success: boolean;
    transactionCount: number;
    skippedCount: number;
    batchId: string | null;
    accountId?: string;
    message: string;
  }
> = {
  name: 'import_transactions',
  description:
    'Import a transaction history batch into an account from CSV text or structured rows (extracted from an image or PDF). Deduplicates by row hash, creates an undoable import batch, and recalculates positions. Requires explicit human confirmation before execution. Always call preview_transaction_import first.',
  requiresConfirmation: true,
  parameters: {
    type: 'object',
    properties: {
      accountId: {
        type: 'string',
        description: 'Target account ID (optional when only one account exists)',
      },
      csvText: {
        type: 'string',
        description: 'Raw CSV content (use this or rows)',
      },
      mapping: {
        type: 'object',
        description: 'Optional explicit field->header overrides',
        additionalProperties: { type: 'string', description: 'CSV column header name' },
      },
      rows: {
        type: 'array',
        description: 'Structured transaction rows extracted from an image or PDF statement',
        items: EXTRACTED_ROW_SCHEMA,
      },
      fileName: {
        type: 'string',
        description: 'Original filename recorded on the import batch',
      },
    },
  },
  execute: async (input, context) => {
    const staged = await stageTransactionsInput(input);
    const { account, parsed, fileName } = staged;
    const summary = summarizeStagedImport(account, parsed, staged.detectedPreset, fileName);

    if (summary.stats.importable === 0) {
      clearStagedInstruments();
      return {
        success: false,
        transactionCount: 0,
        skippedCount: parsed.stats.total,
        batchId: null,
        accountId: account.id,
        message:
          parsed.stats.duplicates > 0 && parsed.stats.errors === 0
            ? 'All rows in this statement were already imported (duplicates skipped).'
            : 'No valid transactions to import.',
      };
    }

    const commit = await commitBatch(
      parsed.candidates,
      account.id,
      'history',
      fileName,
      parsed.fileHash,
      context?.userId || 'default-user',
      undefined,
      parsed.detectedDelimiter
    );

    return {
      success: commit.success,
      transactionCount: commit.transactionCount,
      skippedCount: commit.batch?.skippedCount ?? parsed.stats.total - commit.transactionCount,
      batchId: commit.batchId,
      accountId: account.id,
      message: commit.success
        ? `Imported ${commit.transactionCount} transaction(s) into '${account.name}' (batch ${commit.batchId}).`
        : `Transaction import failed: ${commit.error ?? 'unknown error'}`,
    };
  },
};
