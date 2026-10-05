import { ITransactionRepository } from './contracts/ITransactionRepository';
import { IPortfolioRepository } from './contracts/IPortfolioRepository';
import { IGoalRepository } from './contracts/IGoalRepository';
import { LocalStorageTransactionRepository } from './local/LocalStorageTransactionRepository';
import { LocalStoragePortfolioRepository } from './local/LocalStoragePortfolioRepository';
import { LocalStorageGoalRepository } from './local/LocalStorageGoalRepository';

export * from './contracts/ITransactionRepository';
export * from './contracts/IPortfolioRepository';
export * from './contracts/IGoalRepository';
export * from './local/LocalStorageTransactionRepository';
export * from './local/LocalStoragePortfolioRepository';
export * from './local/LocalStorageGoalRepository';

export interface RepositoryContainer {
  transactions: ITransactionRepository;
  portfolio: IPortfolioRepository;
  goals: IGoalRepository;
}

// Default to LocalStorage repositories (offline-first)
let activeRepositories: RepositoryContainer = {
  transactions: new LocalStorageTransactionRepository(),
  portfolio: new LocalStoragePortfolioRepository(),
  goals: new LocalStorageGoalRepository(),
};

/**
 * Switch backend dynamically (e.g. for InstantDB, Azure Cosmos/SQL, or test mocks)
 */
export function setRepositoryBackend(container: Partial<RepositoryContainer>) {
  activeRepositories = {
    ...activeRepositories,
    ...container,
  };
}

export const transactionRepository = {
  getAll: () => activeRepositories.transactions.getAll(),
  getById: (id: string) => activeRepositories.transactions.getById(id),
  save: (transactions: any) => activeRepositories.transactions.save(transactions),
  add: (transaction: any) => activeRepositories.transactions.add(transaction),
  delete: (id: string) => activeRepositories.transactions.delete(id),
};

export const portfolioRepository = {
  getPositions: () => activeRepositories.portfolio.getPositions(),
  savePositions: (positions: any) => activeRepositories.portfolio.savePositions(positions),
  updatePosition: (id: string, updates: any) => activeRepositories.portfolio.updatePosition(id, updates),
};

export const goalRepository = {
  getGoals: () => activeRepositories.goals.getGoals(),
  saveGoals: (goals: any) => activeRepositories.goals.saveGoals(goals),
  deleteGoal: (id: string) => activeRepositories.goals.deleteGoal(id),
  getAssetGroups: () => activeRepositories.goals.getAssetGroups(),
  saveAssetGroups: (groups: any) => activeRepositories.goals.saveAssetGroups(groups),
};
