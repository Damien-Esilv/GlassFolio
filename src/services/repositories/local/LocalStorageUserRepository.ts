import { User } from '../../../types/domain';
import { IUserRepository } from '../contracts/IUserRepository';

const USER_STORAGE_KEY = 'glassfolio_user';

export class LocalStorageUserRepository implements IUserRepository {
  async getUser(): Promise<User | null> {
    const data = localStorage.getItem(USER_STORAGE_KEY);
    if (!data) return null;
    try {
      return JSON.parse(data) as User;
    } catch {
      return null;
    }
  }

  async saveUser(user: User): Promise<void> {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  }

  async clearUser(): Promise<void> {
    localStorage.removeItem(USER_STORAGE_KEY);
  }
}
