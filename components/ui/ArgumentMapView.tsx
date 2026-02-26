import React, { useMemo } from 'react';
import { ArgumentGraph, ArgumentNode, ArgumentEdge } from '../../types';

interface ArgumentMapViewProps {
    graph: ArgumentGraph;
}

/**
 * Radial Knowledge Graph Visualization
 * Displays keywords with labeled causal relationship connections in a clean radial layout
 */
export const ArgumentMapView: React.FC<ArgumentMapViewProps> = ({ graph }) => {
    const { nodes, edges, coherenceScore, complexity } = graph;

    // Filter only keyword nodes (type 'claim') for the concept map
    const keywordNodes = useMemo(() =>
        nodes.filter(n => n.type === 'claim' || n.type === 'evidence'),
        [nodes]
    );

    // Relationship colors
    const getRelationStyle = (relation: string) => {
        const rel = relation.toLowerCase();
        if (rel.includes('cause') || rel.includes('leads') || rel.includes('result')) {
            return { color: '#f43f5e', label: relation }; // Red - causal
        }
        if (rel.includes('affect') || rel.includes('influence') || rel.includes('impact')) {
            return { color: '#f59e0b', label: relation }; // Orange - influence
        }
        if (rel.includes('depend') || rel.includes('require') || rel.includes('need')) {
            return { color: '#8b5cf6', label: relation }; // Purple - dependency
        }
        if (rel.includes('related') || rel.includes('connect') || rel.includes('associate')) {
            return { color: '#06b6d4', label: relation }; // Cyan - correlation
        }
        if (rel.includes('contrast') || rel.includes('although') || rel.includes('but')) {
            return { color: '#64748b', label: relation }; // Gray - contrast
        }
        if (rel.includes('because') || rel.includes('if-then')) {
            return { color: '#10b981', label: relation }; // Green - reasoning
        }
        return { color: '#3b82f6', label: relation }; // Blue - default
    };

    // ─── Radial Layout ──────────────────────────────────────────────────────
    const viewW = 500;
    const viewH = 400;
    const centerX = viewW / 2;
    const centerY = viewH / 2;
    const nodeRadius = 28;

    const nodePositions = useMemo(() => {
        if (keywordNodes.length === 0) return [];

        if (keywordNodes.length === 1) {
            return [{ x: centerX, y: centerY, node: keywordNodes[0] }];
        }

        // Place first node in the center, rest on a ring
        const orbitRadius = Math.min(centerX, centerY) - nodeRadius - 30; // leave margin

        return keywordNodes.map((node, i) => {
            if (i === 0) {
                return { x: centerX, y: centerY, node };
            }

            const totalOuter = keywordNodes.length - 1;
            const angle = ((i - 1) / totalOuter) * 2 * Math.PI - Math.PI / 2;

            return {
                x: centerX + Math.cos(angle) * orbitRadius,
                y: centerY + Math.sin(angle) * orbitRadius,
                node
            };
        });
    }, [keywordNodes]);

    // Find node position by ID
    const findPosition = (nodeId: string) => nodePositions.find(p => p.node.id === nodeId);

    if (keywordNodes.length === 0) {
        return (
            <div className="text-center py-8 text-slate-500">
                <span className="text-3xl mb-2 block">🔗</span>
                <p className="text-sm">No causal relationships detected</p>
                <p className="text-xs mt-1 text-slate-600">
                    Try using phrases like "A causes B" or "X leads to Y"
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h4 className="text-slate-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                    <span>🔗</span>
                    Knowledge Graph
                </h4>
                <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-500">
                        Concepts: <span className="text-slate-300 font-bold">{keywordNodes.length}</span>
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className="text-slate-500">
                        Relations: <span className="text-slate-300 font-bold">{edges.length}</span>
                    </span>
                </div>
            </div>

            {/* SVG Graph */}
            <div className="relative bg-slate-900/70 rounded-xl border border-slate-800">
                <svg
                    viewBox={`0 0 ${viewW} ${viewH}`}
                    className="w-full"
                    style={{ display: 'block' }}
                >
                    {/* Arrow marker defs */}
                    <defs>
                        {['f43f5e', 'f59e0b', '8b5cf6', '06b6d4', '10b981', '3b82f6', '64748b'].map(color => (
                            <marker
                                key={color}
                                id={`arrow-${color}`}
                                markerWidth="10"
                                markerHeight="8"
                                refX="9"
                                refY="4"
                                orient="auto"
                                markerUnits="userSpaceOnUse"
                            >
                                <polygon points="0 0, 10 4, 0 8" fill={`#${color}`} opacity="0.9" />
                            </marker>
                        ))}
                    </defs>

                    {/* ── Draw edges (connections) ── */}
                    {edges.map((edge, idx) => {
                        const fromPos = findPosition(edge.from);
                        const toPos = findPosition(edge.to);
                        if (!fromPos || !toPos) return null;

                        const style = getRelationStyle(edge.relation);
                        const colorHex = style.color.replace('#', '');

                        const dx = toPos.x - fromPos.x;
                        const dy = toPos.y - fromPos.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        // Guard against zero distance (same node or overlapping)
                        if (dist < 1) return null;

                        // Shorten line by node radius so it doesn't overlap the circles
                        const ux = dx / dist;
                        const uy = dy / dist;
                        const startX = fromPos.x + ux * (nodeRadius + 4);
                        const startY = fromPos.y + uy * (nodeRadius + 4);
                        const endX = toPos.x - ux * (nodeRadius + 8);   // extra for arrowhead
                        const endY = toPos.y - uy * (nodeRadius + 8);

                        // Gentle curve offset (perpendicular to the line)
                        const curveAmt = 25 + (idx % 3) * 10;
                        const sign = idx % 2 === 0 ? 1 : -1;
                        const midX = (startX + endX) / 2 + (-uy) * curveAmt * sign;
                        const midY = (startY + endY) / 2 + ux * curveAmt * sign;

                        // Label position (at the curve apex)
                        const labelX = midX;
                        const labelY = midY;

                        return (
                            <g key={`edge-${idx}`}>
                                {/* Edge curve */}
                                <path
                                    d={`M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`}
                                    fill="none"
                                    stroke={style.color}
                                    strokeWidth="2"
                                    opacity="0.7"
                                    markerEnd={`url(#arrow-${colorHex})`}
                                />

                                {/* Relation label */}
                                <rect
                                    x={labelX - 32}
                                    y={labelY - 9}
                                    width="64"
                                    height="18"
                                    rx="4"
                                    fill="#0f172a"
                                    stroke={style.color}
                                    strokeWidth="0.8"
                                    opacity="0.92"
                                />
                                <text
                                    x={labelX}
                                    y={labelY + 4}
                                    fill={style.color}
                                    fontSize="9"
                                    fontWeight="600"
                                    textAnchor="middle"
                                >
                                    {style.label.length > 12 ? style.label.substring(0, 11) + '…' : style.label}
                                </text>
                            </g>
                        );
                    })}

                    {/* ── Draw nodes ── */}
                    {nodePositions.map((pos, idx) => {
                        const isCenter = idx === 0;
                        return (
                            <g key={pos.node.id}>
                                {/* Glow ring for center node */}
                                {isCenter && (
                                    <circle
                                        cx={pos.x}
                                        cy={pos.y}
                                        r={nodeRadius + 6}
                                        fill="none"
                                        stroke="#3b82f6"
                                        strokeWidth="1"
                                        opacity="0.3"
                                    />
                                )}

                                {/* Node circle */}
                                <circle
                                    cx={pos.x}
                                    cy={pos.y}
                                    r={nodeRadius}
                                    fill={isCenter ? '#1e3a5f' : '#1e293b'}
                                    stroke={isCenter ? '#60a5fa' : '#475569'}
                                    strokeWidth={isCenter ? 2.5 : 1.5}
                                />

                                {/* Keyword label */}
                                <text
                                    x={pos.x}
                                    y={pos.y + 4}
                                    fill={isCenter ? '#93c5fd' : '#cbd5e1'}
                                    fontSize={isCenter ? 11 : 10}
                                    fontWeight={isCenter ? 'bold' : '600'}
                                    textAnchor="middle"
                                >
                                    {pos.node.content.length > 10
                                        ? pos.node.content.substring(0, 9) + '…'
                                        : pos.node.content
                                    }
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500 pt-2 border-t border-slate-800">
                <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-rose-500 rounded" /> Causal
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-amber-500 rounded" /> Influence
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-purple-500 rounded" /> Dependency
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-cyan-500 rounded" /> Correlation
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-emerald-500 rounded" /> Reasoning
                </span>
            </div>

            {/* Expandable detail list */}
            {keywordNodes.length > 0 && (
                <details className="group">
                    <summary className="text-[10px] text-slate-500 uppercase cursor-pointer hover:text-slate-400 flex items-center gap-1">
                        <span className="group-open:rotate-90 transition-transform">▶</span>
                        View All Concepts ({keywordNodes.length})
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {keywordNodes.map(node => (
                            <span
                                key={node.id}
                                className="px-2 py-1 bg-blue-500/20 border border-blue-500/40 rounded-full text-xs text-blue-300"
                            >
                                {node.content}
                            </span>
                        ))}
                    </div>
                </details>
            )}
        </div>
    );
};

export default ArgumentMapView;
