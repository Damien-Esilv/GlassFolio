import { useState, useEffect } from 'react';
import { Transaction } from '../types';
import { ParsedData } from '../utils/csvUtils'; // removed parseCSV unused import if any
import { transactionService } from '../src/services/transactionService';

export interface MappingState {
    date: string;
    type: string;
    symbol: string;
    amount: string;
    price: string;
    bank?: string;
    account?: string;
}

export interface ProcessedTransaction {
    id: string;
    originalRow: string[];
    formatted: any;
    status: 'valid' | 'error' | 'duplicate';
    resolution?: 'skip' | 'add';
    message?: string;
}

export type ImportType = 'Investment' | 'Cash';

export const useImportLogic = () => { // Removed existingTransactions arg
    const [step, setStep] = useState(1);
    const [source, setSource] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [importType, setImportType] = useState<ImportType>('Investment');

    const [parsedData, setParsedData] = useState<ParsedData>({ headers: [], rows: [] });
    const [mapping, setMapping] = useState<MappingState>({
        date: '', type: '', symbol: '', amount: '', price: '', bank: '', account: ''
    });
    const [processedData, setProcessedData] = useState<ProcessedTransaction[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Auto-detect mapping
    useEffect(() => {
        if (parsedData.headers.length > 0) {
            const newMapping = { ...mapping };
            const lowerHeaders = parsedData.headers.map(h => h.toLowerCase());

            lowerHeaders.forEach((h, i) => {
                const header = parsedData.headers[i];
                if (h.includes('date') || h.includes('time')) newMapping.date = header;
                else if (h.includes('type') || h.includes('side') || h.includes('action')) newMapping.type = header;
                else if (h.includes('symbol') || h.includes('ticker') || h.includes('asset')) newMapping.symbol = header;
                else if (h.includes('amount') || h.includes('qty') || h.includes('quantité')) newMapping.amount = header;
                else if (h.includes('price') || h.includes('prix') || h.includes('unit')) newMapping.price = header;
                else if (h.includes('bank') || h.includes('banque')) newMapping.bank = header;
                else if (h.includes('account') || h.includes('compte') || h.includes('livret')) newMapping.account = header;
            });
            setMapping(newMapping);
        }
    }, [parsedData]);

    const normalizeType = (raw: string): 'Buy' | 'Sell' | 'Deposit' | 'Withdrawal' => {
        if (!raw) return 'Buy';
        const lower = raw.toLowerCase();
        if (lower.includes('buy') || lower.includes('achat')) return 'Buy';
        if (lower.includes('sell') || lower.includes('vente')) return 'Sell';
        if (lower.includes('deposit') || lower.includes('dépôt') || lower.includes('virement reçu')) return 'Deposit';
        if (lower.includes('withdrawal') || lower.includes('retrait') || lower.includes('virement émis')) return 'Withdrawal';
        return 'Buy';
    };

    const analyzeData = async () => {
        setIsAnalyzing(true);
        try {
            // Fetch existing transactions to check for duplicates
            // In a real app, we might send the batch to the server to check, 
            // but here we fetch the relevant comparison list.
            const existingTransactions = await transactionService.checkDuplicates();

            const dateIdx = parsedData.headers.indexOf(mapping.date);
            const typeIdx = parsedData.headers.indexOf(mapping.type);
            const symbolIdx = parsedData.headers.indexOf(mapping.symbol);
            const amountIdx = parsedData.headers.indexOf(mapping.amount);
            const priceIdx = parsedData.headers.indexOf(mapping.price);
            const bankIdx = mapping.bank ? parsedData.headers.indexOf(mapping.bank) : -1;
            const accountIdx = mapping.account ? parsedData.headers.indexOf(mapping.account) : -1;

            const results: ProcessedTransaction[] = parsedData.rows.map((row, idx) => {
                const rawDate = row[dateIdx];
                const rawType = row[typeIdx];
                const rawSymbol = row[symbolIdx] || '';
                const rawAmount = row[amountIdx];
                const rawPrice = row[priceIdx];
                const rawBank = bankIdx >= 0 && bankIdx < row.length ? row[bankIdx] : undefined;
                const rawAccount = accountIdx >= 0 && accountIdx < row.length ? row[accountIdx] : undefined;

                // Validation based on Import Type
                const missingFields = [];
                if (!rawDate) missingFields.push('Date');

                if (importType === 'Investment') {
                    if (!rawSymbol) missingFields.push('Symbol');
                } else {
                    // For Cash, we might enforce Bank/Account if not provided
                    if (!rawBank && !rawAccount) {
                        // It's okay if they are optional, but good for tracking
                    }
                }

                if (missingFields.length > 0) {
                    return {
                        id: `row-${idx}`,
                        originalRow: row,
                        formatted: {},
                        status: 'error',
                        message: `Missing fields: ${missingFields.join(', ')}`
                    };
                }

                const formattedDate = rawDate.replace('T', ' ').substring(0, 19);
                const formattedType = normalizeType(rawType);
                const formattedAmount = parseFloat(rawAmount?.replace(',', '.') || '0');
                const formattedPrice = parseFloat(rawPrice?.replace(',', '.') || '0');

                // Duplicate Logic
                const isDuplicate = existingTransactions.some(t => {
                    const dbDate = t.date.substring(0, 10);
                    const importDate = formattedDate.substring(0, 10);

                    if (importType === 'Cash') {
                        // For Cash: Check Date, Amount, Type, and potentially Bank/Account
                        return t.type === formattedType &&
                            (dbDate === importDate && Math.abs(t.amount - formattedAmount) < 0.0001) &&
                            t.assetClass === 'Cash' &&
                            (t.bankName === rawBank || (!t.bankName && !rawBank));
                    } else {
                        // For Investment: Check Date, Symbol, Type, Amount
                        return t.symbol === rawSymbol &&
                            t.type === formattedType &&
                            (dbDate === importDate && Math.abs(t.amount - formattedAmount) < 0.0001);
                    }
                });

                return {
                    id: `row-${idx}`,
                    originalRow: row,
                    formatted: {
                        date: formattedDate,
                        type: formattedType,
                        instrument: importType === 'Cash' ? (rawBank || 'Cash Account') : rawSymbol,
                        symbol: importType === 'Cash' ? (rawBank || 'CASH') : rawSymbol,
                        amount: formattedAmount,
                        price: formattedPrice,
                        total: formattedAmount * formattedPrice,
                        currency: 'USD',
                        source: source,
                        status: 'Completed',
                        bankName: rawBank,
                        accountName: rawAccount,
                        assetClass: importType // 'Cash' or 'Investment' (mapped to specific types later)
                    },
                    status: isDuplicate ? 'duplicate' : 'valid',
                    resolution: isDuplicate ? 'skip' : undefined,
                    message: isDuplicate ? 'Potential duplicate detected' : undefined
                };
            });

            setProcessedData(results);
            setStep(4);
        } catch (error) {
            console.error("Analysis failed", error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    return {
        step, setStep,
        source, setSource,
        file, setFile,
        importType, setImportType,
        parsedData, setParsedData,
        mapping, setMapping,
        processedData, setProcessedData,
        analyzeData,
        isAnalyzing
    };
};
