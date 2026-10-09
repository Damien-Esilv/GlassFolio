import { Transaction, Position, FinancialGoal, AssetGroup, User } from '../../types/domain';
import { ITransactionRepository } from './contracts/ITransactionRepository';
import { IPortfolioRepository } from './contracts/IPortfolioRepository';
import { IGoalRepository } from './contracts/IGoalRepository';
import { IUserRepository } from './contracts/IUserRepository';
import { LocalStorageTransactionRepository } from './local/LocalStorageTransactionRepository';
import { LocalStoragePortfolioRepository } from './local/LocalStoragePortfolioRepository';
import { LocalStorageGoalRepository } from './local/LocalStorageGoalRepository';
import { LocalStorageUserRepository } from './local/LocalStorageUserRepository';

export * from './contracts/ITransactionRepository';
export * from './contracts/IPortfolioRepository';
export * from './contracts/IGoalRepository';
export * from './contracts/IUserRepository';
export * from './local/LocalStorageTransactionRepository';
export * from './local/LocalStoragePortfolioRepository';
export * from './local/LocalStorageGoalRepository';
export * from './local/LocalStorageUserRepository';

export interface RepositoryContainer {
  transactions: ITransactionRepository;
  portfolio: IPortfolioRepository;
  goals: IGoalRepository;
  user: IUserRepository;
}

// Default to LocalStorage repositories (offline-first)
let activeRepositories: RepositoryContainer = {
  transactions: new LocalStorageTransactionRepository(),
  portfolio: new LocalStoragePortfolioRepository(),
  goals: new LocalStorageGoalRepository(),
  user: new LocalStorageUserRepository(),
};

/**
 * Switch backend dynamically (e.g. for InstantDB, Azure Cosmos/SQL, Vercel Edge, or test mocks)
 * Allows changing the entire backend data provider by passing a single configuration object.
 */
export function setRepositoryBackend(container: Partial<RepositoryContainer>) {
  activeRepositories = {
    ...activeRepositories,
    ...container,
  };
}

export function getRepositoryBackend(): RepositoryContainer {
  return activeRepositories;
}

export const transactionRepository = {
  getAll: (): Promise<Transaction[]> => activeRepositories.transactions.getAll(),
  getById: (id: string): Promise<Transaction | null> => activeRepositories.transactions.getById(id),
  save: (transactions: Transaction[]): Promise<void> => activeRepositories.transactions.save(transactions),
  add: (transaction: Transaction): Promise<Transaction> => activeRepositories.transactions.add(transaction),
  delete: (id: string): Promise<boolean> => activeRepositories.transactions.delete(id),
};

export const portfolioRepository = {
  getPositions: (): Promise<Position[]> => activeRepositories.portfolio.getPositions(),
  savePositions: (positions: Position[]): Promise<void> => activeRepositories.portfolio.savePositions(positions),
  updatePosition: (id: string, updates: Partial<Position>): Promise<Position> => activeRepositories.portfolio.updatePosition(id, updates),
};

export const goalRepository = {
  getGoals: (): Promise<FinancialGoal[]> => activeRepositories.goals.getGoals(),
  saveGoals: (goals: FinancialGoal[]): Promise<void> => activeRepositories.goals.saveGoals(goals),
  deleteGoal: (id: string): Promise<boolean> => activeRepositories.goals.deleteGoal(id),
  getAssetGroups: (): Promise<AssetGroup[]> => activeRepositories.goals.getAssetGroups(),
  saveAssetGroups: (groups: AssetGroup[]): Promise<void> => activeRepositories.goals.saveAssetGroups(groups),
};

export const userRepository = {
  getUser: (): Promise<User | null> => activeRepositories.user.getUser(),
  saveUser: (user: User): Promise<void> => activeRepositories.user.saveUser(user),
  clearUser: (): Promise<void> => activeRepositories.user.clearUser(),
};
