import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '../../../../src/i18n';
import { DesktopUpdatePrompt } from '../../../../src/components/desktop/DesktopUpdatePrompt';
import { DesktopAboutCard } from '../../../../src/components/settings/DesktopAboutCard';
import type { DesktopUpdateState, GlassfolioDesktopApi } from '../../../../src/services/desktop/desktopService';

const baseState: DesktopUpdateState = { status: 'idle', strategy: 'mac-guided', version: null, progress: null, errorCode: null, checkedAt: null };

let pushState: (state: DesktopUpdateState) => void = () => undefined;
let api: GlassfolioDesktopApi;

const installApi = (initial: DesktopUpdateState): void => {
    api = {
        getInfo: vi.fn().mockResolvedValue({ version: '1.0.1', platform: 'mac', arch: 'arm64', port: 3790, mcpEntryPath: '/m/index.mjs', executablePath: '/x', autoUpdateCheck: true }),
        getUpdateState: vi.fn().mockResolvedValue(initial),
        checkForUpdates: vi.fn().mockResolvedValue({ ...baseState, status: 'upToDate' }),
        installUpdate: vi.fn().mockResolvedValue({ ...baseState, status: 'downloading', version: '1.1.0', progress: 0.5 }),
        openReleasePage: vi.fn().mockResolvedValue(undefined),
        setAutoUpdateCheck: vi.fn().mockImplementation(async (enabled: boolean) => enabled),
        onUpdateState: vi.fn().mockImplementation((listener: (state: DesktopUpdateState) => void) => {
            pushState = listener;
            return () => undefined;
        }),
    };
    window.glassfolioDesktop = api;
};

describe('desktop update UI', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    afterEach(() => {
        delete window.glassfolioDesktop;
    });

    it('renders nothing outside the desktop app', () => {
        const { container } = render(
            <>
                <DesktopUpdatePrompt />
                <DesktopAboutCard />
            </>,
        );
        expect(container.innerHTML).toBe('');
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    });

    it('offers a new version and installs it only after a click', async () => {
        installApi({ ...baseState, status: 'available', version: '1.1.0' });
        render(<DesktopUpdatePrompt />);

        expect(await screen.findByRole('dialog', { name: /1\.1\.0/ })).toBeTruthy();
        expect(api.installUpdate).not.toHaveBeenCalled();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /update now/i }));
        });
        expect(api.installUpdate).toHaveBeenCalledTimes(1);
        expect(await screen.findByRole('progressbar')).toBeTruthy();
    });

    it('hides for the session on "Later" and comes back for a newer version', async () => {
        installApi({ ...baseState, status: 'available', version: '1.1.0' });
        render(<DesktopUpdatePrompt />);
        fireEvent.click(await screen.findByRole('button', { name: /later/i }));
        expect(screen.queryByRole('dialog')).toBeNull();

        await act(async () => pushState({ ...baseState, status: 'available', version: '1.2.0' }));
        expect(await screen.findByRole('dialog', { name: /1\.2\.0/ })).toBeTruthy();
    });

    it('shows the manual flow and opens the release page for a deb or read-only install', async () => {
        installApi({ ...baseState, strategy: 'manual', status: 'available', version: '1.1.0' });
        render(<DesktopUpdatePrompt />);
        const button = await screen.findByRole('button', { name: /open the download page/i });
        await act(async () => {
            fireEvent.click(button);
        });
        // The shell opens the release page itself for a manual install
        expect(api.installUpdate).toHaveBeenCalled();
    });

    it('shows the version, checks on demand and stores the automatic-check choice through the shell', async () => {
        installApi({ ...baseState, status: 'idle' });
        render(<DesktopAboutCard />);
        expect(await screen.findByText(/Version 1\.0\.1 · macOS \(arm64\)/)).toBeTruthy();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /check for updates/i }));
        });
        expect(api.checkForUpdates).toHaveBeenCalledTimes(1);
        expect(await screen.findByText(/latest version/i)).toBeTruthy();

        await act(async () => {
            fireEvent.click(screen.getByRole('switch'));
        });
        expect(api.setAutoUpdateCheck).toHaveBeenCalledWith(false);
    });

    it('explains that updates are off in a build without an update key', async () => {
        installApi({ ...baseState, strategy: 'disabled' });
        render(<DesktopAboutCard />);
        expect(await screen.findByText(/not available in this build/i)).toBeTruthy();
        expect(screen.queryByRole('switch')).toBeNull();
    });
});
