import React, { useMemo } from 'react';
import { ArgumentGraph, ArgumentNode, ArgumentEdge } from '../../types';

interface ArgumentMapViewProps {
    graph: ArgumentGraph;
}

interface NodePosition {
    x: number;
    y: number;
    node: ArgumentNode;
}

/**
 * Argument Concept Map Visualization
 * Displays nodes with connecting lines showing relationships
 */
export const ArgumentMapView: React.FC<ArgumentMapViewProps> = ({ graph }) => {
    const { nodes, edges, coherenceScore, complexity } = graph;

    // Node styling by type
    const getNodeStyle = (type: string) => {
        switch (type) {
            case 'claim':
                return { bg: '#3b82f6', border: '#60a5fa', text: '#bfdbfe', icon: '💡', label: 'Claim' };
            case 'evidence':
                return { bg: '#10b981', border: '#34d399', text: '#a7f3d0', icon: '📊', label: 'Evidence' };
            case 'counterargument':
                return { bg: '#f43f5e', border: '#fb7185', text: '#fecdd3', icon: '⚖️', label: 'Counter' };
            case 'justification':
                return { bg: '#f59e0b', border: '#fbbf24', text: '#fde68a', icon: '📝', label: 'Justify' };
            case 'question':
                return { bg: '#8b5cf6', border: '#a78bfa', text: '#ddd6fe', icon: '❓', label: 'Question' };
            default:
                return { bg: '#64748b', border: '#94a3b8', text: '#e2e8f0', icon: '•', label: 'Other' };
        }
    };

    // Edge styling by relation
    const getEdgeStyle = (relation: ArgumentEdge['relation']) => {
        switch (relation) {
            case 'supports': return { color: '#10b981', dash: '', arrow: true };
            case 'refutes': return { color: '#f43f5e', dash: '5,5', arrow: true };
            case 'responds_to': return { color: '#8b5cf6', dash: '3,3', arrow: true };
            case 'extends': return { color: '#3b82f6', dash: '', arrow: true };
            default: return { color: '#64748b', dash: '', arrow: false };
        }
    };

    // Calculate node positions in a radial/concept map layout
    const nodePositions = useMemo<NodePosition[]>(() => {
        if (nodes.length === 0) return [];

        const positions: NodePosition[] = [];
        const centerX = 280;
        const centerY = 150;

        // Separate by type for layered layout
        const questions = nodes.filter(n => n.type === 'question');
        const claims = nodes.filter(n => n.type === 'claim');
        const evidence = nodes.filter(n => n.type === 'evidence');
        const counters = nodes.filter(n => n.type === 'counterargument');
        const justifications = nodes.filter(n => n.type === 'justification');

        // Place questions at top
        questions.forEach((node, i) => {
            const angle = (Math.PI * (i + 1)) / (questions.length + 1);
            positions.push({
                x: centerX + Math.cos(angle - Math.PI / 2) * 100,
                y: 30,
                node
            });
        });

        // Place claims in center area
        claims.forEach((node, i) => {
            const angle = (2 * Math.PI * i) / Math.max(claims.length, 1);
            const radius = 60;
            positions.push({
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius * 0.6,
                node
            });
        });

        // Place evidence around claims (below)
        evidence.forEach((node, i) => {
            const angle = (Math.PI * (i + 0.5)) / Math.max(evidence.length, 1);
            positions.push({
                x: 80 + (i * 120) % 400,
                y: centerY + 80 + Math.floor(i / 4) * 50,
                node
            });
        });

        // Place counter-arguments to the right
        counters.forEach((node, i) => {
            positions.push({
                x: 450,
                y: 80 + i * 70,
                node
            });
        });

        // Place justifications scattered
        justifications.forEach((node, i) => {
            positions.push({
                x: 50 + (i * 150) % 350,
                y: centerY + 50 + (i % 2) * 60,
                node
            });
        });

        return positions;
    }, [nodes]);

    // Find position by node ID
    const findPosition = (nodeId: string): NodePosition | undefined => {
        return nodePositions.find(p => p.node.id === nodeId);
    };

    if (nodes.length === 0) {
        return (
            <div className="text-center py-8 text-slate-500">
                <span className="text-3xl mb-2 block">🗺️</span>
                <p className="text-sm">No argument structure detected</p>
            </div>
        );
    }

    const svgWidth = 560;
    const svgHeight = Math.max(300, nodePositions.length * 40);

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h4 className="text-slate-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                    <span>🗺️</span>
                    Argument Concept Map
                </h4>
                <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-500">
                        Coherence:
                        <span className={`ml-1 font-bold ${coherenceScore >= 70 ? 'text-emerald-400' :
                                coherenceScore >= 40 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                            {coherenceScore}%
                        </span>
                    </span>
                </div>
            </div>

            {/* SVG Concept Map */}
            <div className="relative bg-slate-900/50 rounded-xl p-2 overflow-x-auto">
                <svg
                    width={svgWidth}
                    height={svgHeight}
                    className="min-w-full"
                    style={{ minHeight: svgHeight }}
                >
                    {/* Defs for arrow markers */}
                    <defs>
                        <marker
                            id="arrowhead-green"
                            markerWidth="10"
                            markerHeight="7"
                            refX="9"
                            refY="3.5"
                            orient="auto"
                        >
                            <polygon points="0 0, 10 3.5, 0 7" fill="#10b981" />
                        </marker>
                        <marker
                            id="arrowhead-red"
                            markerWidth="10"
                            markerHeight="7"
                            refX="9"
                            refY="3.5"
                            orient="auto"
                        >
                            <polygon points="0 0, 10 3.5, 0 7" fill="#f43f5e" />
                        </marker>
                        <marker
                            id="arrowhead-purple"
                            markerWidth="10"
                            markerHeight="7"
                            refX="9"
                            refY="3.5"
                            orient="auto"
                        >
                            <polygon points="0 0, 10 3.5, 0 7" fill="#8b5cf6" />
                        </marker>
                        <marker
                            id="arrowhead-blue"
                            markerWidth="10"
                            markerHeight="7"
                            refX="9"
                            refY="3.5"
                            orient="auto"
                        >
                            <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                        </marker>
                    </defs>

                    {/* Draw edges first (behind nodes) */}
                    {edges.map((edge, idx) => {
                        const fromPos = findPosition(edge.from);
                        const toPos = findPosition(edge.to);
                        if (!fromPos || !toPos) return null;

                        const style = getEdgeStyle(edge.relation);
                        const markerId = edge.relation === 'supports' ? 'arrowhead-green' :
                            edge.relation === 'refutes' ? 'arrowhead-red' :
                                edge.relation === 'responds_to' ? 'arrowhead-purple' :
                                    'arrowhead-blue';

                        // Calculate offset points for curved lines
                        const midX = (fromPos.x + toPos.x) / 2;
                        const midY = (fromPos.y + toPos.y) / 2;
                        const offset = 20;
                        const ctrlX = midX + (idx % 2 === 0 ? offset : -offset);
                        const ctrlY = midY + (idx % 2 === 0 ? -offset : offset);

                        return (
                            <g key={`edge-${idx}`}>
                                <path
                                    d={`M ${fromPos.x} ${fromPos.y} Q ${ctrlX} ${ctrlY} ${toPos.x} ${toPos.y}`}
                                    fill="none"
                                    stroke={style.color}
                                    strokeWidth="2"
                                    strokeDasharray={style.dash}
                                    markerEnd={style.arrow ? `url(#${markerId})` : undefined}
                                    opacity="0.7"
                                />
                                {/* Edge label */}
                                <text
                                    x={ctrlX}
                                    y={ctrlY}
                                    fill={style.color}
                                    fontSize="9"
                                    textAnchor="middle"
                                    className="select-none"
                                >
                                    {edge.relation}
                                </text>
                            </g>
                        );
                    })}

                    {/* Draw nodes */}
                    {nodePositions.map((pos, idx) => {
                        const style = getNodeStyle(pos.node.type);
                        const nodeWidth = 100;
                        const nodeHeight = 50;

                        return (
                            <g key={pos.node.id} transform={`translate(${pos.x - nodeWidth / 2}, ${pos.y - nodeHeight / 2})`}>
                                {/* Node background */}
                                <rect
                                    width={nodeWidth}
                                    height={nodeHeight}
                                    rx="8"
                                    fill={style.bg}
                                    stroke={style.border}
                                    strokeWidth="2"
                                    opacity="0.9"
                                />

                                {/* Icon */}
                                <text
                                    x="10"
                                    y="22"
                                    fontSize="14"
                                >
                                    {style.icon}
                                </text>

                                {/* Type label */}
                                <text
                                    x="28"
                                    y="18"
                                    fill={style.text}
                                    fontSize="9"
                                    fontWeight="bold"
                                    textTransform="uppercase"
                                >
                                    {style.label}
                                </text>

                                {/* Content preview */}
                                <text
                                    x="10"
                                    y="38"
                                    fill="#e2e8f0"
                                    fontSize="8"
                                    className="select-none"
                                >
                                    {pos.node.content.slice(0, 12)}...
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Node Details (expandable list) */}
            <details className="group">
                <summary className="text-[10px] text-slate-500 uppercase cursor-pointer hover:text-slate-400 flex items-center gap-1">
                    <span className="group-open:rotate-90 transition-transform">▶</span>
                    View Full Node Details ({nodes.length} nodes)
                </summary>
                <div className="mt-2 space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                    {nodes.map(node => {
                        const style = getNodeStyle(node.type);
                        return (
                            <div
                                key={node.id}
                                className="flex gap-2 p-2 rounded-lg text-xs"
                                style={{ backgroundColor: `${style.bg}20`, borderLeft: `3px solid ${style.border}` }}
                            >
                                <span>{style.icon}</span>
                                <div>
                                    <span className="font-bold uppercase text-[10px]" style={{ color: style.text }}>
                                        {style.label}
                                    </span>
                                    <p className="text-slate-300 mt-0.5">{node.content}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </details>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-800 text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded" style={{ backgroundColor: '#3b82f6' }} /> Claim
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded" style={{ backgroundColor: '#10b981' }} /> Evidence
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded" style={{ backgroundColor: '#f43f5e' }} /> Counter
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-8 h-0.5" style={{ backgroundColor: '#10b981' }} /> Supports
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-8 h-0.5 border-t-2 border-dashed" style={{ borderColor: '#f43f5e' }} /> Refutes
                </span>
            </div>
        </div>
    );
};

export default ArgumentMapView;
