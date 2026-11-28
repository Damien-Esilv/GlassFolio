/**
 * Institutions and accounts (Settings → Institutions & accounts): list them with what feeds each account, and
 * rename them with the user's approval. Deleting stays in the settings, never offered to the assistant: the project
 * exposes no account deletion to AI (tests/unit/services/ai/tools/legalTools.test.ts).
 */
import { AIToolDefinition } from '../types';
import { accountManagementService, type CashAccountKind, type ManagedInstitution, type ManagementResult } from '../../accountManagementService';

export const listInstitutionsTool: AIToolDefinition<Record<string, never>, ManagedInstitution[]> = {
  name: 'list_institutions',
  description:
    'List the institutions (banks, brokers, wallets) and their accounts: id, name, type, currency, number of operations, and the automatic sync that feeds each account (null when it is fed by imports and manual entries).',
  parameters: { type: 'object', properties: {} },
  execute: async () => accountManagementService.listInstitutions(),
};

export const renameAccountTool: AIToolDefinition<{ kind: 'institution' | 'account'; id: string; name: string }, ManagementResult> = {
  name: 'rename_account',
  description:
    'Rename an institution or an account. Requires explicit human confirmation. Use list_institutions to find the id.',
  requiresConfirmation: true,
  parameters: {
    type: 'object',
    properties: {
      kind: { type: 'string', description: 'What to rename', enum: ['institution', 'account'] },
      id: { type: 'string', description: 'Id from list_institutions' },
      name: { type: 'string', description: 'New name (80 characters at most)' },
    },
    required: ['kind', 'id', 'name'],
  },
  execute: async ({ kind, id, name }) =>
    kind === 'institution' ? accountManagementService.renameInstitution(id, name) : accountManagementService.renameAccount(id, name),
};

export const setCashAccountKindTool: AIToolDefinition<{ accountId: string; kind: string }, ManagementResult> = {
  name: 'set_cash_account_kind',
  description:
    'Make a checking account a savings account (Livret…) or the other way round: a checking account takes bank operations, a savings account its operations or its balance. Only between these two types; investment accounts keep theirs. Requires explicit human confirmation. Use list_institutions to find the id.',
  requiresConfirmation: true,
  parameters: {
    type: 'object',
    properties: {
      accountId: { type: 'string', description: 'Account id from list_institutions' },
      kind: { type: 'string', description: 'The new type', enum: ['checking', 'savings'] },
    },
    required: ['accountId', 'kind'],
  },
  execute: async ({ accountId, kind }) => {
    if (kind !== 'checking' && kind !== 'savings') return { success: false, error: 'not_cash_account' };
    return accountManagementService.setCashAccountKind(accountId, kind as CashAccountKind);
  },
};
