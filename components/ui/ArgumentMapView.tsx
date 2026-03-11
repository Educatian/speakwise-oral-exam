import React, { useMemo, useEffect, useState, useRef } from 'react';
import { ArgumentGraph, ArgumentNode, ArgumentEdge } from '../../types';

interface ArgumentMapViewProps {
    graph: ArgumentGraph;
}

/**
 * Dynamic Knowledge Graph Visualization
 * Uses a basic force-directed algorithm for layout and HTML overlays for readable nodes.
 */
export const ArgumentMapView: React.FC<ArgumentMapViewProps> = ({ graph }) => {
    const { nodes, edges } = graph;

    // Show all nodes including questions (questions form the hub of the network)
    const keywordNodes = useMemo(() => nodes, [nodes]);

    // Filter edges to only include those between visible nodes
    const validEdges = useMemo(() => {
        const nodeIds = new Set(keywordNodes.map(n => n.id));
        return edges.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to));
    }, [edges, keywordNodes]);

    // Dimensions
    const viewW = 600;
    const viewH = 450;
    const centerX = viewW / 2;
    const centerY = viewH / 2;

    // Run simple physics simulation for layout
    const nodePositions = useMemo(() => {
        if (keywordNodes.length === 0) return [];
        if (keywordNodes.length === 1) {
            return [{ node: keywordNodes[0], x: centerX, y: centerY }];
        }

        const positions: Record<string, { x: number, y: number, vx: number, vy: number }> = {};

        // Initialize with spiral to distribute them initially
        keywordNodes.forEach((node, i) => {
            const angle = i * Math.PI * 2 * 0.618; // golden ratio
            const r = 40 + i * 15;
            positions[node.id] = {
                x: centerX + Math.cos(angle) * r,
                y: centerY + Math.sin(angle) * r,
                vx: 0, vy: 0
            };
        });

        const iterations = 150;
        const k = Math.sqrt((viewW * viewH) / keywordNodes.length) * 0.6; // optimal distance parameter

        for (let iter = 0; iter < iterations; iter++) {
            const temp = 20 * (1 - iter / iterations);

            // 1. Repulsion
            for (let i = 0; i < keywordNodes.length; i++) {
                for (let j = i + 1; j < keywordNodes.length; j++) {
                    const id1 = keywordNodes[i].id;
                    const id2 = keywordNodes[j].id;
                    const p1 = positions[id1];
                    const p2 = positions[id2];
                    const dx = p1.x - p2.x;
                    const dy = p1.y - p2.y;
                    const distSq = dx * dx + dy * dy || 1;
                    const dist = Math.sqrt(distSq);

                    // Repel stronger if too close
                    const force = (k * k) / dist;
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;

                    p1.vx += fx; p1.vy += fy;
                    p2.vx -= fx; p2.vy -= fy;
                }
            }

            // 2. Attraction along edges
            validEdges.forEach(edge => {
                const p1 = positions[edge.from];
                const p2 = positions[edge.to];
                if (!p1 || !p2) return;

                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = (dist * dist) / k;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                p1.vx -= fx; p1.vy -= fy;
                p2.vx += fx; p2.vy += fy;
            });

            // 3. Gravity towards center to keep things in view
            Object.values(positions).forEach(p => {
                const dx = centerX - p.x;
                const dy = centerY - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                p.vx += (dx / dist) * (dist * 0.05);
                p.vy += (dy / dist) * (dist * 0.05);
            });

            // 4. Update positions & apply friction
            Object.values(positions).forEach(p => {
                const len = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
                const cap = Math.min(len, temp);
                p.x += (p.vx / len) * cap;
                p.y += (p.vy / len) * cap;
                p.vx *= 0.6; // strong friction
                p.vy *= 0.6;
                // keep boundaries
                p.x = Math.max(60, Math.min(viewW - 60, p.x));
                p.y = Math.max(40, Math.min(viewH - 40, p.y));
            });
        }

        return keywordNodes.map(node => ({
            node,
            x: positions[node.id].x,
            y: positions[node.id].y
        }));
    }, [keywordNodes, validEdges]);

    // Relationship styling
    const getRelationStyle = (relation: string) => {
        const rel = relation.toLowerCase();
        if (rel === 'relates') return { color: '#94a3b8', bg: 'bg-slate-500/20', label: '' };
        if (rel === 'responds') return { color: '#818cf8', bg: 'bg-indigo-500/20', label: '' };
        if (rel.includes('cause') || rel.includes('leads') || rel.includes('result')) return { color: '#f43f5e', bg: 'bg-rose-500/20', label: relation };
        if (rel.includes('affect') || rel.includes('influence') || rel.includes('impact')) return { color: '#f59e0b', bg: 'bg-amber-500/20', label: relation };
        if (rel.includes('depend') || rel.includes('require') || rel.includes('need')) return { color: '#8b5cf6', bg: 'bg-purple-500/20', label: relation };
        if (rel.includes('related') || rel.includes('connect') || rel.includes('associate')) return { color: '#06b6d4', bg: 'bg-cyan-500/20', label: relation };
        if (rel.includes('contrast') || rel.includes('although') || rel.includes('but')) return { color: '#64748b', bg: 'bg-slate-500/20', label: relation };
        if (rel.includes('because') || rel.includes('if-then')) return { color: '#10b981', bg: 'bg-emerald-500/20', label: relation };
        return { color: '#3b82f6', bg: 'bg-blue-500/20', label: relation };
    };

    if (keywordNodes.length === 0) {
        return (
            <div className="text-center py-10 bg-slate-900/50 rounded-xl border border-slate-800">
                <span className="text-4xl mb-3 block opacity-50">🕸️</span>
                <p className="text-slate-400 font-medium">Knowledge network is building...</p>
                <p className="text-xs mt-2 text-slate-500 max-w-[250px] mx-auto">
                    The AI is currently analyzing your conversation to map out conceptual relationships and core arguments.
                </p>
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
                        Nodes: <span className="text-slate-200 font-bold ml-1">{keywordNodes.length}</span>
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className="text-slate-400">
                        Links: <span className="text-slate-200 font-bold ml-1">{validEdges.length}</span>
                    </span>
                </div>
            </div>

            {/* Container mapping SVG and HTML overlay */}
            <div className="relative bg-slate-900 rounded-xl border border-slate-700/50 overflow-hidden shadow-inner" style={{ aspectRatio: `${viewW}/${viewH}` }}>
                {/* 1. Underlying SVG for Edges */}
                <svg
                    viewBox={`0 0 ${viewW} ${viewH}`}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                >
                    <defs>
                        {['f43f5e', 'f59e0b', '8b5cf6', '06b6d4', '10b981', '3b82f6', '64748b', '94a3b8', '818cf8'].map(color => (
                            <marker
                                key={color}
                                id={`arr-${color}`}
                                markerWidth="12"
                                markerHeight="10"
                                refX="10"
                                refY="5"
                                orient="auto-start-reverse"
                                markerUnits="userSpaceOnUse"
                            >
                                <polygon points="0 1, 10 5, 0 9" fill={`#${color}`} opacity="0.8" />
                            </marker>
                        ))}
                    </defs>

                    {validEdges.map((edge, idx) => {
                        const fromPos = nodePositions.find(p => p.node.id === edge.from);
                        const toPos = nodePositions.find(p => p.node.id === edge.to);
                        if (!fromPos || !toPos) return null;

                        const style = getRelationStyle(edge.relation);
                        const cHex = style.color.replace('#', '');

                        const dx = toPos.x - fromPos.x;
                        const dy = toPos.y - fromPos.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < 10) return null;

                        // Calculate curved path
                        const ux = dx / dist;
                        const uy = dy / dist;

                        // Shrink endpoints to not enter the HTML nodes (approx 40px radius assumption)
                        const pad = 45;
                        const startX = fromPos.x + ux * pad;
                        const startY = fromPos.y + uy * pad;
                        const endX = toPos.x - ux * (pad + 5);
                        const endY = toPos.y - uy * (pad + 5);

                        const curveOffset = 30 * (idx % 2 === 0 ? 1 : -1);
                        const midX = (startX + endX) / 2 - uy * curveOffset;
                        const midY = (startY + endY) / 2 + ux * curveOffset;

                        return (
                            <g key={`edge-${idx}`}>
                                <path
                                    d={`M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`}
                                    fill="none"
                                    stroke={style.color}
                                    strokeWidth="1.5"
                                    strokeDasharray={edge.type === 'implicit' ? "4,4" : "none"}
                                    opacity="0.5"
                                    markerEnd={`url(#arr-${cHex})`}
                                    className="transition-all duration-700"
                                />
                                {/* Relationship Badge — only show if label is non-empty */}
                                {style.label && (
                                    <>
                                        <rect
                                            x={midX - 35}
                                            y={midY - 10}
                                            width="70"
                                            height="20"
                                            rx="10"
                                            fill="#0f172a"
                                            stroke={style.color}
                                            strokeWidth="1"
                                            opacity="0.9"
                                        />
                                        <text
                                            x={midX}
                                            y={midY + 3.5}
                                            fill={style.color}
                                            fontSize="9.5"
                                            fontWeight="600"
                                            textAnchor="middle"
                                            className="pointer-events-auto cursor-default"
                                        >
                                            {style.label.length > 12 ? style.label.substring(0, 10) + '..' : style.label}
                                        </text>
                                    </>
                                )}
                            </g>
                        );
                    })}
                </svg>

                {/* 2. HTML Overlay for Nodes */}
                <div className="absolute inset-0 w-full h-full pointer-events-none">
                    {nodePositions.map((pos, i) => {
                        const typeStyle = {
                            claim: { bg: 'bg-blue-900/60', border: 'border-blue-400/80', shadow: 'shadow-blue-900/50', text: 'text-blue-100', dot: 'bg-blue-400' },
                            evidence: { bg: 'bg-emerald-900/60', border: 'border-emerald-400/80', shadow: 'shadow-emerald-900/50', text: 'text-emerald-100', dot: 'bg-emerald-400' },
                            counterargument: { bg: 'bg-rose-900/60', border: 'border-rose-400/80', shadow: 'shadow-rose-900/50', text: 'text-rose-100', dot: 'bg-rose-400' },
                            justification: { bg: 'bg-amber-900/60', border: 'border-amber-400/80', shadow: 'shadow-amber-900/50', text: 'text-amber-100', dot: 'bg-amber-400' },
                            question: { bg: 'bg-indigo-950/80', border: 'border-indigo-500/50', shadow: 'shadow-indigo-900/50', text: 'text-indigo-300', dot: 'bg-indigo-500' },
                        }[pos.node.type] || { bg: 'bg-slate-800/80', border: 'border-slate-600', shadow: 'shadow-slate-900/50', text: 'text-slate-200', dot: 'bg-slate-400' };

                        return (
                        <div
                            key={pos.node.id}
                            className="absolute flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto transition-all duration-700 ease-out"
                            style={{
                                left: `${(pos.x / viewW) * 100}%`,
                                top: `${(pos.y / viewH) * 100}%`,
                                zIndex: 10 + i
                            }}
                        >
                            <div className={`px-3 py-1.5 rounded-xl border backdrop-blur-md shadow-lg flex items-center gap-2 max-w-[140px] ${typeStyle.bg} ${typeStyle.border} ${typeStyle.shadow}`}>
                                <div className={`w-2 h-2 rounded-full shrink-0 ${typeStyle.dot}`} />
                                <span className={`text-xs font-semibold leading-tight break-words text-center ${typeStyle.text}`}>
                                    {pos.node.content}
                                </span>
                            </div>
                        </div>
                        );
                    })}
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-slate-400 pt-3 border-t border-slate-800/50 px-2">
                <span className="flex items-center gap-1.5 font-medium"><span className="w-2.5 h-2.5 bg-rose-500 rounded-sm" /> Causal</span>
                <span className="flex items-center gap-1.5 font-medium"><span className="w-2.5 h-2.5 bg-amber-500 rounded-sm" /> Influence</span>
                <span className="flex items-center gap-1.5 font-medium"><span className="w-2.5 h-2.5 bg-purple-500 rounded-sm" /> Dependency</span>
                <span className="flex items-center gap-1.5 font-medium"><span className="w-2.5 h-2.5 bg-cyan-500 rounded-sm" /> Correlation</span>
                <span className="flex items-center gap-1.5 font-medium"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm" /> Reasoning</span>
            </div>

            {/* Outline list */}
            {keywordNodes.length > 0 && (
                <details className="group px-2">
                    <summary className="text-[10px] text-slate-500 uppercase cursor-pointer hover:text-slate-300 flex items-center gap-1.5 py-1">
                        <span className="group-open:rotate-90 transition-transform">▶</span>
                        Text Summary
                    </summary>
                    <div className="mt-2 text-xs text-slate-400 space-y-1.5 pl-4 border-l-2 border-slate-800">
                        {validEdges.map((e, idx) => {
                            const from = keywordNodes.find(n => n.id === e.from)?.content;
                            const to = keywordNodes.find(n => n.id === e.to)?.content;
                            return (
                                <div key={idx} className="flex gap-2 items-center">
                                    <span className="font-semibold text-slate-300">{from}</span>
                                    <span className="text-[10px] bg-slate-800 px-1.5 rounded text-slate-400">{e.relation}</span>
                                    <span className="font-semibold text-slate-300">{to}</span>
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
