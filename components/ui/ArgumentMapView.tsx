import React, { useMemo } from 'react';
import { ArgumentGraph, ArgumentNode, ArgumentEdge } from '../../types';

interface ArgumentMapViewProps {
    graph: ArgumentGraph;
}

/**
 * Argument Map Visualization Component
 * Displays claim-evidence-counterargument structure as a visual flowchart
 */
export const ArgumentMapView: React.FC<ArgumentMapViewProps> = ({ graph }) => {
    const { nodes, edges, coherenceScore, complexity } = graph;

    // Node type styling
    const getNodeStyle = (type: string) => {
        switch (type) {
            case 'claim':
                return { bg: 'bg-blue-500/30', border: 'border-blue-400', text: 'text-blue-300', icon: '💡' };
            case 'evidence':
                return { bg: 'bg-emerald-500/30', border: 'border-emerald-400', text: 'text-emerald-300', icon: '📊' };
            case 'counterargument':
                return { bg: 'bg-rose-500/30', border: 'border-rose-400', text: 'text-rose-300', icon: '⚖️' };
            case 'justification':
                return { bg: 'bg-amber-500/30', border: 'border-amber-400', text: 'text-amber-300', icon: '📝' };
            case 'question':
                return { bg: 'bg-purple-500/30', border: 'border-purple-400', text: 'text-purple-300', icon: '❓' };
            default:
                return { bg: 'bg-slate-500/30', border: 'border-slate-400', text: 'text-slate-300', icon: '•' };
        }
    };

    // Organize nodes by conversation flow (questions with their responses)
    const conversationFlow = useMemo(() => {
        const flow: { question?: ArgumentNode; responses: ArgumentNode[] }[] = [];
        let currentGroup: { question?: ArgumentNode; responses: ArgumentNode[] } = { responses: [] };

        nodes.forEach(node => {
            if (node.type === 'question') {
                // Start a new group with this question
                if (currentGroup.question || currentGroup.responses.length > 0) {
                    flow.push(currentGroup);
                }
                currentGroup = { question: node, responses: [] };
            } else {
                // Add response to current group
                currentGroup.responses.push(node);
            }
        });

        // Don't forget the last group
        if (currentGroup.question || currentGroup.responses.length > 0) {
            flow.push(currentGroup);
        }

        return flow;
    }, [nodes]);

    // Get edge relation style
    const getEdgeStyle = (relation: ArgumentEdge['relation']) => {
        switch (relation) {
            case 'supports': return { color: 'bg-emerald-500', arrow: '↓', label: 'supports' };
            case 'refutes': return { color: 'bg-rose-500', arrow: '⊗', label: 'refutes' };
            case 'responds_to': return { color: 'bg-purple-500', arrow: '↩', label: 'responds' };
            case 'extends': return { color: 'bg-blue-500', arrow: '→', label: 'extends' };
            default: return { color: 'bg-slate-500', arrow: '—', label: '' };
        }
    };

    // Find edges for a given node
    const getNodeEdges = (nodeId: string) => {
        return edges.filter(e => e.from === nodeId || e.to === nodeId);
    };

    if (nodes.length === 0) {
        return (
            <div className="text-center py-8 text-slate-500">
                <span className="text-3xl mb-2 block">🗺️</span>
                <p className="text-sm">No argument structure detected</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h4 className="text-slate-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                    <span>🗺️</span>
                    Argument Flow Map
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
                    <span className="text-slate-600">|</span>
                    <span className="text-slate-500">
                        Nodes: <span className="text-slate-300">{nodes.length}</span>
                    </span>
                </div>
            </div>

            {/* Visual Flow Map */}
            <div className="relative overflow-x-auto">
                <div className="min-w-[400px] space-y-1">
                    {conversationFlow.map((group, groupIdx) => (
                        <div key={groupIdx} className="relative">
                            {/* Question Node */}
                            {group.question && (
                                <div className="flex items-start gap-3 mb-2">
                                    {/* Vertical Timeline Line */}
                                    <div className="flex flex-col items-center">
                                        <div className="w-8 h-8 rounded-full bg-purple-500/30 border-2 border-purple-400 flex items-center justify-center text-sm">
                                            ❓
                                        </div>
                                        {group.responses.length > 0 && (
                                            <div className="w-0.5 h-full min-h-[20px] bg-gradient-to-b from-purple-500 to-slate-700" />
                                        )}
                                    </div>
                                    <div className="flex-1 bg-purple-500/10 border border-purple-500/30 rounded-xl p-3">
                                        <div className="text-[10px] text-purple-400 font-bold uppercase mb-1">
                                            🤖 AI Question
                                        </div>
                                        <p className="text-sm text-slate-300">
                                            {group.question.content}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Response Nodes - Branching Layout */}
                            {group.responses.length > 0 && (
                                <div className="ml-4 pl-4 border-l-2 border-slate-700 space-y-2">
                                    {group.responses.map((node, nodeIdx) => {
                                        const style = getNodeStyle(node.type);
                                        const nodeEdges = getNodeEdges(node.id);

                                        return (
                                            <div key={node.id} className="relative flex items-start gap-3">
                                                {/* Connection Line */}
                                                <div className="absolute -left-4 top-4 w-4 h-0.5 bg-slate-700" />

                                                {/* Node Icon */}
                                                <div className={`w-7 h-7 rounded-lg ${style.bg} border ${style.border} flex items-center justify-center text-sm flex-shrink-0`}>
                                                    {style.icon}
                                                </div>

                                                {/* Node Content */}
                                                <div className={`flex-1 ${style.bg} border ${style.border} rounded-xl p-3`}>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`text-[10px] font-bold uppercase ${style.text}`}>
                                                            {node.type}
                                                        </span>
                                                        <span className="text-[10px] text-slate-600">
                                                            👤 Student
                                                        </span>
                                                        {/* Show edge relationships */}
                                                        {nodeEdges.length > 0 && nodeEdges.map((edge, edgeIdx) => {
                                                            const edgeStyle = getEdgeStyle(edge.relation);
                                                            return (
                                                                <span key={edgeIdx} className={`text-[9px] px-1.5 py-0.5 rounded ${edgeStyle.color}/20 text-slate-400`}>
                                                                    {edgeStyle.arrow} {edgeStyle.label}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                    <p className="text-sm text-slate-300 leading-relaxed">
                                                        {node.content}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Separator between groups */}
                            {groupIdx < conversationFlow.length - 1 && (
                                <div className="flex items-center gap-2 py-2 ml-4">
                                    <div className="flex-1 h-px bg-slate-800" />
                                    <span className="text-[10px] text-slate-600">↓ next turn</span>
                                    <div className="flex-1 h-px bg-slate-800" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 pt-3 border-t border-slate-800 text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-blue-500/30 border border-blue-400" /> Claim
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-emerald-500/30 border border-emerald-400" /> Evidence
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-rose-500/30 border border-rose-400" /> Counter
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-400" /> Justification
                </span>
            </div>
        </div>
    );
};

export default ArgumentMapView;
