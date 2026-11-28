/**
 * Centring of the cash flow Sankey's columns (Epic E52). Recharts stacks each column from the top when its
 * relaxation is off (`verticalAlign="top"`); this gives the vertical shift that centres every column, so the
 * stages line up on the same middle instead of drifting down like a wave. Same depth and scale rules as Recharts:
 * a node's column is its longest path from a source, the nodes without outgoing links go to the last column, and
 * one scale (the tightest column's) turns values into heights.
 */

export interface SankeyLayoutInput {
    nodes: ReadonlyArray<unknown>;
    links: ReadonlyArray<{ source: number; target: number; value: number }>;
}

/** Shift in pixels of each column (index = column), for a drawing area `height` tall with `padding` between nodes. */
export function centredColumnOffsets({ nodes, links }: SankeyLayoutInput, height: number, padding: number): number[] {
    const count = nodes.length;
    if (count === 0) return [];
    const incoming = Array.from({ length: count }, () => [] as number[]);
    const outgoing = Array.from({ length: count }, () => [] as number[]);
    const valueIn = new Array<number>(count).fill(0);
    const valueOut = new Array<number>(count).fill(0);
    for (const link of links) {
        if (link.source >= count || link.target >= count) continue;
        outgoing[link.source].push(link.target);
        incoming[link.target].push(link.source);
        valueOut[link.source] += link.value;
        valueIn[link.target] += link.value;
    }
    const depth = new Array<number>(count).fill(0);
    const visit = (node: number, level: number, seen: Set<number>): void => {
        if (seen.has(node)) return;
        depth[node] = Math.max(depth[node], level);
        seen.add(node);
        for (const next of outgoing[node]) visit(next, level + 1, seen);
        seen.delete(node);
    };
    for (let node = 0; node < count; node++) if (incoming[node].length === 0) visit(node, 0, new Set());
    const maxDepth = Math.max(...depth);
    for (let node = 0; node < count; node++) if (outgoing[node].length === 0) depth[node] = maxDepth;

    const columns = Array.from({ length: maxDepth + 1 }, () => ({ nodes: 0, value: 0 }));
    for (let node = 0; node < count; node++) {
        columns[depth[node]].nodes += 1;
        columns[depth[node]].value += Math.max(valueIn[node], valueOut[node]);
    }
    const used = columns.filter(column => column.nodes > 0 && column.value > 0);
    if (used.length === 0) return columns.map(() => 0);
    const scale = Math.min(...used.map(column => (height - (column.nodes - 1) * padding) / column.value));
    return columns.map(column => {
        if (column.nodes === 0) return 0;
        const extent = column.value * scale + (column.nodes - 1) * padding;
        return Math.max(0, (height - extent) / 2);
    });
}
