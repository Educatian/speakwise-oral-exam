import React, { useMemo } from 'react';
import { Submission, ArgumentNode } from '../../types';
import { Button } from '../ui';

interface StudentResultsViewProps {
    submission: Submission;
    onBack: () => void;
}

// Toulmin component color map
const TOULMIN_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
    claim:     { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/30',   label: 'Claim' },
    data:      { bg: 'bg-emerald-500/10',text: 'text-emerald-400',border: 'border-emerald-500/30', label: 'Data' },
    warrant:   { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/30',   label: 'Warrant' },
    backing:   { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30',  label: 'Backing' },
    qualifier: { bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   border: 'border-cyan-500/30',   label: 'Qualifier' },
    rebuttal:  { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/30',    label: 'Rebuttal' },
};

// Argument node type color map
const NODE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    claim:            { bg: 'bg-blue-500/15',    text: 'text-blue-400',    label: 'Claim' },
    evidence:         { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Evidence' },
    counterargument:  { bg: 'bg-red-500/15',     text: 'text-red-400',     label: 'Counter' },
    justification:    { bg: 'bg-amber-500/15',   text: 'text-amber-400',   label: 'Justification' },
    question:         { bg: 'bg-slate-500/15',   text: 'text-slate-400',   label: 'Question' },
};

/**
 * Student Results View
 * Shows Toulmin element counts and turn-by-turn argumentation tagging
 */
export const StudentResultsView: React.FC<StudentResultsViewProps> = ({
    submission,
    onBack
}) => {
    const toulmin = submission.reasoningRubric?.toulminAnalysis;
    const argGraph = submission.argumentGraph;

    // Organize transcript turns with argument node tags
    const taggedTurns = useMemo(() => {
        if (!submission.transcript?.length) return [];
        
        return submission.transcript.map(turn => {
            // Find argument nodes matching this turn's content
            const matchingNodes: ArgumentNode[] = [];
            if (argGraph?.nodes) {
                for (const node of argGraph.nodes) {
                    if (node.speaker === turn.speaker && 
                        turn.text.toLowerCase().includes(node.content.toLowerCase().substring(0, 30))) {
                        matchingNodes.push(node);
                    }
                }
            }
            return { turn, nodes: matchingNodes };
        });
    }, [submission.transcript, argGraph]);

    // Calculate Toulmin components array for the bar chart
    const toulminComponents = useMemo(() => {
        if (!toulmin) return [];
        return [
            { key: 'claim',     ...toulmin.claim,     ...TOULMIN_COLORS.claim },
            { key: 'data',      ...toulmin.data,      ...TOULMIN_COLORS.data },
            { key: 'warrant',   ...toulmin.warrant,   ...TOULMIN_COLORS.warrant },
            { key: 'backing',   ...toulmin.backing,   ...TOULMIN_COLORS.backing },
            { key: 'qualifier', ...toulmin.qualifier, ...TOULMIN_COLORS.qualifier },
            { key: 'rebuttal',  ...toulmin.rebuttal,  ...TOULMIN_COLORS.rebuttal },
        ];
    }, [toulmin]);

    const maxCount = Math.max(...toulminComponents.map(c => c.count), 1);

    return (
        <div className="w-full max-w-5xl space-y-6 animate-fade-in">
            {/* Header */}
            <div className="glass-panel p-6 rounded-3xl">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-white">
                            Interview Results
                        </h2>
                        <p className="text-slate-400 text-sm mt-1">
                            {submission.studentName} • {submission.courseName} • {new Date(submission.timestamp).toLocaleDateString()}
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Overall Score */}
                        <div className="text-center">
                            <div className="text-3xl font-black text-emerald-400">
                                {submission.score}
                            </div>
                            <div className="text-xs text-slate-500 uppercase tracking-wider">Score</div>
                        </div>
                        <Button onClick={onBack} variant="secondary" size="sm">
                            ← Back
                        </Button>
                    </div>
                </div>

                {/* AI Feedback */}
                {submission.feedback && (
                    <div className="mt-4 p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                        <h3 className="text-sm font-semibold text-slate-300 mb-2">AI Feedback</h3>
                        <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">
                            {submission.feedback}
                        </p>
                    </div>
                )}
            </div>

            {/* Two-Column Layout for Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ─── Toulmin Element Counts (2-1) ─── */}
                <div className="glass-panel p-6 rounded-3xl">
                    <h3 className="text-lg font-bold text-white mb-1">
                        Toulmin Argument Structure
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">
                        {toulmin 
                            ? `Completeness: ${Math.round(toulmin.completenessScore * 100)}%` 
                            : 'Analysis not available'}
                    </p>

                    {toulmin ? (
                        <div className="space-y-3">
                            {toulminComponents.map(comp => (
                                <div key={comp.key} className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${comp.bg} ${comp.text} border ${comp.border}`}>
                                                {comp.label}
                                            </span>
                                            <span className={`text-xs ${comp.detected ? 'text-slate-300' : 'text-slate-600'}`}>
                                                {comp.detected ? '✓ Detected' : '✗ Missing'}
                                            </span>
                                        </div>
                                        <span className="text-sm font-mono text-slate-300">
                                            {comp.count}
                                        </span>
                                    </div>
                                    {/* Bar */}
                                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${comp.bg.replace('/10', '/40')}`}
                                            style={{ width: `${Math.max((comp.count / maxCount) * 100, 2)}%` }}
                                        />
                                    </div>
                                    {/* Example snippet */}
                                    {comp.examples?.length > 0 && (
                                        <p className="text-xs text-slate-500 italic truncate pl-1">
                                            "{comp.examples[0].substring(0, 80)}{comp.examples[0].length > 80 ? '...' : ''}"
                                        </p>
                                    )}
                                </div>
                            ))}

                            {/* Missing components alert */}
                            {toulmin.missingComponents.length > 0 && (
                                <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                                    <p className="text-xs text-amber-400">
                                        <span className="font-semibold">Missing:</span>{' '}
                                        {toulmin.missingComponents.join(', ')}
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-600">
                            <p className="text-sm">No Toulmin analysis data available.</p>
                            <p className="text-xs mt-1">Analysis requires enough dialogue turns.</p>
                        </div>
                    )}
                </div>

                {/* ─── Reasoning Rubric Summary ─── */}
                <div className="glass-panel p-6 rounded-3xl">
                    <h3 className="text-lg font-bold text-white mb-1">
                        Reasoning Analytics
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">
                        Overall reasoning score: {submission.reasoningRubric?.overallReasoningScore ?? 'N/A'}/100
                    </p>

                    {submission.reasoningRubric ? (
                        <div className="space-y-4">
                            {/* Explicit Justification */}
                            <div className="p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm text-slate-300 font-medium">Explicit Justification</span>
                                    <span className="text-sm font-mono text-emerald-400">{submission.reasoningRubric.explicitJustification.score}/5</span>
                                </div>
                                <p className="text-xs text-slate-500">{submission.reasoningRubric.explicitJustification.count} evidence-based statements</p>
                            </div>

                            {/* Causal Explanation */}
                            <div className="p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm text-slate-300 font-medium">Causal Explanation</span>
                                    <span className="text-sm font-mono text-emerald-400">{submission.reasoningRubric.causalExplanation.score}/5</span>
                                </div>
                                <p className="text-xs text-slate-500">{submission.reasoningRubric.causalExplanation.patterns.length} causal patterns</p>
                            </div>

                            {/* Counter-Argument Handling */}
                            <div className="p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm text-slate-300 font-medium">Counter-Argument Handling</span>
                                    <span className="text-sm font-mono text-emerald-400">{submission.reasoningRubric.counterArgumentHandling.score}/5</span>
                                </div>
                                <p className="text-xs text-slate-500">{submission.reasoningRubric.counterArgumentHandling.attempts} attempts</p>
                            </div>

                            {/* Abstraction & Generalization */}
                            <div className="p-3 bg-slate-800/30 rounded-xl border border-slate-700/30">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm text-slate-300 font-medium">Abstraction & Generalization</span>
                                    <span className="text-sm font-mono text-emerald-400">{submission.reasoningRubric.abstractionGeneralization.score}/5</span>
                                </div>
                                <p className="text-xs text-slate-500">{submission.reasoningRubric.abstractionGeneralization.instances.length} generalization attempts</p>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-600">
                            <p className="text-sm">No reasoning data available.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Turn-by-Turn Argumentation Tagging (2-2) ─── */}
            <div className="glass-panel p-6 rounded-3xl">
                <h3 className="text-lg font-bold text-white mb-1">
                    Turn-by-Turn Argumentation
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                    {submission.transcript?.length || 0} turns • {argGraph?.nodes?.length || 0} argument nodes detected
                </p>

                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                    {taggedTurns.map(({ turn, nodes }, idx) => (
                        <div
                            key={idx}
                            className={`p-4 rounded-2xl border ${
                                turn.speaker === 'user'
                                    ? 'bg-blue-500/5 border-blue-500/15 ml-0 mr-8'
                                    : 'bg-slate-800/30 border-slate-700/20 ml-8 mr-0'
                            }`}
                        >
                            {/* Speaker label */}
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`text-xs font-semibold uppercase tracking-wider ${
                                    turn.speaker === 'user' ? 'text-blue-400' : 'text-slate-500'
                                }`}>
                                    {turn.speaker === 'user' ? '🎤 Student' : '🤖 AI Interviewer'}
                                </span>
                                <span className="text-xs text-slate-600">
                                    {new Date(turn.timestamp).toLocaleTimeString()}
                                </span>
                                {turn.latency && turn.latency > 0 && (
                                    <span className="text-xs text-slate-600 ml-auto">
                                        ⏱ {turn.latency < 1000 ? `${turn.latency}ms` : `${(turn.latency / 1000).toFixed(1)}s`}
                                    </span>
                                )}
                            </div>

                            {/* Content */}
                            <p className="text-sm text-slate-300 leading-relaxed">
                                {turn.text}
                            </p>

                            {/* Argumentation tags */}
                            {nodes.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-700/30">
                                    {nodes.map(node => {
                                        const color = NODE_COLORS[node.type] || NODE_COLORS.claim;
                                        return (
                                            <span
                                                key={node.id}
                                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color.bg} ${color.text}`}
                                            >
                                                {color.label}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}

                    {(!submission.transcript || submission.transcript.length === 0) && (
                        <div className="text-center py-8 text-slate-600">
                            <p className="text-sm">No transcript data available.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
