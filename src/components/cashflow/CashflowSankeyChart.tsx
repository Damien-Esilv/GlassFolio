/**
 * "Where your money goes" (TGLA-251): income sources → income → taxes / savings / spending →
 * details. Links are drawn in a gradient from the colour of their source to the colour of their target.
 */
import React from 'react';
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts';
import type { LinkProps, NodeProps } from 'recharts/types/chart/Sankey';
import { useTranslation } from 'react-i18next';
import { CASHFLOW_ROLE_TOKENS } from '../../constants/cashflowPalette';
import { getCashflowCategoryTokens } from '../../constants/cashflowCategories';
import type { CashflowSankey, CashflowSankeyNode, CustomCashflowCategory } from '../../types/cashflow';
import type { CashflowLabels } from './useCashflowLabels';

/** Colour of a node, from its role in the flow. */
export function sankeyNodeColor(node: CashflowSankeyNode, custom: readonly CustomCashflowCategory[] = []): string {
    const roles = CASHFLOW_ROLE_TOKENS;
    if (node.kind === 'income') return roles.income.cssVar;
    if (node.categoryId === 'others') return roles.transfer.cssVar;
    if (node.categoryId === 'from_savings' || node.categoryId === 'group_savings') return roles.savings.cssVar;
    if (node.categoryId === 'available') return roles.available.cssVar;
    if (node.categoryId === 'group_expenses') return roles.expense.cssVar;
    if (node.categoryId === 'group_taxes' || node.id.startsWith('tax:')) return getCashflowCategoryTokens('taxes').cssVar;
    if (node.id.startsWith('savings:')) return roles.savings.cssVar;
    return node.categoryId ? getCashflowCategoryTokens(node.categoryId, custom).cssVar : roles.transfer.cssVar;
}

type SankeyPayload = CashflowSankeyNode & { name: string };

interface ShapeExtras {
    labels: CashflowLabels;
    custom: readonly CustomCashflowCategory[];
}

/** Node: a rounded bar and its "Name: amount" label (left of the first column, right of the others). */
const shorten = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Text drawn over the ribbons keeps a halo of the card colour so it stays readable. */
const HALO = { paintOrder: 'stroke' as const, stroke: 'var(--bg-card)', strokeWidth: 4, strokeLinejoin: 'round' as const };

const SankeyNodeShape: React.FC<Partial<NodeProps> & ShapeExtras> = ({ x = 0, y = 0, width = 0, height = 0, payload, labels, custom }) => {
    if (!payload) return null;
    const node = payload as unknown as SankeyPayload;
    const color = sankeyNodeColor(node, custom);
    const onLeft = node.kind === 'source';
    const name = shorten(labels.nodeName(node), node.kind === 'detail' ? 24 : 28);
    const textX = onLeft ? x - 8 : x + width + 8;
    const anchor = onLeft ? 'end' : 'start';
    const midY = y + height / 2;
    const tall = height >= 26;
    return (
        <g>
            <rect x={x} y={y} width={width} height={Math.max(height, 2)} rx={3} fill={color} />
            {tall ? (
                <>
                    <text x={textX} y={midY - 3} textAnchor={anchor} fontSize={12} fontWeight={700} fill="var(--text-primary)" {...HALO}>{name}</text>
                    <text x={textX} y={midY + 12} textAnchor={anchor} fontSize={11} fill="var(--text-secondary)" className="tabular-nums" {...HALO}>{labels.money(node.value)}</text>
                </>
            ) : (
                <text x={textX} y={midY + 4} textAnchor={anchor} fontSize={11} fill="var(--text-secondary)" {...HALO}>
                    <tspan fontWeight={700} fill="var(--text-primary)">{name}</tspan>
                    {` ${labels.money(node.value)}`}
                </text>
            )}
        </g>
    );
};

/** Link: a ribbon with a source-to-target gradient. */
const SankeyLinkShape: React.FC<Partial<LinkProps> & { custom: readonly CustomCashflowCategory[] }> = ({
    sourceX = 0, targetX = 0, sourceY = 0, targetY = 0, sourceControlX = 0, targetControlX = 0, linkWidth = 0, index = 0, payload, custom,
}) => {
    if (!payload) return null;
    const from = sankeyNodeColor(payload.source as unknown as CashflowSankeyNode, custom);
    const to = sankeyNodeColor(payload.target as unknown as CashflowSankeyNode, custom);
    const id = `cashflow-link-${index}`;
    return (
        <g>
            <defs>
                <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={from} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={to} stopOpacity={0.45} />
                </linearGradient>
            </defs>
            <path
                d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
                fill="none"
                stroke={`url(#${id})`}
                strokeWidth={Math.max(linkWidth, 1)}
                className="transition-opacity hover:opacity-80"
            />
        </g>
    );
};

const SankeyTooltip: React.FC<{ payload?: ReadonlyArray<{ payload?: unknown }>; labels: CashflowLabels }> = ({ payload, labels }) => {
    const { t } = useTranslation();
    const item = payload?.[0]?.payload as { source?: SankeyPayload; target?: SankeyPayload; value?: number } & Partial<SankeyPayload> | undefined;
    if (!item) return null;
    const title = item.source && item.target
        ? t('cashflow:sankey.tooltip', { from: labels.nodeName(item.source), to: labels.nodeName(item.target) })
        : labels.nodeName(item as SankeyPayload);
    return (
        <div className="bg-card border border-border px-3 py-2 rounded-xl shadow-xl text-xs">
            <p className="font-bold text-primary">{title}</p>
            <p className="text-secondary tabular-nums">{labels.money(item.value ?? 0)}</p>
        </div>
    );
};

export const CashflowSankeyChart: React.FC<{
    sankey: CashflowSankey;
    labels: CashflowLabels;
    customCategories: readonly CustomCashflowCategory[];
}> = ({ sankey, labels, customCategories }) => {
    const detailCount = sankey.nodes.filter(n => n.kind === 'detail' || n.kind === 'source').length;
    const height = Math.max(420, detailCount * 34);
    const data = {
        nodes: sankey.nodes.map(node => ({ ...node, name: labels.nodeName(node) })),
        links: sankey.links,
    };
    return (
        <div style={{ height }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
                <Sankey
                    data={data}
                    nodeWidth={12}
                    nodePadding={18}
                    linkCurvature={0.5}
                    iterations={64}
                    sort={false}
                    margin={{ top: 12, right: 200, bottom: 12, left: 190 }}
                    node={<SankeyNodeShape labels={labels} custom={customCategories} />}
                    link={<SankeyLinkShape custom={customCategories} />}
                >
                    <Tooltip content={({ payload }) => <SankeyTooltip payload={payload as ReadonlyArray<{ payload?: unknown }>} labels={labels} />} />
                </Sankey>
            </ResponsiveContainer>
        </div>
    );
};
