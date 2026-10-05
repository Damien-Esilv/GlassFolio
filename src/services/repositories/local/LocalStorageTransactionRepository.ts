import { ITransactionRepository } from '../contracts/ITransactionRepository';
import { Transaction } from '../../../types/domain';
import { db } from '../../db';

export class LocalStorageTransactionRepository implements ITransactionRepository {
  async getAll(): Promise<Transaction[]> {
    return db.getTransactions();
  }

  async getById(id: string): Promise<Transaction | null> {
    const list = db.getTransactions();
    return list.find(tx => tx.id === id) || null;
  }

  async save(transactions: Transaction[]): Promise<void> {
    db.saveTransactions(transactions);
  }

  async add(transaction: Transaction): Promise<Transaction> {
    const list = db.getTransactions();
    const updated = [transaction, ...list];
    db.saveTransactions(updated);
    return transaction;
  }

  async delete(id: string): Promise<boolean> {
    const list = db.getTransactions();
    const filtered = list.filter(tx => tx.id !== id);
    if (filtered.length === list.length) return false;
    db.saveTransactions(filtered);
    return true;
  }
}
