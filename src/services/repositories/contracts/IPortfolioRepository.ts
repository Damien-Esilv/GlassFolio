import { Position } from '../../../types/domain';

export interface IPortfolioRepository {
  getPositions(): Promise<Position[]>;
  savePositions(positions: Position[]): Promise<void>;
  updatePosition(id: string, updates: Partial<Position>): Promise<Position | null>;
}
