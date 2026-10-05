import { IPortfolioRepository } from '../contracts/IPortfolioRepository';
import { Position } from '../../../types/domain';
import { db } from '../../db';
import { safeParsePosition, repairPosition } from '../../../types/schemas';

export class LocalStoragePortfolioRepository implements IPortfolioRepository {
  async getPositions(): Promise<Position[]> {
    const list = db.getPositions();
    const validated: Position[] = [];

    for (const raw of list) {
      const parsed = safeParsePosition(raw);
      if (parsed.success) {
        validated.push(parsed.data as Position);
      } else {
        const repaired = repairPosition(raw);
        if (repaired) {
          validated.push(repaired as Position);
        }
      }
    }

    return validated;
  }

  async savePositions(positions: Position[]): Promise<void> {
    const sanitized = positions
      .map(p => repairPosition(p))
      .filter((p): p is Position => p !== null);
    db.savePositions(sanitized);
  }

  async updatePosition(id: string, updates: Partial<Position>): Promise<Position | null> {
    const list = await this.getPositions();
    const index = list.findIndex(p => p.id === id);
    if (index === -1) return null;
    const updated = { ...list[index], ...updates };
    const valid = repairPosition(updated);
    if (!valid) return null;
    list[index] = valid as Position;
    await this.savePositions(list);
    return valid as Position;
  }
}

