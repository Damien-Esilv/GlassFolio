/**
 * Security Audit Log Service (TGLA-043).
 *
 * Implements an append-only rolling security event log (max 500 entries)
 * persisted in encrypted appStorage (`glassfolio_security_audit_log`).
 */

import { appStorage } from '../storage/appStorage';

const AUDIT_STORAGE_KEY = 'glassfolio_security_audit_log';
const MAX_AUDIT_ENTRIES = 500;

export type AuditSeverity = 'info' | 'warning' | 'critical';

export type AuditEventType =
    | 'auth_login'
    | 'vault_unlocked'
    | 'vault_locked'
    | 'vault_created'
    | 'vault_migrated'
    | 'password_changed'
    | 'dek_rotated'
    | 'vault_reset'
    | 'totp_enabled'
    | 'totp_disabled'
    | 'passkey_registered'
    | 'passkey_deleted'
    | 'secret_created'
    | 'secret_deleted'
    | 'login_failed'
    | 'lockout_triggered'
    | 'oauth_google_login'
    | 'email_verified'
    | 'email_change_requested'
    | 'email_change_completed'
    | 'recovery_key_used'
    | 'recovery_key_rotated'
    | 'password_reset_requested'
    | 'account_conflict_blocked'
    | 'antibot_blocked'
    | 'totp_verified'
    | 'passkey_authenticated';

export interface AuditLogEntry {
    id: string;
    timestamp: string;
    event: AuditEventType;
    details?: string;
    severity: AuditSeverity;
}

export const auditLogService = {
    async getEntries(limit = 100, filterEvent?: AuditEventType): Promise<AuditLogEntry[]> {
        const raw = appStorage.getItem(AUDIT_STORAGE_KEY);
        if (!raw) return [];
        try {
            let entries: AuditLogEntry[] = JSON.parse(raw);
            if (filterEvent) {
                entries = entries.filter(e => e.event === filterEvent);
            }
            return entries.slice(0, limit);
        } catch {
            return [];
        }
    },

    async record(
        event: AuditEventType,
        details?: string,
        severity: AuditSeverity = 'info'
    ): Promise<AuditLogEntry> {
        const entry: AuditLogEntry = {
            id: `audit-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
            timestamp: new Date().toISOString(),
            event,
            details,
            severity,
        };

        const raw = appStorage.getItem(AUDIT_STORAGE_KEY);
        let entries: AuditLogEntry[] = [];
        if (raw) {
            try {
                entries = JSON.parse(raw);
            } catch {
                entries = [];
            }
        }

        // Prepend newest first and cap at MAX_AUDIT_ENTRIES
        entries.unshift(entry);
        if (entries.length > MAX_AUDIT_ENTRIES) {
            entries = entries.slice(0, MAX_AUDIT_ENTRIES);
        }

        appStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(entries));
        return entry;
    },

    async clear(): Promise<void> {
        appStorage.removeItem(AUDIT_STORAGE_KEY);
    },
};
