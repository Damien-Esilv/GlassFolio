import { AIToolDefinition } from '../types';
import {
  INSTRUMENT_TYPES,
  InstrumentPatch,
  InstrumentValidationError,
  instrumentService,
} from '../../instrumentService';
import type { InstrumentType } from '../../../types';

export const listInstrumentsTool: AIToolDefinition<
  { searchQuery?: string },
  Array<{
    instrumentId: string;
    name: string;
    symbol: string;
    type: string;
    isin?: string;
    exchange?: string;
    network?: string;
    currency: string;
    isMarketReady: boolean;
  }>
> = {
  name: 'list_instruments',
  description:
    'List the assets (instruments) known to the portfolio with their id, symbol, type (stock, etf, fund, crypto, cash, bond, other), ISIN and market identifiers. Use it to find the id before editing an asset.',
  parameters: {
    type: 'object',
    properties: {
      searchQuery: { type: 'string', description: 'Filter by symbol, name or ISIN' },
    },
  },
  execute: async ({ searchQuery }) => {
    const query = (searchQuery || '').trim().toLowerCase();
    const all = await instrumentService.getInstruments();
    return all
      .filter(i =>
        !query ||
        i.name.toLowerCase().includes(query) ||
        i.marketIdentifier.symbol.toLowerCase().includes(query) ||
        (i.marketIdentifier.isin ?? '').toLowerCase().includes(query)
      )
      .map(i => ({
        instrumentId: i.id,
        name: i.name,
        symbol: i.marketIdentifier.symbol,
        type: i.type,
        isin: i.marketIdentifier.isin,
        exchange: i.marketIdentifier.exchange,
        network: i.marketIdentifier.network,
        currency: i.denominationCurrency,
        isMarketReady: i.isMarketReady,
      }));
  },
};

interface UpdateInstrumentParams {
  instrumentId?: string;
  symbol?: string;
  name?: string;
  newSymbol?: string;
  type?: InstrumentType;
  isin?: string;
  exchange?: string;
  network?: string;
  contractAddress?: string;
  currency?: string;
  mergeIntoId?: string;
}

export const updateInstrumentTool: AIToolDefinition<UpdateInstrumentParams, { success: boolean; message: string }> = {
  name: 'update_instrument',
  description:
    'Edit the metadata of an asset (name, symbol, type, ISIN, exchange, network, contract address, currency), for example to move a token from stocks to crypto. Positions and tax figures are recomputed. Identify the asset with instrumentId (see list_instruments) or its current symbol. Requires explicit human confirmation before execution.',
  requiresConfirmation: true,
  parameters: {
    type: 'object',
    properties: {
      instrumentId: { type: 'string', description: 'Id of the asset (from list_instruments)' },
      symbol: { type: 'string', description: 'Current symbol of the asset, when the id is not known' },
      name: { type: 'string', description: 'New display name' },
      newSymbol: { type: 'string', description: 'New symbol / ticker' },
      type: { type: 'string', description: 'New asset type', enum: [...INSTRUMENT_TYPES] },
      isin: { type: 'string', description: 'New ISIN (empty string clears it)' },
      exchange: { type: 'string', description: 'Exchange or market (empty string clears it)' },
      network: { type: 'string', description: 'Blockchain network for crypto (empty string clears it)' },
      contractAddress: { type: 'string', description: 'Token contract address for crypto (empty string clears it)' },
      currency: { type: 'string', description: 'Denomination currency code' },
      mergeIntoId: { type: 'string', description: 'Id of a duplicate asset to merge this one into (moves its transactions)' },
    },
  },
  execute: async params => {
    const target = params.instrumentId
      ? (await instrumentService.getInstrumentById(params.instrumentId))
      : params.symbol
        ? instrumentService.findInstrumentForPosition({ symbol: params.symbol })
        : undefined;
    if (!target) return { success: false, message: 'Asset not found: give a valid instrumentId or its current symbol.' };

    const patch: InstrumentPatch = {
      name: params.name,
      symbol: params.newSymbol,
      type: params.type,
      isin: params.isin,
      exchange: params.exchange,
      network: params.network,
      contractAddress: params.contractAddress,
      denominationCurrency: params.currency,
    };
    try {
      const { instrument } = await instrumentService.updateInstrument(target.id, patch, { mergeInto: params.mergeIntoId });
      return { success: true, message: `Asset ${instrument.marketIdentifier.symbol} updated (${instrument.type}).` };
    } catch (err: unknown) {
      if (err instanceof InstrumentValidationError) {
        return { success: false, message: `Not saved: ${err.issues.filter(i => i.severity === 'error').map(i => i.code).join(', ')}.` };
      }
      return { success: false, message: err instanceof Error ? err.message : 'The asset could not be updated.' };
    }
  },
};
