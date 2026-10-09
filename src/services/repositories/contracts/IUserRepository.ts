import { User } from '../../../types/domain';

export interface IUserRepository {
  getUser(): Promise<User | null>;
  saveUser(user: User): Promise<void>;
  clearUser(): Promise<void>;
}
