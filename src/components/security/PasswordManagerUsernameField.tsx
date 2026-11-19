import React from 'react';
import { useTranslation } from 'react-i18next';

interface PasswordManagerUsernameFieldProps {
    username: string;
    id?: string;
}

/**
 * Visually hidden controlled username anchor so password managers and OTP autofill
 * target the active local vault name or cloud email without triggering axe-core label violations.
 */
export const PasswordManagerUsernameField: React.FC<PasswordManagerUsernameFieldProps> = ({
    username,
    id,
}) => {
    const { t } = useTranslation('auth');

    return (
        <input
            type="text"
            name="username"
            id={id}
            autoComplete="username"
            aria-label={t('login.accountIdentifierAriaLabel')}
            value={username}
            readOnly
            className="sr-only"
            tabIndex={-1}
        />
    );
};
