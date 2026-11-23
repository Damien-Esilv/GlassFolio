/**
 * "French banks" card (TGLA-237): a bank is added in three steps (credentials, the bank's own code,
 * where each account goes), a bank asking for a new validation is reconnected from the card, and the
 * online app sends to the desktop app. The bank is simulated: no request leaves the test.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../../../src/i18n';

vi.mock('../../../src/services/db', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../src/services/db')>();
    return { ...actual, delay: () => Promise.resolve() };
});

import { BankConnectCard } from '../../../src/components/connections/BankConnectCard';
import { connectionService, woobClient, WoobError } from '../../../src/services/connectors';
import { db } from '../../../src/services/db';
import { vaultService } from '../../../src/services/security/vaultService';
import { LocalAuthProvider } from '../../../src/services/security/authService';
import * as deployment from '../../../src/config/deployment';
import type { WoobAccount, WoobBankField, WoobBankInfo } from '../../../src/services/connectors';

const ACCOUNTS: WoobAccount[] = [
    { id: 'pea-1', label: 'PEA Damien', type: 'investment', wrapper: 'PEA', kind: 'investment', currency: 'EUR', balance: '12000.5' },
    { id: 'la-1', label: 'Livret A', type: 'savings', wrapper: 'LIVRET', kind: 'cash', currency: 'EUR', balance: '22950' },
];

const field = (id: string, kind: WoobBankField['kind'], extra: Partial<WoobBankField> = {}): WoobBankField =>
    ({ id, label: id, kind, required: true, default: null, choices: null, regexp: null, ...extra });

/** What the worker's catalog describes (TGLA-240): every Woob bank module, its form from the module's CONFIG. */
const BANKS: WoobBankInfo[] = [
    { module: 'fortuneo', name: 'Fortuneo', positions: true, fields: [field('login', 'text'), field('password', 'password')] },
    { module: 'boursorama', name: 'Boursorama', positions: true, fields: [field('login', 'text'), field('password', 'password'), field('identity', 'text', { label: "ID d'identité", required: false })] },
    {
        module: 'cragr', name: 'Crédit Agricole', positions: false,
        fields: [
            field('website', 'select', { label: 'Région', default: 'www.ca-paris.fr', choices: [{ value: 'www.ca-paris.fr', label: 'Paris' }, { value: 'www.ca-cmds.fr', label: 'Charente-Maritime Deux-Sèvres' }] }),
            field('login', 'text'), field('password', 'password'),
        ],
    },
    { module: 'bnp', name: 'BNP Paribas', positions: true, fields: [field('login', 'text'), field('password', 'password')] },
];

const props = () => ({
    connections: [],
    accountChoices: [],
    describeAccount: (id: string) => id,
    reports: {},
    syncing: null,
    onSync: vi.fn(async () => undefined),
    onDelete: vi.fn(async () => undefined),
    onChanged: vi.fn(async () => undefined),
});

beforeEach(async () => {
    localStorage.clear();
    await vaultService.resetVault();
    await new LocalAuthProvider().signUp('bank-card@example.test', 'Bank-Card-Key-2026!#xx', 'Bank');
    vi.spyOn(deployment, 'getDeploymentMode').mockReturnValue('local');
    vi.spyOn(woobClient, 'status').mockResolvedValue({ available: true, banks: BANKS });
});
afterEach(() => vi.restoreAllMocks());

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
/** Types the bank's Woob module in the bank field, then picks the one bank it lists. */
const chooseBank = (module: string) => {
    const field = screen.getByRole('combobox', { name: 'Bank' });
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: module } });
    const [option] = screen.getAllByRole('option');
    fireEvent.mouseDown(option);
};

