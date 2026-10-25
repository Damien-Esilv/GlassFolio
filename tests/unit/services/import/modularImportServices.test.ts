import { describe, it, expect, beforeEach } from 'vitest';
import { detectPreset, getPresetMappings, PRESET_PATTERNS } from '../../../../src/services/import/presetDetector';
import {
  normalizeTransactionType,
  inferTransactionSubType,
  parseDate,
  parseDecimal,
} from '../../../../src/services/import/typeNormalizer';
import {
  saveMappingTemplate,
  getMappingTemplates,
  deleteMappingTemplate,
} from '../../../../src/services/import/mappingTemplateService';
import { db } from '../../../../src/services/db';

describe('Modular Import Subsystems (Pilier 2)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('presetDetector', () => {
    it('detects Binance CSV headers with high confidence', () => {
      const headers = ['UTC_Time', 'Account', 'Operation', 'Coin', 'Change', 'Remark'];
      const detected = detectPreset(headers);
      expect(detected).not.toBeNull();
      expect(detected?.presetName).toBe('Binance');
      expect(detected?.mappings.transactionDate).toBe('UTC_Time');
      expect(detected?.mappings.assetSymbol).toBe('Coin');
    });

    it('detects BoursoBank CSV headers', () => {
      const headers = ['dateOp', 'dateVal', 'label', 'amount', 'accountBalance'];
      const detected = detectPreset(headers);
      expect(detected).not.toBeNull();
      expect(detected?.presetName).toBe('Bourso');
      expect(detected?.mappings.amountPrimary).toBe('amount');
    });

    it('returns null when headers do not match any preset', () => {
      const headers = ['random_column_1', 'foo', 'bar'];
      const detected = detectPreset(headers);
      expect(detected).toBeNull();
    });

    it('returns fallback mappings for custom preset names', () => {
      // E28: "Quantity" is a quantity, never the cash amount (amount is derived from qty × price)
      const headers = ['Date', 'Side', 'Ticker', 'Quantity', 'Price', 'Fee'];
      const mappings = getPresetMappings('CustomUnknown', headers);
      expect(mappings.transactionDate).toBe('Date');
      expect(mappings.type).toBe('Side');
      expect(mappings.assetSymbol).toBe('Ticker');
      expect(mappings.quantity).toBe('Quantity');
      expect(mappings.amountPrimary).toBe('');
      expect(mappings.priceUnit).toBe('Price');
      expect(mappings.feeAmount).toBe('Fee');
    });
  });

  describe('typeNormalizer', () => {
    it('normalizes various language purchase patterns to BUY', () => {
      expect(normalizeTransactionType('ACHAT COMPTANT')).toBe('BUY');
      expect(normalizeTransactionType('Purchase Crypto')).toBe('BUY');
      expect(normalizeTransactionType('Buy')).toBe('BUY');
    });

    it('normalizes sale, deposit, withdraw and income types', () => {
      expect(normalizeTransactionType('Vente d actions')).toBe('SELL');
      expect(normalizeTransactionType('Dépôt virement reçu')).toBe('DEPOSIT');
      expect(normalizeTransactionType('Retrait DAB')).toBe('WITHDRAW');
      expect(normalizeTransactionType('Dividende perçu')).toBe('INCOME');
      expect(normalizeTransactionType('Frais de courtage')).toBe('EXPENSE');
      expect(normalizeTransactionType('Virement interne')).toBe('TRANSFER');
      expect(normalizeTransactionType('Swap tokens')).toBe('SWAP');
    });

    it('infers granular transaction sub-types', () => {
      expect(inferTransactionSubType('Dividende annuel')).toBe('DIVIDEND');
      expect(inferTransactionSubType('Interest payment')).toBe('INTEREST');
      expect(inferTransactionSubType('Stake reward')).toBe('STAKING_REWARD');
      expect(inferTransactionSubType('Community airdrop')).toBe('AIRDROP');
      expect(inferTransactionSubType('Unknown text')).toBeUndefined();
    });

    it('parses dates across ISO, European, and US formats', () => {
      expect(parseDate('2026-03-15T12:00:00Z')).toBe('2026-03-15T12:00:00.000Z');
      const euro = parseDate('15/03/2026 14:30');
      expect(euro).not.toBeNull();
      expect(euro?.startsWith('2026-03-15')).toBe(true);

      const us = parseDate('03/15/2026', 'MM/DD/YYYY');
      expect(us).not.toBeNull();
      expect(us?.startsWith('2026-03-15')).toBe(true);
      expect(parseDate('')).toBeNull();
    });

    it('parses decimal numbers in European and US notations', () => {
      // European: thousands separator = dot, decimal = comma
      expect(parseDecimal('1.250,50 €')).toBe('1250.5');
      // Simple comma decimal
      expect(parseDecimal('1250,50')).toBe('1250.5');
      // US: thousands separator = comma, decimal = dot  
      expect(parseDecimal('$1,250.50')).toBe('1250.5');
      // Negative plain float
      expect(parseDecimal('-45.20')).toBe('-45.2');
      // Invalid returns null
      expect(parseDecimal('invalid')).toBeNull();
      expect(parseDecimal('')).toBeNull();
    });
  });

  describe('mappingTemplateService', () => {
    it('creates, retrieves, and deletes custom mapping templates', async () => {
      const template = await saveMappingTemplate(
        'Mon Template Bourso',
        {
          transactionDate: 'Date',
          amountPrimary: 'Montant',
          assetSymbol: 'Valeur',
        },
        'user-123'
      );

      expect(template.id).toBeDefined();
      expect(template.name).toBe('Mon Template Bourso');

      const all = await getMappingTemplates();
      expect(all.some(t => t.id === template.id)).toBe(true);

      const deleted = await deleteMappingTemplate(template.id);
      expect(deleted).toBe(true);

      const afterDelete = await getMappingTemplates();
      expect(afterDelete.some(t => t.id === template.id)).toBe(false);
    });
  });
});
