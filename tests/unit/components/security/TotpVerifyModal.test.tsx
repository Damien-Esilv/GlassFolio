import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TotpVerifyModal } from '../../../../components/security/TotpVerifyModal';
import { totpService } from '../../../../src/services/security/totpService';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('../../../../src/services/security/totpService', () => ({
    totpService: {
        verify: vi.fn(),
    },
}));

describe('TotpVerifyModal', () => {
    const mockOnClose = vi.fn();
    const mockOnVerified = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return null when isOpen is false', () => {
        const { container } = render(
            <TotpVerifyModal isOpen={false} onClose={mockOnClose} onVerified={mockOnVerified} />
        );
        expect(container.firstChild).toBeNull();
    });

    it('should render correctly when isOpen is true', () => {
        render(<TotpVerifyModal isOpen={true} onClose={mockOnClose} onVerified={mockOnVerified} />);

        expect(screen.getByText('security:totpVerifyModal.title')).toBeTruthy();
        expect(screen.getByPlaceholderText('security:totpVerifyModal.placeholder')).toBeTruthy();
        expect(screen.getByText('security:totpVerifyModal.cancel')).toBeTruthy();
        expect(screen.getByText('security:totpVerifyModal.verifyButton')).toBeTruthy();
    });

    it('should call onClose when cancel button is clicked', () => {
        render(<TotpVerifyModal isOpen={true} onClose={mockOnClose} onVerified={mockOnVerified} />);

        const cancelButton = screen.getByText('security:totpVerifyModal.cancel');
        fireEvent.click(cancelButton);

        expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should successfully verify totp code', async () => {
        vi.mocked(totpService.verify).mockResolvedValueOnce(true);

        render(<TotpVerifyModal isOpen={true} onClose={mockOnClose} onVerified={mockOnVerified} />);

        const input = screen.getByPlaceholderText('security:totpVerifyModal.placeholder');
        fireEvent.change(input, { target: { value: '123456' } });

        const verifyButton = screen.getByText('security:totpVerifyModal.verifyButton');
        fireEvent.click(verifyButton);

        expect(totpService.verify).toHaveBeenCalledWith('123456');

        await waitFor(() => {
            expect(mockOnVerified).toHaveBeenCalledTimes(1);
            expect(mockOnClose).toHaveBeenCalledTimes(1);
        });
    });

    it('should show error when totp code is invalid', async () => {
        vi.mocked(totpService.verify).mockResolvedValueOnce(false);

        render(<TotpVerifyModal isOpen={true} onClose={mockOnClose} onVerified={mockOnVerified} />);

        const input = screen.getByPlaceholderText('security:totpVerifyModal.placeholder');
        fireEvent.change(input, { target: { value: '000000' } });

        const verifyButton = screen.getByText('security:totpVerifyModal.verifyButton');
        fireEvent.click(verifyButton);

        expect(totpService.verify).toHaveBeenCalledWith('000000');

        await waitFor(() => {
            expect(screen.getByText('security:totpVerifyModal.invalid')).toBeTruthy();
            expect(mockOnVerified).not.toHaveBeenCalled();
            expect(mockOnClose).not.toHaveBeenCalled();
        });
    });

    it('should show error when totpService throws an exception', async () => {
        vi.mocked(totpService.verify).mockRejectedValueOnce(new Error('Network error'));

        render(<TotpVerifyModal isOpen={true} onClose={mockOnClose} onVerified={mockOnVerified} />);

        const input = screen.getByPlaceholderText('security:totpVerifyModal.placeholder');
        fireEvent.change(input, { target: { value: '999999' } });

        const verifyButton = screen.getByText('security:totpVerifyModal.verifyButton');
        fireEvent.click(verifyButton);

        expect(totpService.verify).toHaveBeenCalledWith('999999');

        await waitFor(() => {
            expect(screen.getByText('security:totpVerifyModal.invalid')).toBeTruthy();
            expect(mockOnVerified).not.toHaveBeenCalled();
            expect(mockOnClose).not.toHaveBeenCalled();
        });
    });
});
