import { Position } from '../../types';
import { currencyService } from './currencyService';
import { formatChartDate, DateFormatPattern } from '../../utils/date';

export interface ETFInfo {
    symbol: string;
    name: string;
    isin?: string;
    ter: number; // e.g. 0.38 for 0.38%
    category: string; // e.g. "MSCI World", "S&P 500", "All-World", "US Tech"
    yahooUrl: string;
    exchange?: string;
}

export interface ETFRecommendation {
    heldPosition: Position;
    currentTer: number;
    currentAnnualCost: number;
    cheapestSimilar: ETFInfo;
    cheapestAnnualCost: number;
    annualSavings: number;
}

export interface FeeAnalysisResult {
    totalHeldEtfValue: number;
    currentAnnualFees: number;
    alternativeAnnualFees: number;
    potentialAnnualSavings: number;
    recommendations: ETFRecommendation[];
}

export interface FeeDragPoint {
    year: number;
    currentFeeValue: number;
    optimizedFeeValue: number;
    feeDragSavings: number;
}

// Built-in reference database for ETF TERs & Alternatives (Yahoo Finance format)
export const KNOWN_ETF_DB: Record<string, ETFInfo> = {
    // MSCI World
    'CW8': {
        symbol: 'CW8.PA',
        name: 'Amundi MSCI World UCITS ETF',
        isin: 'LU1681043599',
        ter: 0.38,
        category: 'MSCI World',
        yahooUrl: 'https://finance.yahoo.com/quote/CW8.PA'
    },
    'WPEA': {
        symbol: 'WPEA.PA',
        name: 'iShares MSCI World Swap UCITS ETF',
        isin: 'IE0002XZS0E5',
        ter: 0.20,
        category: 'MSCI World',
        yahooUrl: 'https://finance.yahoo.com/quote/WPEA.PA'
    },
    'SWDA': {
        symbol: 'SWDA.L',
        name: 'iShares Core MSCI World UCITS ETF',
        isin: 'IE00B4L5Y983',
        ter: 0.20,
        category: 'MSCI World',
        yahooUrl: 'https://finance.yahoo.com/quote/SWDA.L'
    },

    // All World
    'VT': {
        symbol: 'VT',
        name: 'Vanguard Total World Stock ETF',
        isin: 'US9220427424',
        ter: 0.07,
        category: 'All-World',
        yahooUrl: 'https://finance.yahoo.com/quote/VT'
    },
    'VWCE': {
        symbol: 'VWCE.DE',
        name: 'Vanguard FTSE All-World UCITS ETF',
        isin: 'IE00BK5BQT33',
        ter: 0.22,
        category: 'All-World',
        yahooUrl: 'https://finance.yahoo.com/quote/VWCE.DE'
    },

    // S&P 500
    'ESE': {
        symbol: 'ESE.PA',
        name: 'BNP Paribas Easy S&P 500 UCITS ETF',
        isin: 'FR0011550185',
        ter: 0.15,
        category: 'S&P 500',
        yahooUrl: 'https://finance.yahoo.com/quote/ESE.PA'
    },
    'CSPX': {
        symbol: 'CSPX.L',
        name: 'iShares Core S&P 500 UCITS ETF',
        isin: 'IE00B5BMR087',
        ter: 0.07,
        category: 'S&P 500',
        yahooUrl: 'https://finance.yahoo.com/quote/CSPX.L'
    },
    'VOO': {
        symbol: 'VOO',
        name: 'Vanguard S&P 500 ETF',
        isin: 'US9229083632',
        ter: 0.03,
        category: 'S&P 500',
        yahooUrl: 'https://finance.yahoo.com/quote/VOO'
    }
};

// Map of categories to cheapest alternatives
const CHEAPEST_ALTERNATIVES_BY_CATEGORY: Record<string, ETFInfo> = {
    'MSCI World': KNOWN_ETF_DB['WPEA'],
    'All-World': KNOWN_ETF_DB['VT'],
    'S&P 500': KNOWN_ETF_DB['VOO']
};

