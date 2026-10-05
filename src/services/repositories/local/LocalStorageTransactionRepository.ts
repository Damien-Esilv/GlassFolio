import { ITransactionRepository } from '../contracts/ITransactionRepository';
import { Transaction } from '../../../types/domain';
import { db } from '../../db';
import { safeParseTransaction, repairTransaction } from '../../../types/schemas';

export class LocalStorageTransactionRepository implements ITransactionRepository {
  async getAll(): Promise<Transaction[]> {
    const list = db.getTransactions();
    const validated: Transaction[] = [];

    for (const raw of list) {
      const parsed = safeParseTransaction(raw);
      if (parsed.success) {
        validated.push(parsed.data as Transaction);
      } else {
        const repaired = repairTransaction(raw);
        if (repaired) {
          validated.push(repaired as Transaction);
        }
      }
    }

    return validated;
  }

  async getById(id: string): Promise<Transaction | null> {
    const list = await this.getAll();
    return list.find(tx => tx.id === id) || null;
  }

  async save(transactions: Transaction[]): Promise<void> {
    const sanitized = transactions
      .map(tx => repairTransaction(tx))
      .filter((tx): tx is Transaction => tx !== null);
    db.saveTransactions(sanitized);
  }

  async add(transaction: Transaction): Promise<Transaction> {
    const valid = repairTransaction(transaction) as Transaction;
    const list = await this.getAll();
    const updated = [valid || transaction, ...list];
    await this.save(updated);
    return valid || transaction;
  }

  async delete(id: string): Promise<boolean> {
    const list = await this.getAll();
    const filtered = list.filter(tx => tx.id !== id);
    if (filtered.length === list.length) return false;
    await this.save(filtered);
    return true;
  }
}

