import { describe, it, expect } from 'vitest';
import {
    TransactionSchema,
    FinancialGoalSchema,
    PositionSchema,
    CSVRowSchema,
    safeParseTransaction,
    safeParseGoal,
    safeParsePosition
} from '../../../src/types/schemas';

describe('Domain Schemas (Zod)', () => {
    describe('TransactionSchema', () => {
        it('should validate valid transaction data', () => {
            const validTx = {
                id: 'tx-1',
                date: '2026-01-01',
                type: 'Buy',
                amount: 10,
                price: 150,
                total: 1500,
                currency: 'EUR'
            };

            const result = safeParseTransaction(validTx);
            expect(result.success).toBe(true);
        });

        it('should reject transaction missing required fields or invalid enum type', () => {
            const invalidTx = {
                id: 'tx-1',
                type: 'UnknownType'
            };

            const result = safeParseTransaction(invalidTx);
            expect(result.success).toBe(false);
        });
    });

    describe('FinancialGoalSchema', () => {
        it('should validate valid goal data', () => {
            const validGoal = {
                id: 'goal-1',
                title: 'Achat Immobilier',
                targetAmount: 50000,
                iconType: 'home',
                color: 'blue'
            };

            const result = safeParseGoal(validGoal);
            expect(result.success).toBe(true);
        });

        it('should reject goal with invalid targetAmount type or negative number', () => {
            const invalidGoal = {
                id: 'goal-1',
                title: 'Achat Immobilier',
                targetAmount: -500
            };

            const result = safeParseGoal(invalidGoal);
            expect(result.success).toBe(false);
        });
    });

    describe('PositionSchema', () => {
        it('should validate valid portfolio position', () => {
            const validPosition = {
                id: 'pos-1',
                symbol: 'IWDA',
                instrument: 'iShares Core MSCI World',
                quantity: 100,
                avgCost: 75.5,
                lastPrice: 92.3,
                marketValue: 9230,
                unrealizedPL: 1680,
                unrealizedPLPercent: 22.25,
                type: 'ETF',
                currency: 'EUR'
            };

            const result = safeParsePosition(validPosition);
            expect(result.success).toBe(true);
        });
    });

    describe('CSVRowSchema', () => {
        it('should validate valid CSV row dictionary', () => {
            const row = {
                Date: '01/01/2026',
                Montant: '150.00',
                Description: 'Virement'
            };

            const result = CSVRowSchema.safeParse(row);
            expect(result.success).toBe(true);
        });
    });
});
