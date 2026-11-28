/**
 * Centred Sankey columns (Epic E52): every stage sits on the chart's middle.
 */
import { describe, it, expect } from 'vitest';
import { centredColumnOffsets } from '../../../../src/services/cashflow/sankeyLayout';

describe('centred Sankey columns', () => {
    it('shifts each column by half of its free height, the tightest column filling the height', () => {
        // salary -> income -> {savings, expenses}; expenses -> {rent, food}
        const nodes = [{}, {}, {}, {}, {}, {}];
        const links = [
            { source: 0, target: 1, value: 100 },
            { source: 1, target: 2, value: 40 },
            { source: 1, target: 3, value: 60 },
            { source: 3, target: 4, value: 30 },
            { source: 3, target: 5, value: 30 },
        ];
        const offsets = centredColumnOffsets({ nodes, links }, 220, 10);
        // savings (no outgoing link) joins the last column with rent and food: 3 nodes, the tightest one
        // scale = (220 - 2 × 10) / 100 = 2
        expect(offsets).toEqual([10, 10, 50, 0]);
        // Salary and income: 100 × 2 = 200 → 10; expenses alone: 60 × 2 = 120 → 50; the last column fills the height
    });

    it('gives nothing to centre without nodes', () => {
        expect(centredColumnOffsets({ nodes: [], links: [] }, 300, 10)).toEqual([]);
    });
});
