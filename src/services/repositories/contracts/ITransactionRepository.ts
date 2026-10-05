import { Transaction } from '../../../types/domain';

export interface ITransactionRepository {
  getAll(): Promise<Transaction[]>;
  getById(id: string): Promise<Transaction | null>;
  save(transactions: Transaction[]): Promise<void>;
  add(transaction: Transaction): Promise<Transaction>;
  delete(id: string): Promise<boolean>;
}