export const etfFeeService = {
    /**
     * Get ETF Info from reference DB or return fallback metadata.
     */
    getEtfInfo: (symbol: string, fallbackName?: string): ETFInfo => {
        const symbolUpper = symbol.toUpperCase();
        if (KNOWN_ETF_DB[symbolUpper]) return KNOWN_ETF_DB[symbolUpper];
        const baseSymbol = symbolUpper.split('.')[0];
        if (KNOWN_ETF_DB[baseSymbol]) return KNOWN_ETF_DB[baseSymbol];

        return {
            symbol: symbol,
            name: fallbackName || symbol,
            ter: 0.35,
            category: 'Equity ETF',
            yahooUrl: `https://finance.yahoo.com/quote/${symbol}`
        };
    },

    /**
     * Analyze ETF holdings for TER costs and cheaper alternatives.
     */
    analyzeEtfFees: (positions: Position[], baseCurrency: string = 'EUR'): FeeAnalysisResult => {
        const etfPositions = positions.filter(p => p.type === 'ETF');

        let totalHeldEtfValue = 0;
        let currentAnnualFees = 0;
        let alternativeAnnualFees = 0;
        const recommendations: ETFRecommendation[] = [];

        for (const pos of etfPositions) {
            const valInBase = currencyService.convertAmount(pos.marketValue, pos.currency || 'EUR', baseCurrency);
            totalHeldEtfValue += valInBase;

            // Lookup known ETF info or default to standard TER
            const symbolUpper = pos.symbol.toUpperCase();
            const knownInfo = KNOWN_ETF_DB[symbolUpper] || {
                symbol: pos.symbol,
                name: pos.instrument,
                ter: 0.35, // Default estimated TER
                category: 'MSCI World',
                yahooUrl: `https://finance.yahoo.com/quote/${pos.symbol}`
            };

            const currentTer = knownInfo.ter;
            const currentCost = valInBase * (currentTer / 100);
            currentAnnualFees += currentCost;

            // Find cheapest alternative in same category
            const category = knownInfo.category || 'MSCI World';
            let cheapest = CHEAPEST_ALTERNATIVES_BY_CATEGORY[category] || KNOWN_ETF_DB['WPEA'];

            // If user already holds the cheapest alternative, keep it
            if (cheapest.symbol.toUpperCase().startsWith(symbolUpper)) {
                cheapest = knownInfo;
            }

            const cheapestCost = valInBase * (cheapest.ter / 100);
            alternativeAnnualFees += cheapestCost;

            const savings = Math.max(0, currentCost - cheapestCost);

            recommendations.push({
                heldPosition: pos,
                currentTer,
                currentAnnualCost: currentCost,
                cheapestSimilar: cheapest,
                cheapestAnnualCost: cheapestCost,
                annualSavings: savings
            });
        }

        return {
            totalHeldEtfValue,
            currentAnnualFees,
            alternativeAnnualFees,
            potentialAnnualSavings: Math.max(0, currentAnnualFees - alternativeAnnualFees),
            recommendations
        };
    },

    /**
     * Calculate compounding fee drag over long horizons (10, 20, 30, 50 years).
     * Assumes average gross return of 7% per year before fees.
     */
    calculateFeeDragProjection: (
        initialAmount: number,
        currentAvgTer: number,
        alternativeAvgTer: number,
        maxYears: number = 50,
        grossReturnPct: number = 7.0
    ): FeeDragPoint[] => {
        const points: FeeDragPoint[] = [];

        const grossRate = grossReturnPct / 100;
        const currentNetRate = grossRate - (currentAvgTer / 100);
        const altNetRate = grossRate - (alternativeAvgTer / 100);

        for (let yr = 0; yr <= maxYears; yr += (maxYears <= 20 ? 1 : 5)) {
            if (yr === 0) {
                points.push({
                    year: 0,
                    currentFeeValue: initialAmount,
                    optimizedFeeValue: initialAmount,
                    feeDragSavings: 0
                });
                continue;
            }

            const currentVal = Math.round(initialAmount * Math.pow(1 + currentNetRate, yr));
            const altVal = Math.round(initialAmount * Math.pow(1 + altNetRate, yr));
            const savings = Math.max(0, altVal - currentVal);

            points.push({
                year: yr,
                currentFeeValue: currentVal,
                optimizedFeeValue: altVal,
                feeDragSavings: savings
            });
        }

        return points;
    },

    getSideBySideEtfComparisonData: (
        symbols: string[],
        pointsCount = 12,
        locale = 'fr-FR',
        dateFormatPattern: DateFormatPattern = 'DD/MM/YYYY'
    ) => {
        const now = new Date();

        return Array.from({ length: pointsCount }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - (pointsCount - 1 - i), 1);
            const monthLabel = formatChartDate(d, 'month', dateFormatPattern, locale);

            const point: Record<string, string | number> = {
                month: monthLabel
            };

            symbols.forEach((sym, symIdx) => {
                const symUpper = sym.toUpperCase();
                const info = KNOWN_ETF_DB[symUpper] || etfFeeService.getEtfInfo(symUpper);

                // Deterministic pseudo-random seed per symbol based on ticker characters
                const charSum = symUpper.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
                const seedOffset = (charSum % 10) * 0.15;
                const waveFreq = 0.8 + ((charSum % 5) * 0.1);

                // Category-based baseline growth factor
                let baseTrend = 1.6;
                if (info.category?.includes('S&P')) baseTrend = 2.1;
                else if (info.category?.includes('World')) baseTrend = 1.75;
                else if (info.category?.includes('All-World')) baseTrend = 1.45;

                // Base normalized growth starting at 100
                const trendGrowth = (i * baseTrend) + (Math.sin((i + symIdx * 2) * waveFreq) * (1.2 + seedOffset));
                const grossValue = 100 + trendGrowth;

                // Subtract TER fee drag accrued over time
                const accumulatedFeeDrag = (info.ter / 100) * (i / (pointsCount / 12));
                const netValue = Math.round((grossValue * (1 - accumulatedFeeDrag)) * 100) / 100;

                point[sym] = netValue;
            });

            return point;
        });
    },

    /**
     * Retrieve Sector and Geographical allocation breakdown for an ETF symbol.
     */
    getEtfBreakdown: (symbol: string): ETFBreakdownData => {
        const symbolUpper = symbol.toUpperCase();
        if (KNOWN_ETF_BREAKDOWNS[symbolUpper]) return KNOWN_ETF_BREAKDOWNS[symbolUpper];
        const baseSymbol = symbolUpper.split('.')[0];
        if (KNOWN_ETF_BREAKDOWNS[baseSymbol]) return KNOWN_ETF_BREAKDOWNS[baseSymbol];

        const info = etfFeeService.getEtfInfo(symbolUpper);
        if (info.category?.includes('S&P')) {
            return KNOWN_ETF_BREAKDOWNS['VOO'];
        } else if (info.category?.includes('All-World')) {
            return KNOWN_ETF_BREAKDOWNS['VT'];
        }

        // Default MSCI World baseline breakdown
        return KNOWN_ETF_BREAKDOWNS['CW8'];
    }
};

