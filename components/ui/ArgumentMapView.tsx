import React, { useMemo } from 'react';
import { ArgumentGraph, ArgumentNode, ArgumentEdge } from '../../types';

interface ArgumentMapViewProps {
    graph: ArgumentGraph;
}

/**
 * Hierarchical Concept Network Visualization
 * 3-level radial layout:
 *   Level 0 (ROOT): Center — main theory
 *   Level 1 (PILLARS): Inner ring — core principles
 *   Level 2 (EVIDENCE): Outer ring — examples, tools, domains
 */
export const ArgumentMapView: React.FC<ArgumentMapViewProps> = ({ graph }) => {
    const { nodes, edges } = graph;

    // Dimensions
    const viewW = 600;
    const viewH = 500;
    const cx = viewW / 2;
    const cy = viewH / 2;

    // Radii for each level
    const radii = { 0: 0, 1: 130, 2: 220 };

    // Group nodes by level (from metadata)
    const { level0, level1, level2, nodePositions, posMap } = useMemo(() => {
        const l0: ArgumentNode[] = [];
        const l1: ArgumentNode[] = [];
        const l2: ArgumentNode[] = [];

        nodes.forEach(n => {
            const level = n.metadata?.level;
            if (level === 0) l0.push(n);
            else if (level === 1) l1.push(n);
            else if (level === 2) l2.push(n);
            else {
                // Fallback: first node is root, rest distribute
                if (l0.length === 0) l0.push(n);
                else if (l1.length < 4) l1.push(n);
                else l2.push(n);
            }
        });

        const pm = new Map<string, { x: number; y: number; angle: number }>();
        const positions: Array<{ node: ArgumentNode; x: number; y: number }> = [];

        // Level 0: center
        l0.forEach(n => {
            pm.set(n.id, { x: cx, y: cy, angle: 0 });
            positions.push({ node: n, x: cx, y: cy });
        });

        // Level 1: evenly distributed on inner ring
        l1.forEach((n, i) => {
            const angle = (2 * Math.PI * i) / Math.max(l1.length, 1) - Math.PI / 2;
            const x = cx + radii[1] * Math.cos(angle);
            const y = cy + radii[1] * Math.sin(angle);
            pm.set(n.id, { x, y, angle });
            positions.push({ node: n, x, y });
        });

        // Level 2: clustered near parent node direction
        // Find parent for each level 2 node through edges
        l2.forEach((n, i) => {
            let parentAngle = (2 * Math.PI * i) / Math.max(l2.length, 1);
            let parentFound = false;

            // Find a connected level 1 parent
            for (const edge of edges) {
                const isSource = edge.from === n.id;
                const isTarget = edge.to === n.id;
                const partnerId = isSource ? edge.to : edge.from;
                const partnerPos = pm.get(partnerId);

                if ((isSource || isTarget) && partnerPos) {
                    const partnerNode = nodes.find(nd => nd.id === partnerId);
                    if (partnerNode && partnerNode.metadata?.level === 1) {
                        parentAngle = partnerPos.angle;
                        parentFound = true;
                        break;
                    }
                }
            }

            // Spread level 2 nodes around parent angle
            const siblings = l2.filter((n2, j) => {
                if (j >= i) return false;
                for (const edge of edges) {
                    const isConn = (edge.from === n.id || edge.to === n.id);
                    const isConn2 = (edge.from === n2.id || edge.to === n2.id);
                    if (isConn && isConn2) return true;
                }
                return false;
            });
            const spreadOffset = (siblings.length - 0.5) * (Math.PI / 8);

            const finalAngle = parentAngle + spreadOffset;
            const x = cx + radii[2] * Math.cos(finalAngle);
            const y = cy + radii[2] * Math.sin(finalAngle);
            pm.set(n.id, { x, y, angle: finalAngle });
            positions.push({ node: n, x, y });
        });

        return { level0: l0, level1: l1, level2: l2, nodePositions: positions, posMap: pm };
    }, [nodes, edges]);

    // Node styling by concept type
    const getNodeStyle = (node: ArgumentNode) => {
        const ct = node.metadata?.conceptType || '';
        switch (ct) {
            case 'THEORY':
                return {
                    bg: '#1e1b4b', border: '#818cf8', text: '#c7d2fe', dot: '#818cf8',
                    size: 'text-sm font-black', padding: 'px-5 py-2.5', ring: true
                };
            case 'PRINCIPLE':
                return {
                    bg: '#1c1917', border: '#f97316', text: '#fed7aa', dot: '#f97316',
                    size: 'text-xs font-bold', padding: 'px-3 py-1.5', ring: false
                };
            case 'EXAMPLE':
                return {
                    bg: '#042f2e', border: '#2dd4bf', text: '#99f6e4', dot: '#2dd4bf',
                    size: 'text-[11px] font-semibold', padding: 'px-2.5 py-1', ring: false
                };
            case 'DOMAIN':
                return {
                    bg: '#1a1a2e', border: '#a78bfa', text: '#c4b5fd', dot: '#a78bfa',
                    size: 'text-[11px] font-semibold', padding: 'px-2.5 py-1', ring: false
                };
            case 'TOOL':
                return {
                    bg: '#0c1a1a', border: '#22d3ee', text: '#a5f3fc', dot: '#22d3ee',
                    size: 'text-[11px] font-semibold', padding: 'px-2.5 py-1', ring: false
                };
            default:
                return {
                    bg: '#1e293b', border: '#64748b', text: '#cbd5e1', dot: '#94a3b8',
                    size: 'text-xs font-semibold', padding: 'px-3 py-1.5', ring: false
                };
        }
    };

    // Edge styling by relation
    const getEdgeStyle = (relation: string) => {
        switch (relation) {
            case 'defines': return { color: '#818cf8', label: 'defines', dash: '' };
            case 'requires': return { color: '#f97316', label: 'requires', dash: '4,3' };
            case 'exemplifies': return { color: '#2dd4bf', label: 'exemplifies', dash: '' };
            case 'enables': return { color: '#22d3ee', label: 'enables', dash: '' };
            case 'located_in': return { color: '#a78bfa', label: 'in', dash: '6,2' };
            default: return { color: '#475569', label: relation, dash: '' };
        }
    };

    if (nodes.length === 0) {
        return (
            <div className="text-center py-10">
                <span className="text-4xl mb-3 block opacity-50">🕸️</span>
                <p className="text-slate-400 font-medium">Knowledge network is building...</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-slate-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                    <span>🕸️</span>
                    Concept Network
                </h4>
                <div className="flex items-center gap-3 text-xs bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700/50">
                    <span className="text-slate-400">
                        Nodes: <span className="text-slate-200 font-bold ml-1">{nodes.length}</span>
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className="text-slate-400">
                        Links: <span className="text-slate-200 font-bold ml-1">{edges.length}</span>
                    </span>
                    {graph.coherenceScore > 0 && (
                        <>
                            <span className="text-slate-600">|</span>
                            <span className="text-slate-400">
                                Coherence: <span className="text-indigo-400 font-bold ml-1">{graph.coherenceScore}%</span>
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Radial Graph Container */}
            <div className="relative bg-slate-950 rounded-xl border border-slate-700/50 overflow-hidden shadow-inner" style={{ aspectRatio: `${viewW}/${viewH}` }}>

                {/* Concentric reference rings */}
                <svg viewBox={`0 0 ${viewW} ${viewH}`} className="absolute inset-0 w-full h-full pointer-events-none">
                    <circle cx={cx} cy={cy} r={radii[1]} fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="3,6" />
                    <circle cx={cx} cy={cy} r={radii[2]} fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="3,6" />
                </svg>

                {/* Edge SVG layer */}
                <svg viewBox={`0 0 ${viewW} ${viewH}`} className="absolute inset-0 w-full h-full pointer-events-none">
                    {edges.map((edge, idx) => {
                        const fromPos = posMap.get(edge.from);
                        const toPos = posMap.get(edge.to);
                        if (!fromPos || !toPos) return null;

                        const style = getEdgeStyle(edge.relation);

                        const dx = toPos.x - fromPos.x;
                        const dy = toPos.y - fromPos.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < 5) return null;

                        const ux = dx / dist;
                        const uy = dy / dist;
                        const pad = 30;
                        const sx = fromPos.x + ux * pad;
                        const sy = fromPos.y + uy * pad;
                        const ex = toPos.x - ux * pad;
                        const ey = toPos.y - uy * pad;

                        // Slight curve
                        const curveAmt = 15 * (idx % 2 === 0 ? 1 : -1);
                        const mx = (sx + ex) / 2 - uy * curveAmt;
                        const my = (sy + ey) / 2 + ux * curveAmt;

                        // Label position
                        const lx = mx;
                        const ly = my;

                        return (
                            <g key={`e-${idx}`}>
                                <path
                                    d={`M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`}
                                    fill="none"
                                    stroke={style.color}
                                    strokeWidth="1.5"
                                    strokeDasharray={style.dash || 'none'}
                                    opacity="0.6"
                                />
                                {/* Small directional dot at end */}
                                <circle cx={ex} cy={ey} r="3" fill={style.color} opacity="0.7" />

                                {/* Relation label */}
                                {style.label && (
                                    <text
                                        x={lx}
                                        y={ly - 5}
                                        fill={style.color}
                                        fontSize="8"
                                        fontWeight="500"
                                        fontStyle="italic"
                                        textAnchor="middle"
                                        opacity="0.7"
                                    >
                                        {style.label}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>

                {/* Node HTML overlay */}
                <div className="absolute inset-0 w-full h-full pointer-events-none">
                    {nodePositions.map((pos, i) => {
                        const style = getNodeStyle(pos.node);
                        return (
                            <div
                                key={pos.node.id}
                                className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                                style={{
                                    left: `${(pos.x / viewW) * 100}%`,
                                    top: `${(pos.y / viewH) * 100}%`,
                                    zIndex: pos.node.metadata?.level === 0 ? 30 : pos.node.metadata?.level === 1 ? 20 : 10
                                }}
                            >
                                <div
                                    className={`${style.padding} rounded-2xl border-2 backdrop-blur-sm flex items-center gap-1.5 max-w-[120px] transition-all duration-300 hover:scale-110 cursor-default`}
                                    style={{
                                        backgroundColor: style.bg,
                                        borderColor: style.border,
                                        boxShadow: style.ring
                                            ? `0 0 20px ${style.border}40, 0 0 40px ${style.border}20`
                                            : `0 0 8px ${style.border}30`
                                    }}
                                >
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: style.dot }} />
                                    <span className={`${style.size} leading-tight break-words text-center`} style={{ color: style.text }}>
                                        {pos.node.content}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] text-slate-500 pt-2 border-t border-slate-800/50 px-1">
                <span className="text-slate-600 font-medium mr-1">Nodes:</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#818cf8' }} /> Theory</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f97316' }} /> Principle</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#2dd4bf' }} /> Example</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#a78bfa' }} /> Domain</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#22d3ee' }} /> Tool</span>
            </div>

            {/* Edge list */}
            {edges.length > 0 && (
                <details className="group px-1">
                    <summary className="text-[10px] text-slate-500 uppercase cursor-pointer hover:text-slate-300 flex items-center gap-1.5 py-1">
                        <span className="group-open:rotate-90 transition-transform">▶</span>
                        Relationships ({edges.length})
                    </summary>
                    <div className="mt-2 text-xs text-slate-400 space-y-1 pl-4 border-l-2 border-slate-800">
                        {edges.map((e, idx) => {
                            const from = nodes.find(n => n.id === e.from)?.content;
                            const to = nodes.find(n => n.id === e.to)?.content;
                            const style = getEdgeStyle(e.relation);
                            return (
                                <div key={idx} className="flex gap-2 items-center">
                                    <span className="font-medium text-slate-300">{from}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: style.color, color: style.color }}>{style.label}</span>
                                    <span className="font-medium text-slate-300">{to}</span>
                                </div>
                            );
                        })}
                    </div>
                </details>
            )}
        </div>
    );
};

export default ArgumentMapView;
