import { useEffect, useState } from 'react';
import { demoAvailability } from '../services/demoAvailability';

/** Whether the demo account may be offered here (false until known) */
export function useDemoOffered(): boolean {
    const [offered, setOffered] = useState(false);
    useEffect(() => {
        let active = true;
        demoAvailability.isDemoOffered().then(value => { if (active) setOffered(value); });
        return () => { active = false; };
    }, []);
    return offered;
}
