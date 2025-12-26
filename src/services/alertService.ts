import { Alert } from '../../types';
import { db, delay } from './db';

export const alertService = {
    getAlerts: async (): Promise<Alert[]> => {
        await delay(200);
        return db.getAlerts();
    }
};
