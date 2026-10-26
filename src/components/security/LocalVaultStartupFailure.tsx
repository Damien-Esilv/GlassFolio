import React, { useState } from 'react';
// Standalone entry: the app (and its i18n bootstrap) has not been loaded when this screen shows.
import '../../i18n';
import { bootstrapLocalPersistence } from '../../services/storage/localPersistenceBootstrap';
import { LocalVaultUnavailableScreen } from './LocalVaultUnavailableScreen';

interface LocalVaultStartupFailureProps {
    initialDetail: string;
    /** Called once the local server answers; the caller then starts the app. */
    onRecovered: () => void;
}

const LocalVaultStartupFailure: React.FC<LocalVaultStartupFailureProps> = ({ initialDetail, onRecovered }) => {
    const [detail, setDetail] = useState(initialDetail);

    const retry = async (): Promise<void> => {
        const result = await bootstrapLocalPersistence();
        if (result.status === 'ready') onRecovered();
        else setDetail(result.message);
    };

    return <LocalVaultUnavailableScreen detail={detail} onRetry={retry} />;
};

export default LocalVaultStartupFailure;
