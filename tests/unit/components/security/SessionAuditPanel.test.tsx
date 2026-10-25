import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionAuditPanel } from '../../../../components/security/SessionAuditPanel';
import { auditLogService, AuditLogEntry } from '../../../../src/services/security/auditLogService';

// Mock dependencies
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('../../../../src/services/security/auditLogService', () => ({
    auditLogService: {
        getEntries: vi.fn(),
        clear: vi.fn(),
    },
}));

const mockEntries: AuditLogEntry[] = [
    {
        id: '1',
        timestamp: '2023-01-01T12:00:00Z',
        event: 'auth_login',
        severity: 'info',
        details: 'Login successful'
    },
    {
        id: '2',
        timestamp: '2023-01-01T12:05:00Z',
        event: 'login_failed',
        severity: 'warning',
        details: 'Invalid password'
    },
    {
        id: '3',
        timestamp: '2023-01-01T12:10:00Z',
        event: 'lockout_triggered',
        severity: 'critical'
    }
];

describe('SessionAuditPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(auditLogService.getEntries).mockResolvedValue(mockEntries);
        // Mock window.confirm
        window.confirm = vi.fn().mockReturnValue(true);
    });

    it('renders the panel and loads entries on mount', async () => {
        render(<SessionAuditPanel />);

        expect(screen.getByText('security:audit.title')).toBeInTheDocument();
        expect(screen.getByText('security:audit.subtitle')).toBeInTheDocument();

        await waitFor(() => {
            expect(auditLogService.getEntries).toHaveBeenCalledWith(50);
            expect(screen.getByText('auth_login')).toBeInTheDocument();
            expect(screen.getByText('login_failed')).toBeInTheDocument();
            expect(screen.getByText('lockout_triggered')).toBeInTheDocument();
        });
    });

    it('renders empty state when there are no events', async () => {
        vi.mocked(auditLogService.getEntries).mockResolvedValue([]);
        render(<SessionAuditPanel />);

        await waitFor(() => {
            expect(screen.getByText('security:audit.noEvents')).toBeInTheDocument();
        });
    });

    it('filters entries by severity', async () => {
        render(<SessionAuditPanel />);

        await waitFor(() => {
            expect(screen.getByText('auth_login')).toBeInTheDocument();
        });

        // Change filter to warning
        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: 'warning' } });

        expect(screen.queryByText('auth_login')).not.toBeInTheDocument();
        expect(screen.getByText('login_failed')).toBeInTheDocument();
        expect(screen.queryByText('lockout_triggered')).not.toBeInTheDocument();
    });

    it('clears audit logs when confirmed', async () => {
        render(<SessionAuditPanel />);

        await waitFor(() => {
            expect(screen.getByText('auth_login')).toBeInTheDocument();
        });

        const clearButton = screen.getByTitle('security:audit.clearButton');
        fireEvent.click(clearButton);

        expect(window.confirm).toHaveBeenCalledWith('security:audit.clearConfirm');

        await waitFor(() => {
            expect(auditLogService.clear).toHaveBeenCalled();
            // Should call getEntries again after clear
            expect(auditLogService.getEntries).toHaveBeenCalledTimes(2);
        });
    });

    it('does not clear audit logs when user cancels confirmation', async () => {
        window.confirm = vi.fn().mockReturnValue(false);
        render(<SessionAuditPanel />);

        await waitFor(() => {
            expect(screen.getByText('auth_login')).toBeInTheDocument();
        });

        const clearButton = screen.getByTitle('security:audit.clearButton');
        fireEvent.click(clearButton);

        expect(window.confirm).toHaveBeenCalledWith('security:audit.clearConfirm');
        expect(auditLogService.clear).not.toHaveBeenCalled();
    });
});
