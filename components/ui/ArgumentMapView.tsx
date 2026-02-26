import React, { useMemo } from 'react';
import { ArgumentGraph, ArgumentNode, ArgumentEdge } from '../../types';

interface ArgumentMapViewProps {
    graph: ArgumentGraph;
}

/**
 * Causal Concept Map Visualization
 * Displays keywords with labeled causal relationship connections
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
            return { color: '#f43f5e', label: relation, arrow: '→' }; // Red - causal
        }
        if (rel.includes('affect') || rel.includes('influence') || rel.includes('impact')) {
            return { color: '#f59e0b', label: relation, arrow: '⟶' }; // Orange - influence
        }
        if (rel.includes('depend') || rel.includes('require') || rel.includes('need')) {
            return { color: '#8b5cf6', label: relation, arrow: '⤙' }; // Purple - dependency
        }
        if (rel.includes('related') || rel.includes('connect') || rel.includes('associate')) {
            return { color: '#06b6d4', label: relation, arrow: '↔' }; // Cyan - correlation
        }
        if (rel.includes('contrast') || rel.includes('although') || rel.includes('but')) {
            return { color: '#64748b', label: relation, arrow: '⊗' }; // Gray - contrast
        }
        if (rel.includes('because') || rel.includes('if-then')) {
            return { color: '#10b981', label: relation, arrow: '∵' }; // Green - reasoning
        }
        return { color: '#3b82f6', label: relation, arrow: '→' }; // Blue - default
    };

    // Calculate node positions using a force-directed layout simulation
    const nodePositions = useMemo(() => {
        if (keywordNodes.length === 0) return [];

        const centerX = 220;
        const centerY = 160;
        const padding = 45;

        // 1. Initial arrangement (Golden Spiral for nice even spread)
        let positions = keywordNodes.map((node, i) => {
            const angle = i * Math.PI * (3 - Math.sqrt(5)); // Golden angle
            const radius = Math.sqrt(i) * 25 + 10;
            return {
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius,
                vx: 0,
                vy: 0,
                node
            };
        });

        // 2. Simple Force-Directed Simulation (Run for 50 iterations)
        for (let iter = 0; iter < 50; iter++) {
            // Node Repulsion (push nodes apart)
            for (let i = 0; i < positions.length; i++) {
                for (let j = i + 1; j < positions.length; j++) {
                    const dx = positions[i].x - positions[j].x;
                    const dy = positions[i].y - positions[j].y;
                    const distSq = dx * dx + dy * dy;
                    const dist = Math.sqrt(distSq) || 1;

                    if (dist < 90) { // Repulsion radius
                        const force = ((90 - dist) / dist) * 0.6;
                        positions[i].vx += dx * force;
                        positions[i].vy += dy * force;
                        positions[j].vx -= dx * force;
                        positions[j].vy -= dy * force;
                    }
                }

                // Gravity (pull gently to center)
                const dcx = centerX - positions[i].x;
                const dcy = centerY - positions[i].y;
                positions[i].vx += dcx * 0.015;
                positions[i].vy += dcy * 0.015;
            }

            // Edge Attraction (pull connected nodes together)
            edges.forEach(edge => {
                const fromIdx = positions.findIndex(p => p.node.id === edge.from);
                const toIdx = positions.findIndex(p => p.node.id === edge.to);

                if (fromIdx >= 0 && toIdx >= 0) {
                    const dx = positions[toIdx].x - positions[fromIdx].x;
                    const dy = positions[toIdx].y - positions[fromIdx].y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

                    const force = (dist - 100) * 0.04; // Ideal spring length is 100

                    positions[fromIdx].vx += dx * force;
                    positions[fromIdx].vy += dy * force;
                    positions[toIdx].vx -= dx * force;
                    positions[toIdx].vy -= dy * force;
                }
            });

            // 3. Apply velocities, dampen, and constrain to bounding box
            positions.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= 0.4; // Friction damping
                p.vy *= 0.4;

                p.x = Math.max(padding, Math.min(440 - padding, p.x));
                p.y = Math.max(padding, Math.min(340 - padding, p.y));
            });
        }

        return positions;
    }, [keywordNodes, edges]);

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

    const svgWidth = 440;
    const svgHeight = 340;

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h4 className="text-slate-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                    <span>🔗</span>
                    Causal Concept Map
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

            {/* SVG Causal Map */}
            <div className="relative bg-slate-900/70 rounded-xl overflow-hidden border border-slate-800">
                <svg width={svgWidth} height={svgHeight} className="w-full">
                    {/* Defs for arrow markers */}
                    <defs>
                        {['f43f5e', 'f59e0b', '8b5cf6', '06b6d4', '10b981', '3b82f6', '64748b'].map(color => (
                            <marker
                                key={color}
                                id={`arrow-${color}`}
                                markerWidth="8"
                                markerHeight="6"
                                refX="7"
                                refY="3"
                                orient="auto"
                            >
                                <polygon points="0 0, 8 3, 0 6" fill={`#${color}`} />
                            </marker>
                        ))}
                    </defs>

                    {/* Draw edges with labels */}
                    {edges.map((edge, idx) => {
                        const fromPos = findPosition(edge.from);
                        const toPos = findPosition(edge.to);
                        if (!fromPos || !toPos) return null;

                        const style = getRelationStyle(edge.relation);
                        const colorHex = style.color.replace('#', '');

                        // Calculate curved path
                        const dx = toPos.x - fromPos.x;
                        const dy = toPos.y - fromPos.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        // Offset for node radius
                        const offset = 35;
                        const startX = fromPos.x + (dx / dist) * offset;
                        const startY = fromPos.y + (dy / dist) * offset;
                        const endX = toPos.x - (dx / dist) * offset;
                        const endY = toPos.y - (dy / dist) * offset;

                        // Control point for curve
                        const midX = (startX + endX) / 2;
                        const midY = (startY + endY) / 2;
                        const curvature = 20 + (idx % 3) * 10;
                        const perpX = -dy / dist * curvature;
                        const perpY = dx / dist * curvature;
                        const ctrlX = midX + (idx % 2 === 0 ? perpX : -perpX);
                        const ctrlY = midY + (idx % 2 === 0 ? perpY : -perpY);

                        return (
                            <g key={`edge-${idx}`}>
                                {/* Edge line */}
                                <path
                                    d={`M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`}
                                    fill="none"
                                    stroke={style.color}
                                    strokeWidth="2.5"
                                    opacity="0.8"
                                    markerEnd={`url(#arrow-${colorHex})`}
                                />

                                {/* Relation label */}
                                <rect
                                    x={ctrlX - 30}
                                    y={ctrlY - 8}
                                    width="60"
                                    height="16"
                                    rx="4"
                                    fill="#1e293b"
                                    stroke={style.color}
                                    strokeWidth="1"
                                    opacity="0.95"
                                />
                                <text
                                    x={ctrlX}
                                    y={ctrlY + 4}
                                    fill={style.color}
                                    fontSize="9"
                                    fontWeight="bold"
                                    textAnchor="middle"
                                >
                                    {style.label}
                                </text>
                            </g>
                        );
                    })}

                    {/* Draw keyword nodes */}
                    {nodePositions.map((pos) => (
                        <g key={pos.node.id}>
                            {/* Node circle */}
                            <circle
                                cx={pos.x}
                                cy={pos.y}
                                r="30"
                                fill="#1e293b"
                                stroke="#3b82f6"
                                strokeWidth="2.5"
                            />

                            {/* Keyword text */}
                            <text
                                x={pos.x}
                                y={pos.y + 4}
                                fill="#e2e8f0"
                                fontSize="11"
                                fontWeight="bold"
                                textAnchor="middle"
                            >
                                {pos.node.content.length > 10
                                    ? pos.node.content.substring(0, 9) + '…'
                                    : pos.node.content
                                }
                            </text>
                        </g>
                    ))}
                </svg>
            </div>

            {/* Relationship Legend */}
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

            {/* Node list for details */}
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
