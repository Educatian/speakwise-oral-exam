import React, { useMemo } from 'react';
import { ArgumentGraph, ArgumentNode, ArgumentEdge } from '../../types';

interface ArgumentMapViewProps {
    graph: ArgumentGraph;
}

/**
 * Argument Map Visualization Component
 * Displays claim-evidence-counterargument structure from interviews
 */
export const ArgumentMapView: React.FC<ArgumentMapViewProps> = ({ graph }) => {
    const { nodes, edges, coherenceScore, complexity } = graph;

    // Group nodes by type for organized display
    const groupedNodes = useMemo(() => {
        const groups: Record<string, ArgumentNode[]> = {
            claim: [],
            evidence: [],
            counterargument: [],
            justification: [],
            question: []
        };

        nodes.forEach(node => {
            if (groups[node.type]) {
                groups[node.type].push(node);
            }
        });

        return groups;
    }, [nodes]);

    // Node type styling
    const getNodeStyle = (type: string) => {
        switch (type) {
            case 'claim':
                return {
                    bg: 'bg-blue-500/20',
                    border: 'border-blue-500/50',
                    text: 'text-blue-400',
                    icon: '💡',
                    label: 'Claim'
                };
            case 'evidence':
                return {
                    bg: 'bg-emerald-500/20',
                    border: 'border-emerald-500/50',
                    text: 'text-emerald-400',
                    icon: '📊',
                    label: 'Evidence'
                };
            case 'counterargument':
                return {
                    bg: 'bg-rose-500/20',
                    border: 'border-rose-500/50',
                    text: 'text-rose-400',
                    icon: '⚖️',
                    label: 'Counter'
                };
            case 'justification':
                return {
                    bg: 'bg-amber-500/20',
                    border: 'border-amber-500/50',
                    text: 'text-amber-400',
                    icon: '📝',
                    label: 'Justification'
                };
            case 'question':
                return {
                    bg: 'bg-slate-500/20',
                    border: 'border-slate-500/50',
                    text: 'text-slate-400',
                    icon: '❓',
                    label: 'Question'
                };
            default:
                return {
                    bg: 'bg-slate-500/20',
                    border: 'border-slate-500/50',
                    text: 'text-slate-400',
                    icon: '•',
                    label: 'Other'
                };
        }
    };

    // Get edge relationship label
    const getEdgeLabel = (relation: ArgumentEdge['relation']) => {
        switch (relation) {
            case 'supports': return '→ supports';
            case 'refutes': return '⊗ refutes';
            case 'extends': return '+ extends';
            case 'responds_to': return '↩ responds to';
            default: return '—';
        }
    };

    // Calculate node statistics
    const stats = useMemo(() => ({
        claims: groupedNodes.claim.length,
        evidence: groupedNodes.evidence.length,
        counters: groupedNodes.counterargument.length,
        totalNodes: nodes.length,
        totalEdges: edges.length
    }), [groupedNodes, nodes, edges]);

    if (nodes.length === 0) {
        return (
            <div className="text-center py-8 text-slate-500">
                <span className="text-3xl mb-2 block">🗺️</span>
                <p className="text-sm">No argument structure detected</p>
                <p className="text-xs mt-1">Complete an interview to see your reasoning map</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header with Score */}
            <div className="flex items-center justify-between">
                <h4 className="text-slate-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                    <span>🗺️</span>
                    Argument Structure Map
                </h4>
                <div className="flex items-center gap-3">
                    <div className="text-xs">
                        <span className="text-slate-500">Coherence: </span>
                        <span className={`font-bold ${coherenceScore >= 70 ? 'text-emerald-400' :
                                coherenceScore >= 40 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                            {coherenceScore}%
                        </span>
                    </div>
                    <div className="text-xs text-slate-500">
                        Complexity: <span className="text-slate-300">{complexity}</span>
                    </div>
                </div>
            </div>

            {/* Statistics Bar */}
            <div className="flex gap-2 flex-wrap">
                {stats.claims > 0 && (
                    <span className="px-2 py-1 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-400">
                        💡 {stats.claims} Claim{stats.claims > 1 ? 's' : ''}
                    </span>
                )}
                {stats.evidence > 0 && (
                    <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-400">
                        📊 {stats.evidence} Evidence
                    </span>
                )}
                {stats.counters > 0 && (
                    <span className="px-2 py-1 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-400">
                        ⚖️ {stats.counters} Counter{stats.counters > 1 ? 's' : ''}
                    </span>
                )}
                <span className="px-2 py-1 bg-slate-500/10 border border-slate-500/30 rounded-lg text-xs text-slate-400">
                    🔗 {stats.totalEdges} Connection{stats.totalEdges !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Argument Nodes */}
            <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {nodes.map((node, idx) => {
                    const style = getNodeStyle(node.type);
                    const relatedEdges = edges.filter(e => e.from === node.id || e.to === node.id);

                    return (
                        <div
                            key={node.id}
                            className={`${style.bg} ${style.border} border rounded-xl p-3 transition-all hover:scale-[1.01]`}
                        >
                            <div className="flex items-start gap-2">
                                <span className="text-lg flex-shrink-0">{style.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[10px] font-bold uppercase ${style.text}`}>
                                            {style.label}
                                        </span>
                                        <span className="text-[10px] text-slate-600">
                                            {node.speaker === 'user' ? '👤 Student' : '🤖 AI'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-300 leading-relaxed">
                                        {node.content}
                                    </p>

                                    {/* Show relationships */}
                                    {relatedEdges.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {relatedEdges.map((edge, edgeIdx) => (
                                                <span
                                                    key={edgeIdx}
                                                    className="text-[9px] px-1.5 py-0.5 bg-slate-800 rounded text-slate-500"
                                                >
                                                    {getEdgeLabel(edge.relation)}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="pt-3 border-t border-slate-800">
                <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
                    <span>💡 Claim = Main argument</span>
                    <span>📊 Evidence = Supporting fact</span>
                    <span>⚖️ Counter = Alternative view</span>
                    <span>📝 Justification = Explanation</span>
                </div>
            </div>
        </div>
    );
};

export default ArgumentMapView;
