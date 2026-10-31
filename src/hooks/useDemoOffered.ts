import { useEffect, useState } from 'react';
import { demoAvailability } from '../services/demoAvailability';
import { getDeploymentMode } from '../config/deployment';

/** Whether the demo account may be offered here. Online it always is, so the prerendered HTML has it. */
export function useDemoOffered(): boolean {
    const [offered, setOffered] = useState(() => getDeploymentMode() !== 'local');
    useEffect(() => {
        let active = true;
        demoAvailability.isDemoOffered().then(value => { if (active) setOffered(value); });
        return () => { active = false; };
    }, []);
    return offered;
}
