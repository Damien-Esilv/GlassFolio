import type { TFunction } from 'i18next';
import type { FieldError } from '../../services/import/types';

/**
 * Localized message for an import validation error.
 * Errors carry a stable `code`; the English `message` is only kept for logs.
 */
export function formatFieldError(t: TFunction, error: FieldError): string {
    if (!error.code) return t('common:errors.importValidation.UNKNOWN');
    return t(`common:errors.importValidation.${error.code}`, error.params ?? {});
}