describe('<BankConnectCard />', () => {
    it('online: no bank form, a link to the desktop app', async () => {
        vi.mocked(deployment.getDeploymentMode).mockReturnValue('cloud');
        vi.mocked(woobClient.status).mockResolvedValue({ available: false });
        render(<BankConnectCard {...props()} />);
        expect(await screen.findByText('Download the desktop app')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Add a bank' })).toBeNull();
    });

    it('adds a bank: credentials, the SMS code, then where each account goes', async () => {
        const login = vi.spyOn(woobClient, 'login').mockResolvedValue({
            state: 'challenge', challengeId: 'ch-1', kind: 'code', medium: 'sms', mediumLabel: '06 •• •• •• 12', message: '',
        });
        const answer = vi.spyOn(woobClient, 'answer').mockResolvedValue({ state: 'connected', accounts: ACCOUNTS });
        const card = props();
        render(<BankConnectCard {...card} />);

        fireEvent.click(await screen.findByRole('button', { name: 'Add a bank' }));
        chooseBank('boursorama');
        fill('Identifier', '12345678');
        fill('Password', 'secret-Passw0rd');
        fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
        expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Tick the box to confirm you understand how the connection works.');
        expect(login).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
        const code = await screen.findByLabelText('Enter the code sent to 06 •• •• •• 12');
        const key = login.mock.calls[0][0].key;
        expect(login.mock.calls[0][0]).toEqual({ key, module: 'boursorama', credentials: { login: '12345678', password: 'secret-Passw0rd' } });

        fireEvent.change(code, { target: { value: '123456' } });
        fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
        expect(await screen.findByText('2 accounts found. Choose where to record each one.')).toBeTruthy();
        expect(answer).toHaveBeenCalledWith('ch-1', '123456');
        expect(screen.getByText(/PEA · /)).toBeTruthy();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Connect and sync' }));
        });
        await waitFor(() => expect(card.onChanged).toHaveBeenCalledWith(key));

        const saved = await connectionService.getConnection(key);
        expect(saved).toMatchObject({ sourceId: 'woob', mode: 'holdings', publicParams: { module: 'boursorama' } });
        expect(saved?.credentialPreviews.password).toBe('••••••••w0rd');
        expect(JSON.stringify(saved)).not.toContain('secret-Passw0rd');
        const created = db.getAccounts().filter(account => Object.values(saved?.accountMap ?? {}).includes(account.id));
        expect(created.map(account => [account.name, account.type, account.wrapperType])).toEqual([
            ['PEA Damien', 'investment', 'PEA'],
            ['Livret A', 'savings', 'LIVRET'],
        ]);
        expect(db.getInstitutes().find(institute => institute.id === created[0].instituteId)?.name).toBe('BoursoBank');
    });

    it('Caisse d\'Épargne: a password with a letter is refused on this computer, and the bank\'s own words are shown', async () => {
        const ce: WoobBankInfo = {
            module: 'caissedepargne', name: "Caisse d'Épargne", positions: true,
            fields: [field('login', 'text', { label: 'Identifiant client' }), field('password', 'password', { regexp: '^\\d+$' })],
        };
        vi.mocked(woobClient.status).mockResolvedValue({ available: true, banks: [...BANKS, ce] });
        const login = vi.spyOn(woobClient, 'login').mockRejectedValue(
            new WoobError('auth_failed', "L'espace client n'a pas été trouvé avec le type de compte renseigné."));
        render(<BankConnectCard {...props()} />);

        fireEvent.click(await screen.findByRole('button', { name: 'Add a bank' }));
        chooseBank('caissedepargne');
        fireEvent.click(screen.getByRole('checkbox'));
        fill('Identifier', '1234567890');
        fill('Password', 'abc12345');
        fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
        expect((await screen.findByRole('alert')).textContent)
            .toBe('“Password” must contain digits only for this bank. It was checked on this computer: nothing was sent to the bank.');
        expect(login).not.toHaveBeenCalled();

        fill('Password', '12345678');
        fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
        await waitFor(() => expect(login).toHaveBeenCalledOnce());
        await waitFor(() => expect(screen.getByRole('alert').textContent)
            .toBe("The bank refused the identifier or password. Bank's message: “L'espace client n'a pas été trouvé avec le type de compte renseigné.”"));
    });

    it('shows the image a bank gives for its code (Digipass), never an outside link', async () => {
        const image = 'data:image/png;base64,iVBORw0KGgo=';
        vi.spyOn(woobClient, 'login')
            .mockResolvedValueOnce({ state: 'challenge', challengeId: 'ch-img', kind: 'code', medium: null, mediumLabel: null, message: '', image })
            .mockResolvedValueOnce({ state: 'challenge', challengeId: 'ch-url', kind: 'code', medium: null, mediumLabel: null, message: '', image: 'https://evil.example/code.png' });
        render(<BankConnectCard {...props()} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Add a bank' }));
        chooseBank('boursorama');
        fireEvent.click(screen.getByRole('checkbox'));
        fill('Identifier', '12345678');
        fill('Password', 'secret-Passw0rd');
        fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

        const shown = await screen.findByAltText('Image shown by your bank for the code');
        expect(shown.getAttribute('src')).toBe(image);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Add a bank' }));
        chooseBank('boursorama');
        fireEvent.click(screen.getByRole('checkbox'));
        fill('Identifier', '12345678');
        fill('Password', 'secret-Passw0rd');
        fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
        await screen.findByRole('button', { name: 'Validate' });
        expect(screen.queryByAltText('Image shown by your bank for the code')).toBeNull();
    });

    it('cancelling after the bank login deletes the bank session', async () => {
        vi.spyOn(woobClient, 'login').mockResolvedValue({ state: 'connected', accounts: ACCOUNTS });
        const forget = vi.spyOn(woobClient, 'forget').mockResolvedValue();
        render(<BankConnectCard {...props()} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Add a bank' }));
        chooseBank('boursorama');
        fill('Identifier', '1');
        fill('Password', 'p');
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
        await screen.findByText('2 accounts found. Choose where to record each one.');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(forget).toHaveBeenCalledOnce();
    });

    it('a bank asking for a new validation is reconnected from the card, with an app validation', async () => {
        const connection = await connectionService.createConnection({
            sourceId: 'woob', label: 'BoursoBank', credentials: { login: '1', password: 'stored-Passw0rd' },
            publicParams: { module: 'boursorama', accountNames: { 'pea-1': 'PEA Damien' } }, accountMap: { 'pea-1': 'acc-pea' }, mode: 'holdings',
        });
        await connectionService.recordSyncOutcome(connection.id, { status: 'reauth_required', errorCode: 'reauth_required', syncedAt: new Date().toISOString() });
        const stored = await connectionService.getConnection(connection.id);
        const login = vi.spyOn(woobClient, 'login').mockResolvedValue({
            state: 'challenge', challengeId: 'ch-2', kind: 'app', medium: 'mobile_app', mediumLabel: null, message: '',
        });
        vi.spyOn(woobClient, 'answer').mockResolvedValue({ state: 'connected', accounts: ACCOUNTS });
        const card = props();
        render(<BankConnectCard {...card} connections={[stored!]} />);

        expect(await screen.findByText(/asks you to validate the connection again/)).toBeTruthy();
        fireEvent.click(screen.getAllByRole('button', { name: 'Reconnect' })[0]);
        await screen.findByText('Open your BoursoBank app and approve the sign-in, then come back here.');
        // The stored credentials are used: the card never shows them
        expect(login.mock.calls[0][0]).toEqual({ key: connection.id, module: 'boursorama', credentials: { login: '1', password: 'stored-Passw0rd' } });

        fireEvent.click(screen.getByRole('button', { name: 'I approved it' }));
        await waitFor(() => expect(card.onChanged).toHaveBeenCalledWith(connection.id));
    });

    it('offers every bank of the worker, alphabetically, with a search and each bank\'s own form', async () => {
        const login = vi.spyOn(woobClient, 'login').mockResolvedValue({ state: 'connected', accounts: ACCOUNTS });
        render(<BankConnectCard {...props()} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Add a bank' }));

        const field = screen.getByRole('combobox', { name: 'Bank' }) as HTMLInputElement;
        // Nothing is chosen until the user picks a bank: no form yet, Connect disabled
        expect(screen.queryByLabelText('Password')).toBeNull();
        expect((screen.getByRole('button', { name: 'Connect' }) as HTMLButtonElement).disabled).toBe(true);
        // Woob still calls it "Boursorama": the current brand is shown
        fireEvent.focus(field);
        expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['BNP Paribas', 'BoursoBank', 'Crédit Agricole', 'Fortuneo']);
        expect(screen.getByText('4 banks available', { exact: false })).toBeTruthy();
        // A bank without a validation of its own comes with its limit
        chooseBank('bnp');
        expect(field.value).toBe('BNP Paribas');
        expect(screen.getByText(/cannot complete this bank's strong authentication/)).toBeTruthy();

        // Autocomplete: typing lists the matches, the keyboard picks one
        fireEvent.change(field, { target: { value: 'agri' } });
        expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['Crédit Agricole']);
        expect(screen.queryByText(/cannot complete this bank's strong authentication/)).toBeNull();
        fireEvent.keyDown(field, { key: 'Enter' });
        expect(field.value).toBe('Crédit Agricole');
        expect(screen.getByText(/reads the balances of this bank/)).toBeTruthy();
        // The region list comes from the module, on its default
        expect((screen.getByLabelText('Région') as HTMLSelectElement).value).toBe('www.ca-paris.fr');
        fireEvent.change(screen.getByLabelText('Région'), { target: { value: 'www.ca-cmds.fr' } });
        fill('Identifier', '1');
        fill('Password', 'p');
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
        await screen.findByText('2 accounts found. Choose where to record each one.');
        expect(login.mock.calls[0][0]).toMatchObject({ module: 'cragr', credentials: { website: 'www.ca-cmds.fr', login: '1', password: 'p' } });
    });

    it('a search that hides the chosen bank never keeps its form behind another bank\'s name', async () => {
        // Damien's case: BoursoBank chosen, "caiss" typed, the list showed Caisse d'Épargne but BoursoBank's form was used
        const ce: WoobBankInfo = { module: 'caissedepargne', name: "Caisse d'Épargne", positions: true, fields: [field('login', 'text'), field('password', 'password')] };
        vi.mocked(woobClient.status).mockResolvedValue({ available: true, banks: [...BANKS, ce] });
        const login = vi.spyOn(woobClient, 'login').mockResolvedValue({ state: 'connected', accounts: ACCOUNTS });
        render(<BankConnectCard {...props()} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Add a bank' }));
        chooseBank('boursorama');
        expect(screen.getByLabelText(/ID d'identité/)).toBeTruthy();

        fireEvent.change(screen.getByRole('combobox', { name: 'Bank' }), { target: { value: 'caiss' } });
        expect(screen.queryByLabelText(/ID d'identité/)).toBeNull();
        expect((screen.getByRole('button', { name: 'Connect' }) as HTMLButtonElement).disabled).toBe(true);

        chooseBank('caissedepargne');
        fill('Identifier', '1234567890');
        fill('Password', '12345678');
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
        await waitFor(() => expect(login).toHaveBeenCalledOnce());
        expect(login.mock.calls[0][0].module).toBe('caissedepargne');
    });

    it('advanced: Woob\'s latest modules only after the warning is accepted, and back to the verified ones', async () => {
        vi.mocked(woobClient.status).mockResolvedValue({ available: true, banks: BANKS, commit: '49f267fe1d38aaaa', commitDate: '2026-11-20', modules: { channel: 'verified', active: 'verified' } });
        const setModules = vi.spyOn(woobClient, 'setModules').mockResolvedValue({ channel: 'latest', active: 'latest', commit: 'b'.repeat(40), restarting: false });
        render(<BankConnectCard {...props()} />);
        expect(await screen.findByText(/Bank modules verified by GlassFolio \(Woob 49f267f/)).toBeTruthy();

        // Two explicit choices; the verified modules are in use
        expect(screen.getByRole('radio', { name: /Verified by GlassFolio/ }).getAttribute('aria-checked')).toBe('true');
        fireEvent.click(screen.getByRole('radio', { name: /Woob's latest modules/ }));
        const enable = screen.getByRole('button', { name: 'Use the latest modules' });
        expect(enable).toHaveProperty('disabled', true);
        fireEvent.click(screen.getByLabelText(/code not checked by GlassFolio/));
        vi.mocked(woobClient.status).mockResolvedValue({ available: true, banks: BANKS, modules: { channel: 'latest', active: 'latest', commit: 'b'.repeat(40), commitDate: '2026-11-27', updatedAt: '2026-11-27T10:00:00Z' } });
        await act(async () => {
            fireEvent.click(enable);
        });
        expect(setModules).toHaveBeenCalledWith('latest');
        expect(await screen.findByText(/Woob's latest bank modules \(bbbbbbb/)).toBeTruthy();

        const back = vi.spyOn(woobClient, 'setModules').mockResolvedValue({ channel: 'verified', active: 'verified', restarting: false });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Back to the verified modules' }));
        });
        expect(back).toHaveBeenLastCalledWith('verified');
    });
});
