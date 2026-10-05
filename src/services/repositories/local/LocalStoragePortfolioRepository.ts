import { IPortfolioRepository } from '../contracts/IPortfolioRepository';
import { Position } from '../../../types/domain';
import { db } from '../../db';

export class LocalStoragePortfolioRepository implements IPortfolioRepository {
  async getPositions(): Promise<Position[]> {
    return db.getPositions();
  }

  async savePositions(positions: Position[]): Promise<void> {
    db.savePositions(positions);
  }

  async updatePosition(id: string, updates: Partial<Position>): Promise<Position | null> {
    const list = db.getPositions();
    const index = list.findIndex(p => p.id === id);
    if (index === -1) return null;
    const updated = { ...list[index], ...updates };
    list[index] = updated;
    db.savePositions(list);
    return updated;
  }
}
