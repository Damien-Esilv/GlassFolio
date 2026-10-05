import { IGoalRepository } from '../contracts/IGoalRepository';
import { FinancialGoal, AssetGroup } from '../../../types/domain';
import { db } from '../../db';

export class LocalStorageGoalRepository implements IGoalRepository {
  async getGoals(): Promise<FinancialGoal[]> {
    return db.getGoals();
  }

  async saveGoals(goals: FinancialGoal[]): Promise<void> {
    db.saveGoals(goals);
  }

  async deleteGoal(id: string): Promise<boolean> {
    const list = db.getGoals();
    const filtered = list.filter(g => g.id !== id);
    if (filtered.length === list.length) return false;
    db.saveGoals(filtered);
    return true;
  }

  async getAssetGroups(): Promise<AssetGroup[]> {
    return db.getAssetGroups();
  }

  async saveAssetGroups(groups: AssetGroup[]): Promise<void> {
    db.saveAssetGroups(groups);
  }
}
