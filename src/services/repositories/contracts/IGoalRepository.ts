import { FinancialGoal, AssetGroup } from '../../../types/domain';

export interface IGoalRepository {
  getGoals(): Promise<FinancialGoal[]>;
  saveGoals(goals: FinancialGoal[]): Promise<void>;
  deleteGoal(id: string): Promise<boolean>;
  getAssetGroups(): Promise<AssetGroup[]>;
  saveAssetGroups(groups: AssetGroup[]): Promise<void>;
}
