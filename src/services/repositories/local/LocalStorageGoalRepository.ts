import { IGoalRepository } from '../contracts/IGoalRepository';
import { FinancialGoal, AssetGroup } from '../../../types/domain';
import { db } from '../../db';
import { safeParseGoal, repairGoal, safeParseAssetGroup } from '../../../types/schemas';

export class LocalStorageGoalRepository implements IGoalRepository {
  async getGoals(): Promise<FinancialGoal[]> {
    const list = db.getGoals();
    const validated: FinancialGoal[] = [];

    for (const raw of list) {
      const parsed = safeParseGoal(raw);
      if (parsed.success) {
        validated.push(parsed.data as FinancialGoal);
      } else {
        const repaired = repairGoal(raw);
        if (repaired) {
          validated.push(repaired as FinancialGoal);
        }
      }
    }

    return validated;
  }

  async saveGoals(goals: FinancialGoal[]): Promise<void> {
    const sanitized = goals
      .map(g => repairGoal(g))
      .filter((g): g is FinancialGoal => g !== null);
    db.saveGoals(sanitized);
  }

  async deleteGoal(id: string): Promise<boolean> {
    const list = await this.getGoals();
    const filtered = list.filter(g => g.id !== id);
    await this.saveGoals(filtered);
    return filtered.length !== list.length;
  }

  async getAssetGroups(): Promise<AssetGroup[]> {
    const list = db.getAssetGroups();
    const validated: AssetGroup[] = [];

    for (const raw of list) {
      const parsed = safeParseAssetGroup(raw);
      if (parsed.success) {
        validated.push(parsed.data as AssetGroup);
      } else if (raw && typeof raw === 'object' && typeof (raw as any).name === 'string') {
        validated.push({
          id: String((raw as any).id || `grp-${Date.now()}`),
          name: String((raw as any).name),
          symbols: Array.isArray((raw as any).symbols) ? (raw as any).symbols.map(String) : [],
          color: typeof (raw as any).color === 'string' ? (raw as any).color : 'blue',
        });
      }
    }

    return validated;
  }

  async saveAssetGroups(groups: AssetGroup[]): Promise<void> {
    const sanitized = groups
      .map(g => {
        const parsed = safeParseAssetGroup(g);
        return parsed.success ? (parsed.data as AssetGroup) : null;
      })
      .filter((g): g is AssetGroup => g !== null);
    db.saveAssetGroups(sanitized);
  }
}

