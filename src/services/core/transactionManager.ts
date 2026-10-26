/**
 * Transaction Manager - ACID Operations Layer
 * 
 * Provides atomic transaction support for localStorage-based operations.
 * Implements a commit/rollback pattern to ensure data integrity.
 * 
 * Note: While localStorage is synchronous, this layer ensures that
 * multi-table operations are atomic (all succeed or all fail).
 */

import {
    UnifiedTransaction,
    ImportBatch,
    ImportBatchStatus,
    ENGINE_VERSION
} from '../../types/types.backend';
import { db } from '../db';

// ============================================================================
// TYPES
// ============================================================================

interface PendingOperation {
    type: 'transactions' | 'batches' | 'positions';
    action: 'add' | 'update' | 'delete';
    data: unknown;
}

interface TransactionContext {
    id: string;
    operations: PendingOperation[];
    snapshots: {
        transactions: UnifiedTransaction[];
        batches: ImportBatch[];
    };
    startedAt: string;
    committed: boolean;
    rolledBack: boolean;
}

export interface CommitResult {
    success: boolean;
    transactionCount: number;
    batchId: string | null;
    error?: string;
}

// ============================================================================
// HASH UTILITIES
// ============================================================================

/**
 * Compute SHA-256 hash of a string
 * Uses Web Crypto API for browser compatibility
 */