export interface AllocationItem {
    key: string;
    labelKey: string;
    percentage: number;
}

export interface ETFBreakdownData {
    sectors: AllocationItem[];
    geography: AllocationItem[];
}

export const KNOWN_ETF_BREAKDOWNS: Record<string, ETFBreakdownData> = {
    // MSCI World (CW8, WPEA, SWDA)
    'CW8': {
        sectors: [
            { key: 'tech', labelKey: 'sectorTech', percentage: 25.4 },
            { key: 'financials', labelKey: 'sectorFinancials', percentage: 15.2 },
            { key: 'healthcare', labelKey: 'sectorHealthcare', percentage: 12.1 },
            { key: 'industrials', labelKey: 'sectorIndustrials', percentage: 10.8 },
            { key: 'consumer', labelKey: 'sectorConsumer', percentage: 10.2 },
            { key: 'comm', labelKey: 'sectorComm', percentage: 8.4 },
            { key: 'energy', labelKey: 'sectorEnergy', percentage: 4.1 },
            { key: 'utilities', labelKey: 'sectorUtilities', percentage: 2.8 },
            { key: 'materials', labelKey: 'sectorMaterials', percentage: 2.7 },
            { key: 'realestate', labelKey: 'sectorRealEstate', percentage: 2.3 }
        ],
        geography: [
            { key: 'us', labelKey: 'regionUs', percentage: 70.8 },
            { key: 'japan', labelKey: 'regionJapan', percentage: 6.2 },
            { key: 'europe', labelKey: 'regionEurope', percentage: 14.5 },
            { key: 'asia', labelKey: 'regionAsia', percentage: 3.5 },
            { key: 'others', labelKey: 'regionOthers', percentage: 5.0 }
        ]
    },
    'WPEA': {
        sectors: [
            { key: 'tech', labelKey: 'sectorTech', percentage: 25.8 },
            { key: 'financials', labelKey: 'sectorFinancials', percentage: 15.0 },
            { key: 'healthcare', labelKey: 'sectorHealthcare', percentage: 12.3 },
            { key: 'industrials', labelKey: 'sectorIndustrials', percentage: 10.6 },
            { key: 'consumer', labelKey: 'sectorConsumer', percentage: 10.1 },
            { key: 'comm', labelKey: 'sectorComm', percentage: 8.5 },
            { key: 'energy', labelKey: 'sectorEnergy', percentage: 4.0 },
            { key: 'utilities', labelKey: 'sectorUtilities', percentage: 2.9 },
            { key: 'materials', labelKey: 'sectorMaterials', percentage: 2.6 },
            { key: 'realestate', labelKey: 'sectorRealEstate', percentage: 2.2 }
        ],
        geography: [
            { key: 'us', labelKey: 'regionUs', percentage: 71.1 },
            { key: 'japan', labelKey: 'regionJapan', percentage: 6.0 },
            { key: 'europe', labelKey: 'regionEurope', percentage: 14.3 },
            { key: 'asia', labelKey: 'regionAsia', percentage: 3.6 },
            { key: 'others', labelKey: 'regionOthers', percentage: 5.0 }
        ]
    },
    'SWDA': {
        sectors: [
            { key: 'tech', labelKey: 'sectorTech', percentage: 25.5 },
            { key: 'financials', labelKey: 'sectorFinancials', percentage: 15.1 },
            { key: 'healthcare', labelKey: 'sectorHealthcare', percentage: 12.2 },
            { key: 'industrials', labelKey: 'sectorIndustrials', percentage: 10.7 },
            { key: 'consumer', labelKey: 'sectorConsumer', percentage: 10.2 },
            { key: 'comm', labelKey: 'sectorComm', percentage: 8.4 },
            { key: 'energy', labelKey: 'sectorEnergy', percentage: 4.1 },
            { key: 'utilities', labelKey: 'sectorUtilities', percentage: 2.8 },
            { key: 'materials', labelKey: 'sectorMaterials', percentage: 2.7 },
            { key: 'realestate', labelKey: 'sectorRealEstate', percentage: 2.3 }
        ],
        geography: [
            { key: 'us', labelKey: 'regionUs', percentage: 70.9 },
            { key: 'japan', labelKey: 'regionJapan', percentage: 6.1 },
            { key: 'europe', labelKey: 'regionEurope', percentage: 14.4 },
            { key: 'asia', labelKey: 'regionAsia', percentage: 3.5 },
            { key: 'others', labelKey: 'regionOthers', percentage: 5.1 }
        ]
    },

    // S&P 500 (VOO, CSPX, ESE)
    'VOO': {
        sectors: [
            { key: 'tech', labelKey: 'sectorTech', percentage: 31.8 },
            { key: 'financials', labelKey: 'sectorFinancials', percentage: 13.2 },
            { key: 'healthcare', labelKey: 'sectorHealthcare', percentage: 11.8 },
            { key: 'consumer', labelKey: 'sectorConsumer', percentage: 10.3 },
            { key: 'comm', labelKey: 'sectorComm', percentage: 8.9 },
            { key: 'industrials', labelKey: 'sectorIndustrials', percentage: 8.4 },
            { key: 'energy', labelKey: 'sectorEnergy', percentage: 3.7 },
            { key: 'utilities', labelKey: 'sectorUtilities', percentage: 2.4 },
            { key: 'realestate', labelKey: 'sectorRealEstate', percentage: 2.3 },
            { key: 'materials', labelKey: 'sectorMaterials', percentage: 1.8 }
        ],
        geography: [
            { key: 'us', labelKey: 'regionUs', percentage: 98.6 },
            { key: 'europe', labelKey: 'regionEurope', percentage: 0.8 },
            { key: 'others', labelKey: 'regionOthers', percentage: 0.6 }
        ]
    },
    'CSPX': {
        sectors: [
            { key: 'tech', labelKey: 'sectorTech', percentage: 31.7 },
            { key: 'financials', labelKey: 'sectorFinancials', percentage: 13.3 },
            { key: 'healthcare', labelKey: 'sectorHealthcare', percentage: 11.9 },
            { key: 'consumer', labelKey: 'sectorConsumer', percentage: 10.2 },
            { key: 'comm', labelKey: 'sectorComm', percentage: 9.0 },
            { key: 'industrials', labelKey: 'sectorIndustrials', percentage: 8.3 },
            { key: 'energy', labelKey: 'sectorEnergy', percentage: 3.6 },
            { key: 'utilities', labelKey: 'sectorUtilities', percentage: 2.5 },
            { key: 'realestate', labelKey: 'sectorRealEstate', percentage: 2.2 },
            { key: 'materials', labelKey: 'sectorMaterials', percentage: 1.8 }
        ],
        geography: [
            { key: 'us', labelKey: 'regionUs', percentage: 98.7 },
            { key: 'europe', labelKey: 'regionEurope', percentage: 0.7 },
            { key: 'others', labelKey: 'regionOthers', percentage: 0.6 }
        ]
    },
    'ESE': {
        sectors: [
            { key: 'tech', labelKey: 'sectorTech', percentage: 31.9 },
            { key: 'financials', labelKey: 'sectorFinancials', percentage: 13.1 },
            { key: 'healthcare', labelKey: 'sectorHealthcare', percentage: 11.7 },
            { key: 'consumer', labelKey: 'sectorConsumer', percentage: 10.4 },
            { key: 'comm', labelKey: 'sectorComm', percentage: 8.8 },
            { key: 'industrials', labelKey: 'sectorIndustrials', percentage: 8.5 },
            { key: 'energy', labelKey: 'sectorEnergy', percentage: 3.8 },
            { key: 'utilities', labelKey: 'sectorUtilities', percentage: 2.3 },
            { key: 'realestate', labelKey: 'sectorRealEstate', percentage: 2.4 },
            { key: 'materials', labelKey: 'sectorMaterials', percentage: 1.7 }
        ],
        geography: [
            { key: 'us', labelKey: 'regionUs', percentage: 98.5 },
            { key: 'europe', labelKey: 'regionEurope', percentage: 0.9 },
            { key: 'others', labelKey: 'regionOthers', percentage: 0.6 }
        ]
    },

    // All-World (VT, VWCE)
    'VT': {
        sectors: [
            { key: 'tech', labelKey: 'sectorTech', percentage: 23.8 },
            { key: 'financials', labelKey: 'sectorFinancials', percentage: 16.0 },
            { key: 'industrials', labelKey: 'sectorIndustrials', percentage: 11.2 },
            { key: 'healthcare', labelKey: 'sectorHealthcare', percentage: 11.0 },
            { key: 'consumer', labelKey: 'sectorConsumer', percentage: 10.5 },
            { key: 'comm', labelKey: 'sectorComm', percentage: 7.8 },
            { key: 'energy', labelKey: 'sectorEnergy', percentage: 4.5 },
            { key: 'materials', labelKey: 'sectorMaterials', percentage: 4.2 },
            { key: 'utilities', labelKey: 'sectorUtilities', percentage: 3.1 },
            { key: 'realestate', labelKey: 'sectorRealEstate', percentage: 2.7 }
        ],
        geography: [
            { key: 'us', labelKey: 'regionUs', percentage: 62.4 },
            { key: 'europe', labelKey: 'regionEurope', percentage: 15.2 },
            { key: 'em', labelKey: 'regionEmerging', percentage: 10.1 },
            { key: 'japan', labelKey: 'regionJapan', percentage: 6.0 },
            { key: 'asia', labelKey: 'regionAsia', percentage: 3.8 },
            { key: 'others', labelKey: 'regionOthers', percentage: 2.5 }
        ]
    },
    'VWCE': {
        sectors: [
            { key: 'tech', labelKey: 'sectorTech', percentage: 24.1 },
            { key: 'financials', labelKey: 'sectorFinancials', percentage: 15.8 },
            { key: 'industrials', labelKey: 'sectorIndustrials', percentage: 11.1 },
            { key: 'healthcare', labelKey: 'sectorHealthcare', percentage: 11.2 },
            { key: 'consumer', labelKey: 'sectorConsumer', percentage: 10.4 },
            { key: 'comm', labelKey: 'sectorComm', percentage: 7.9 },
            { key: 'energy', labelKey: 'sectorEnergy', percentage: 4.4 },
            { key: 'materials', labelKey: 'sectorMaterials', percentage: 4.1 },
            { key: 'utilities', labelKey: 'sectorUtilities', percentage: 3.0 },
            { key: 'realestate', labelKey: 'sectorRealEstate', percentage: 2.6 }
        ],
        geography: [
            { key: 'us', labelKey: 'regionUs', percentage: 61.8 },
            { key: 'europe', labelKey: 'regionEurope', percentage: 15.5 },
            { key: 'em', labelKey: 'regionEmerging', percentage: 10.3 },
            { key: 'japan', labelKey: 'regionJapan', percentage: 6.1 },
            { key: 'asia', labelKey: 'regionAsia', percentage: 3.7 },
            { key: 'others', labelKey: 'regionOthers', percentage: 2.6 }
        ]
    }
};
