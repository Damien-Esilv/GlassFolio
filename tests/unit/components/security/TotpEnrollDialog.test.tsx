import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { TotpEnrollDialog } from '../../../../components/security/TotpEnrollDialog';
import { totpService } from '../../../../src/services/security/totpService';

// Mock Translation
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

// Mock QR generator
vi.mock('../../../../src/services/security/qrCode', () => ({
    generateQrSvg: vi.fn(() => '<svg data-testid="mock-qr-code"></svg>'),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => {
    return {
        ShieldCheck: () => <div data-testid="icon-shield-check" />,
        Copy: () => <div data-testid="icon-copy" />,
        Check: () => <div data-testid="icon-check" />,
        Download: () => <div data-testid="icon-download" />,
        AlertCircle: () => <div data-testid="icon-alert-circle" />,
        X: () => <div data-testid="icon-x" />,
        KeyRound: () => <div data-testid="icon-key-round" />,
    };
});

describe('TotpEnrollDialog', () => {
    const mockOnClose = vi.fn();
    const mockOnEnrolled = vi.fn();

    let mockWriteText: any;
    const mockEnrollment = {
        secret: 'MOCKSECRET123456',
        uri: 'otpauth://totp/Test?secret=MOCKSECRET123456',
        plainBackupCodes: ['1234-5678', '9876-5432'],
        hashedBackupCodes: ['hash1', 'hash2'],
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock totpService methods
        vi.spyOn(totpService, 'initEnrollment').mockResolvedValue(mockEnrollment);
        vi.spyOn(totpService, 'confirmEnrollment').mockResolvedValue(true);

        // Mock clipboard
        mockWriteText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: {
                writeText: mockWriteText,
            },
            configurable: true,
            writable: true,
        });

        // Mock URL.createObjectURL and URL.revokeObjectURL
        Object.assign(window.URL, {
            createObjectURL: vi.fn().mockReturnValue('blob:test-url'),
            revokeObjectURL: vi.fn(),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should not render when isOpen is false', () => {
        const { container } = render(
            <TotpEnrollDialog
                isOpen={false}
                onClose={mockOnClose}
                userEmail="test@example.com"
                onEnrolled={mockOnEnrolled}
            />
        );
        expect(container).toBeEmptyDOMElement();
        expect(totpService.initEnrollment).not.toHaveBeenCalled();
    });

    it('renders scanning step on init', async () => {
        render(
            <TotpEnrollDialog
                isOpen={true}
                onClose={mockOnClose}
                userEmail="test@example.com"
                onEnrolled={mockOnEnrolled}
            />
        );

        await waitFor(() => {
            expect(totpService.initEnrollment).toHaveBeenCalledWith('test@example.com');
        });

        // Check if QR code SVG and secret are rendered
        expect(screen.getByText('security:totp.scanQrTitle')).toBeInTheDocument();
        expect(screen.getByText('MOCKSECRET123456')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('security:totp.codePlaceholder')).toBeInTheDocument();
    });

    it('handles copying secret key', async () => {
        render(
            <TotpEnrollDialog
                isOpen={true}
                onClose={mockOnClose}
                userEmail="test@example.com"
                onEnrolled={mockOnEnrolled}
            />
        );

        await waitFor(() => {
            expect(totpService.initEnrollment).toHaveBeenCalled();
        });

        const copyButton = screen.getByText('security:totp.copySecret');
        fireEvent.click(copyButton);

        await waitFor(() => { expect(mockWriteText).toHaveBeenCalledWith('MOCKSECRET123456'); });

        // Check if it changes text to copied
        expect(screen.getByText('security:totp.secretCopied')).toBeInTheDocument();
    });

    it('handles verification failure', async () => {
        vi.spyOn(totpService, 'confirmEnrollment').mockResolvedValue(false);
        const user = userEvent.setup();

        render(
            <TotpEnrollDialog
                isOpen={true}
                onClose={mockOnClose}
                userEmail="test@example.com"
                onEnrolled={mockOnEnrolled}
            />
        );

        await waitFor(() => {
            expect(totpService.initEnrollment).toHaveBeenCalled();
        });

        const input = screen.getByPlaceholderText('security:totp.codePlaceholder');
        await user.type(input, '123456');

        const verifyButton = screen.getByRole('button', { name: /security:totp.verifyButton/i });
        await user.click(verifyButton);

        await waitFor(() => {
            expect(totpService.confirmEnrollment).toHaveBeenCalledWith(
                'MOCKSECRET123456',
                '123456',
                ['hash1', 'hash2']
            );
        });

        expect(screen.getByText('security:totp.invalidCode')).toBeInTheDocument();
    });

    it('handles verification success and moves to backup step', async () => {
        const user = userEvent.setup();

        render(
            <TotpEnrollDialog
                isOpen={true}
                onClose={mockOnClose}
                userEmail="test@example.com"
                onEnrolled={mockOnEnrolled}
            />
        );

        await waitFor(() => {
            expect(totpService.initEnrollment).toHaveBeenCalled();
        });

        const input = screen.getByPlaceholderText('security:totp.codePlaceholder');
        await user.type(input, '123456');

        const verifyButton = screen.getByRole('button', { name: /security:totp.verifyButton/i });
        await user.click(verifyButton);

        await waitFor(() => {
            expect(screen.getByText('security:totp.backupTitle')).toBeInTheDocument();
        });

        // Check if backup codes are rendered
        expect(screen.getByText('1234-5678')).toBeInTheDocument();
        expect(screen.getByText('9876-5432')).toBeInTheDocument();
    });

    it('handles backup code confirmation and finishing', async () => {
        const user = userEvent.setup();

        render(
            <TotpEnrollDialog
                isOpen={true}
                onClose={mockOnClose}
                userEmail="test@example.com"
                onEnrolled={mockOnEnrolled}
            />
        );

        await waitFor(() => {
            expect(totpService.initEnrollment).toHaveBeenCalled();
        });

        const input = screen.getByPlaceholderText('security:totp.codePlaceholder');
        await user.type(input, '123456');

        const verifyButton = screen.getByRole('button', { name: /security:totp.verifyButton/i });
        await user.click(verifyButton);

        await waitFor(() => {
            expect(screen.getByText('security:totp.backupTitle')).toBeInTheDocument();
        });

        const confirmCheckbox = screen.getByRole('checkbox');
        expect(confirmCheckbox).not.toBeChecked();

        const finishButton = screen.getByRole('button', { name: /security:totp.finishEnrollment/i });
        expect(finishButton).toBeDisabled();

        await user.click(confirmCheckbox);
        expect(confirmCheckbox).toBeChecked();
        expect(finishButton).not.toBeDisabled();

        await user.click(finishButton);

        expect(mockOnEnrolled).toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
    });

    it('handles downloading backup codes', async () => {
        const user = userEvent.setup();

        render(
            <TotpEnrollDialog
                isOpen={true}
                onClose={mockOnClose}
                userEmail="test@example.com"
                onEnrolled={mockOnEnrolled}
            />
        );

        await waitFor(() => {
            expect(totpService.initEnrollment).toHaveBeenCalled();
        });

        const input = screen.getByPlaceholderText('security:totp.codePlaceholder');
        await user.type(input, '123456');

        const verifyButton = screen.getByRole('button', { name: /security:totp.verifyButton/i });
        await user.click(verifyButton);

        await waitFor(() => {
            expect(screen.getByText('security:totp.backupTitle')).toBeInTheDocument();
        });

        const downloadButton = screen.getByRole('button', { name: /security:totp.downloadBackupCodes/i });

        // Mock link click
        const mockLink = {
            href: '',
            download: '',
            click: vi.fn(),
        };
        const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
        const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
        const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});

        await user.click(downloadButton);

        expect(createElementSpy).toHaveBeenCalledWith('a');
        expect(window.URL.createObjectURL).toHaveBeenCalled();
        expect(mockLink.click).toHaveBeenCalled();
        expect(appendChildSpy).toHaveBeenCalled();
        expect(removeChildSpy).toHaveBeenCalled();
        expect(window.URL.revokeObjectURL).toHaveBeenCalled();
    });
});