export async function computeHash(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute file hash for idempotence check
 */
export async function computeFileHash(fileContent: string): Promise<string> {
    // Normalize: trim, remove BOM, normalize line endings
    const normalized = fileContent
        .replace(/^\uFEFF/, '') // Remove BOM
        .replace(/\r\n/g, '\n') // Normalize line endings
        .trim();
    return computeHash(normalized);
}

/**
 * Compute row hash for deduplication
 * Based on immutable fields: date + amount + symbol + type + fees
 */
export async function computeRowHash(
    date: string,
    amount: string,
    symbol: string,
    type: string,
    fees?: string
): Promise<string> {
    // Normalize date to YYYY-MM-DD for comparison
    const normalizedDate = date.substring(0, 10);

    // Normalize amount to fixed precision
    const normalizedAmount = parseFloat(amount || '0').toFixed(8);

    // Normalize symbol to uppercase
    const normalizedSymbol = (symbol || '').toUpperCase().trim();

    // Normalize fees
    const normalizedFees = parseFloat(fees || '0').toFixed(8);

    const signature = `${normalizedDate}|${normalizedAmount}|${normalizedSymbol}|${type}|${normalizedFees}`;
    return computeHash(signature);
}

// ============================================================================
// TRANSACTION MANAGER
// ============================================================================

class TransactionManager {
    private activeContext: TransactionContext | null = null;
    private lockTimeout = 30000; // 30 seconds max lock time

    /**
     * Begin a new transaction context
     * All operations within this context will be atomic
     */
    begin(): string {
        if (this.activeContext && !this.isStale()) {
            throw new Error('Transaction already in progress. Commit or rollback first.');
        }

        // Take snapshots of current state
        const context: TransactionContext = {
            id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            operations: [],
            snapshots: {
                transactions: [...db.getUnifiedTransactions()],
                batches: [...db.getImportBatches()]
            },
            startedAt: new Date().toISOString(),
            committed: false,
            rolledBack: false
        };

        this.activeContext = context;
        return context.id;
    }

    /**
     * Check if current context is stale (timed out)
     */
    private isStale(): boolean {
        if (!this.activeContext) return true;
        const elapsed = Date.now() - new Date(this.activeContext.startedAt).getTime();
        return elapsed > this.lockTimeout;
    }

    /**
     * Add transactions to be committed
     */
    addTransactions(transactions: UnifiedTransaction[]): void {
        if (!this.activeContext) {
            throw new Error('No active transaction. Call begin() first.');
        }
        this.activeContext.operations.push({
            type: 'transactions',
            action: 'add',
            data: transactions
        });
    }

    /**
     * Add a batch record to be committed
     */
    addBatch(batch: ImportBatch): void {
        if (!this.activeContext) {
            throw new Error('No active transaction. Call begin() first.');
        }
        this.activeContext.operations.push({
            type: 'batches',
            action: 'add',
            data: batch
        });
    }

    /**
     * Mark transactions for deletion by batch ID
     */
    deleteTransactionsByBatch(batchId: string): void {
        if (!this.activeContext) {
            throw new Error('No active transaction. Call begin() first.');
        }
        this.activeContext.operations.push({
            type: 'transactions',
            action: 'delete',
            data: { batchId }
        });
    }

    /**
     * Update batch status
     */
    updateBatchStatus(batchId: string, status: ImportBatchStatus): void {
        if (!this.activeContext) {
            throw new Error('No active transaction. Call begin() first.');
        }
        this.activeContext.operations.push({
            type: 'batches',
            action: 'update',
            data: { batchId, status }
        });
    }

    /**
     * Commit all pending operations atomically
     * If any operation fails, all changes are rolled back
     */
    commit(): CommitResult {
        if (!this.activeContext) {
            return { success: false, transactionCount: 0, batchId: null, error: 'No active transaction' };
        }

        if (this.activeContext.committed || this.activeContext.rolledBack) {
            return { success: false, transactionCount: 0, batchId: null, error: 'Transaction already finalized' };
        }

        try {
            let currentTxs = [...this.activeContext.snapshots.transactions];
            let currentBatches = [...this.activeContext.snapshots.batches];
            let transactionCount = 0;
            let batchId: string | null = null;

            // Process all operations in order
            for (const op of this.activeContext.operations) {
                switch (op.type) {
                    case 'transactions':
                        if (op.action === 'add') {
                            const newTxs = op.data as UnifiedTransaction[];
                            currentTxs = [...newTxs, ...currentTxs];
                            transactionCount += newTxs.length;
                        } else if (op.action === 'delete') {
                            const { batchId: targetBatchId } = op.data as { batchId: string };
                            const before = currentTxs.length;
                            currentTxs = currentTxs.filter(tx => tx.batchId !== targetBatchId);
                            transactionCount = before - currentTxs.length;
                        }
                        break;

                    case 'batches':
                        if (op.action === 'add') {
                            const batch = op.data as ImportBatch;
                            currentBatches = [batch, ...currentBatches];
                            batchId = batch.id;
                        } else if (op.action === 'update') {
                            const { batchId: targetId, status } = op.data as { batchId: string; status: ImportBatchStatus };
                            currentBatches = currentBatches.map(b =>
                                b.id === targetId ? { ...b, status } : b
                            );
                        }
                        break;
                }
            }

            // Atomic write: both succeed or we restore from snapshot
            try {
                db.saveUnifiedTransactions(currentTxs);
                db.saveImportBatches(currentBatches);
            } catch (writeError) {
                // Restore from snapshots
                db.saveUnifiedTransactions(this.activeContext.snapshots.transactions);
                db.saveImportBatches(this.activeContext.snapshots.batches);
                throw writeError;
            }

            this.activeContext.committed = true;
            this.activeContext = null;

            return { success: true, transactionCount, batchId };
        } catch (error) {
            // Attempt rollback on any error
            this.rollback();
            return {
                success: false,
                transactionCount: 0,
                batchId: null,
                error: error instanceof Error ? error.message : 'Unknown error during commit'
            };
        }
    }

    /**
     * Rollback all pending operations
     * Restores state from snapshots
     */
    rollback(): void {
        if (!this.activeContext) {
            return;
        }

        if (!this.activeContext.committed && !this.activeContext.rolledBack) {
            // Restore from snapshots
            db.saveUnifiedTransactions(this.activeContext.snapshots.transactions);
            db.saveImportBatches(this.activeContext.snapshots.batches);
            this.activeContext.rolledBack = true;
        }

        this.activeContext = null;
    }

    /**
     * Check if there's an active transaction
     */
    isActive(): boolean {
        return this.activeContext !== null && !this.isStale();
    }

    /**
     * Get current engine version
     */
    getEngineVersion(): string {
        return ENGINE_VERSION;
    }
}

// Singleton instance
export const transactionManager = new TransactionManager();

// ============================================================================
// IDEMPOTENCE CHECK
// ============================================================================

/**
 * Check if a file has already been imported
 */
export async function isFileAlreadyImported(fileHash: string): Promise<ImportBatch | null> {
    const batches = db.getImportBatches();
    return batches.find(b => b.fileHash === fileHash && b.status === 'completed') || null;
}

/**
 * Check if a row hash already exists
 */
export function isRowDuplicate(rowHash: string, accountId: string): boolean {
    const transactions = db.getUnifiedTransactions();
    return transactions.some(tx => tx.rowHash === rowHash && tx.accountId === accountId);
}

/**
 * Get all existing row hashes for an account (for batch duplicate check)
 */
export function getExistingRowHashes(accountId: string): Set<string> {
    const transactions = db.getUnifiedTransactions();
    return new Set(
        transactions
            .filter(tx => tx.accountId === accountId)
            .map(tx => tx.rowHash)
    );
}

/**
 * How many rows of an account carry each row hash. Two identical trades on the same day are
 * legitimate, so duplicate detection must compare occurrences, not mere presence.
 */
export function getExistingRowHashCounts(accountId: string): Map<string, number> {
    const counts = new Map<string, number>();
    for (const tx of db.getUnifiedTransactions()) {
        if (tx.accountId !== accountId) continue;
        counts.set(tx.rowHash, (counts.get(tx.rowHash) ?? 0) + 1);
    }
    return counts;
}
