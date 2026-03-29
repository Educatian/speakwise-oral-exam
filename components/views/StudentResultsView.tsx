import React, { useMemo, useState } from 'react';
import { Submission, ArgumentNode, RubricBreakdown } from '../../types';
import { GroupKnowledgeService } from '../../lib/services/GroupKnowledgeService';
import { Button } from '../ui';

interface StudentResultsViewProps {
    submission: Submission;
    peerSubmissions?: Submission[];
    onBack: () => void;
}

type ResultsTab = 'overview' | 'reasoning' | 'peers' | 'transcript';

type RubricEntry = RubricBreakdown[keyof RubricBreakdown];

const TOULMIN_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
    claim: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', label: 'Claim' },
    data: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Data' },
    warrant: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', label: 'Warrant' },
    backing: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30', label: 'Backing' },
    qualifier: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30', label: 'Qualifier' },
    rebuttal: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', label: 'Rebuttal' }
};

const NODE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    claim: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Claim' },
    evidence: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Evidence' },
    counterargument: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Counter' },
    justification: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Justification' },
    question: { bg: 'bg-slate-500/15', text: 'text-slate-400', label: 'Question' }
};

export const StudentResultsView: React.FC<StudentResultsViewProps> = ({
    submission,
    peerSubmissions,
    onBack
}) => {
    const [activeTab, setActiveTab] = useState<ResultsTab>('overview');
    const toulmin = submission.reasoningRubric?.toulminAnalysis;
    const argGraph = submission.argumentGraph;

    const taggedTurns = useMemo(() => {
        if (!submission.transcript?.length) return [];

        return submission.transcript.map((turn) => {
            const matchingNodes: ArgumentNode[] = [];
            if (argGraph?.nodes) {
                for (const node of argGraph.nodes) {
                    if (
                        node.speaker === turn.speaker &&
                        turn.text.toLowerCase().includes(node.content.toLowerCase().substring(0, 30))
                    ) {
                        matchingNodes.push(node);
                    }
                }
            }
            return { turn, nodes: matchingNodes };
        });
    }, [submission.transcript, argGraph]);

    const toulminComponents = useMemo(() => {
        if (!toulmin) return [];
        return [
            { key: 'claim', ...toulmin.claim, ...TOULMIN_COLORS.claim },
            { key: 'data', ...toulmin.data, ...TOULMIN_COLORS.data },
            { key: 'warrant', ...toulmin.warrant, ...TOULMIN_COLORS.warrant },
            { key: 'backing', ...toulmin.backing, ...TOULMIN_COLORS.backing },
            { key: 'qualifier', ...toulmin.qualifier, ...TOULMIN_COLORS.qualifier },
            { key: 'rebuttal', ...toulmin.rebuttal, ...TOULMIN_COLORS.rebuttal }
        ];
    }, [toulmin]);

    const maxCount = Math.max(...toulminComponents.map((component) => component.count), 1);

    const peerData = useMemo(() => {
        if (!peerSubmissions || peerSubmissions.length === 0) return null;
        return GroupKnowledgeService.getPeerClaims([submission, ...peerSubmissions], submission.studentName);
    }, [peerSubmissions, submission]);

    const rubricEntries = useMemo<[string, RubricEntry][]>(() => {
        if (!submission.rubricBreakdown) return [];
        return Object.entries(submission.rubricBreakdown) as [string, RubricEntry][];
    }, [submission.rubricBreakdown]);

    const summaryCards = [
        {
            label: 'Overall score',
            value: `${submission.score}`,
            hint: 'Composite interview result'
        },
        {
            label: 'Reasoning score',
            value: `${submission.reasoningRubric?.overallReasoningScore ?? 'N/A'}`,
            hint: 'Analytical depth and structure'
        },
        {
            label: 'Turns recorded',
            value: `${submission.transcript?.length || 0}`,
            hint: 'Conversation turns captured'
        },
        {
            label: 'Confidence',
            value: submission.confidenceScore != null ? `${Math.round(submission.confidenceScore * 100)}%` : 'N/A',
            hint: 'Model confidence in this evaluation'
        }
    ];

    const renderOverview = () => (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {summaryCards.map((card) => (
                    <div key={card.label} className="glass-panel-light rounded-2xl p-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">{card.label}</p>
                        <p className="text-3xl font-black text-white">{card.value}</p>
                        <p className="text-xs text-slate-500 mt-2">{card.hint}</p>
                    </div>
                ))}
            </div>

            <div className="glass-panel p-6 rounded-3xl">
                <h3 className="text-lg font-bold text-white mb-2">AI feedback</h3>
                <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">
                    {submission.feedback || 'No feedback was generated for this submission.'}
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-panel p-6 rounded-3xl">
                    <h3 className="text-lg font-bold text-white mb-1">Session summary</h3>
                    <p className="text-xs text-slate-500 mb-4">A quick snapshot of pacing and interaction.</p>
                    <div className="space-y-3">
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                            <p className="text-sm font-medium text-white">Average response time</p>
                            <p className="text-sm text-slate-400 mt-1">
                                {submission.latencyMetrics?.avgInitialLatency != null
                                    ? `${submission.latencyMetrics.avgInitialLatency} ms`
                                    : 'Not available'}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                            <p className="text-sm font-medium text-white">Turn-taking ratio</p>
                            <p className="text-sm text-slate-400 mt-1">
                                {submission.latencyMetrics?.turnTakingRatio != null
                                    ? submission.latencyMetrics.turnTakingRatio.toFixed(2)
                                    : 'Not available'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="glass-panel p-6 rounded-3xl">
                    <h3 className="text-lg font-bold text-white mb-1">Rubric breakdown</h3>
                    <p className="text-xs text-slate-500 mb-4">How the evaluation was distributed across core dimensions.</p>
                    {submission.rubricBreakdown ? (
                        <div className="space-y-3">
                            {rubricEntries.map(([key, entry]) => (
                                <div key={key} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-medium text-white capitalize">
                                            {key.replace(/([A-Z])/g, ' $1').trim()}
                                        </p>
                                        <span className="text-sm font-mono text-emerald-400">{entry.score}/5</span>
                                    </div>
                                    {entry.evidence?.length > 0 && (
                                        <p className="text-xs text-slate-500 mt-2">
                                            {entry.evidence[0]}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500">No rubric breakdown is available for this submission.</p>
                    )}
                </div>
            </div>
        </div>
    );

    const renderReasoning = () => (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-panel p-6 rounded-3xl">
                <h3 className="text-lg font-bold text-white mb-1">Toulmin argument structure</h3>
                <p className="text-xs text-slate-500 mb-4">
                    {toulmin ? `Completeness: ${Math.round(toulmin.completenessScore * 100)}%` : 'Analysis not available'}
                </p>

                {toulmin ? (
                    <div className="space-y-3">
                        {toulminComponents.map((component) => (
                            <div key={component.key} className="space-y-1">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${component.bg} ${component.text} border ${component.border}`}>
                                            {component.label}
                                        </span>
                                        <span className={`text-xs ${component.detected ? 'text-slate-300' : 'text-slate-600'}`}>
                                            {component.detected ? 'Detected' : 'Missing'}
                                        </span>
                                    </div>
                                    <span className="text-sm font-mono text-slate-300">{component.count}</span>
                                </div>
                                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${component.bg.replace('/10', '/40')}`}
                                        style={{ width: `${Math.max((component.count / maxCount) * 100, 2)}%` }}
                                    />
                                </div>
                                {component.examples?.length > 0 && (
                                    <p className="text-xs text-slate-500 italic">
                                        "{component.examples[0].substring(0, 100)}{component.examples[0].length > 100 ? '...' : ''}"
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-slate-500">No Toulmin analysis data was generated.</p>
                )}
            </div>

            <div className="glass-panel p-6 rounded-3xl">
                <h3 className="text-lg font-bold text-white mb-1">Reasoning analytics</h3>
                <p className="text-xs text-slate-500 mb-4">
                    Overall reasoning score: {submission.reasoningRubric?.overallReasoningScore ?? 'N/A'}/100
                </p>

                {submission.reasoningRubric ? (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-sm text-slate-300 font-medium">Explicit justification</span>
                                <span className="text-sm font-mono text-emerald-400">{submission.reasoningRubric.explicitJustification.score}/5</span>
                            </div>
                            <p className="text-xs text-slate-500">{submission.reasoningRubric.explicitJustification.count} evidence-based statements</p>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-sm text-slate-300 font-medium">Causal explanation</span>
                                <span className="text-sm font-mono text-emerald-400">{submission.reasoningRubric.causalExplanation.score}/5</span>
                            </div>
                            <p className="text-xs text-slate-500">{submission.reasoningRubric.causalExplanation.patterns.length} causal patterns found</p>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-sm text-slate-300 font-medium">Counter-argument handling</span>
                                <span className="text-sm font-mono text-emerald-400">{submission.reasoningRubric.counterArgumentHandling.score}/5</span>
                            </div>
                            <p className="text-xs text-slate-500">{submission.reasoningRubric.counterArgumentHandling.attempts} attempts</p>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-sm text-slate-300 font-medium">Abstraction and generalization</span>
                                <span className="text-sm font-mono text-emerald-400">{submission.reasoningRubric.abstractionGeneralization.score}/5</span>
                            </div>
                            <p className="text-xs text-slate-500">{submission.reasoningRubric.abstractionGeneralization.instances.length} generalization attempts</p>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-slate-500">No reasoning analytics are available.</p>
                )}
            </div>
        </div>
    );

    const renderPeers = () => (
        <div className="glass-panel p-6 rounded-3xl">
            <h3 className="text-lg font-bold text-white mb-1">Peer perspectives</h3>
            <p className="text-xs text-slate-500 mb-4">
                Anonymous comparison with classmates who completed the same interview.
            </p>

            {peerData ? (
                <div className="space-y-5">
                    {peerData.shared.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-sm font-medium text-emerald-400">Shared ideas</span>
                                <span className="text-xs text-slate-600">Concepts you and your peers both raised</span>
                            </div>
                            <div className="space-y-2">
                                {peerData.shared.map((item, index) => (
                                    <div key={index} className="flex items-start gap-3 p-3 bg-emerald-500/5 border border-emerald-500/15 rounded-xl">
                                        <div className="flex-shrink-0 px-2 py-0.5 bg-emerald-500/20 rounded-full text-xs font-bold text-emerald-400">
                                            {item.count + 1} students
                                        </div>
                                        <p className="text-sm text-slate-300 leading-relaxed">"{item.claim}"</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {peerData.unique.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-sm font-medium text-indigo-400">Different perspectives</span>
                                <span className="text-xs text-slate-600">Ideas explored by peers that may expand your answer set</span>
                            </div>
                            <div className="space-y-2">
                                {peerData.unique.map((item, index) => (
                                    <div key={index} className="flex items-start gap-3 p-3 bg-indigo-500/5 border border-indigo-500/15 rounded-xl">
                                        <div className="flex-shrink-0 px-2 py-0.5 bg-indigo-500/20 rounded-full text-xs font-bold text-indigo-400">
                                            {item.count} peers
                                        </div>
                                        <p className="text-sm text-slate-300 leading-relaxed">"{item.claim}"</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {peerData.shared.length === 0 && peerData.unique.length === 0 && (
                        <p className="text-sm text-slate-500">Not enough overlapping concepts were found for a comparison yet.</p>
                    )}
                </div>
            ) : (
                <div className="text-center py-8 text-slate-600">
                    <p className="text-sm">Peer comparisons will appear once more classmates complete the same interview.</p>
                </div>
            )}
        </div>
    );

    const renderTranscript = () => (
        <div className="glass-panel p-6 rounded-3xl">
            <h3 className="text-lg font-bold text-white mb-1">Turn-by-turn transcript</h3>
            <p className="text-xs text-slate-500 mb-4">
                {submission.transcript?.length || 0} turns and {argGraph?.nodes?.length || 0} tagged argument nodes.
            </p>

            <div className="space-y-3 max-h-[520px] overflow-y-auto custom-scrollbar pr-2">
                {taggedTurns.map(({ turn, nodes }, index) => (
                    <div
                        key={index}
                        className={`p-4 rounded-2xl border ${
                            turn.speaker === 'user'
                                ? 'bg-blue-500/5 border-blue-500/15 ml-0 mr-8'
                                : 'bg-slate-800/30 border-slate-700/20 ml-8 mr-0'
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`text-xs font-semibold uppercase tracking-wider ${
                                turn.speaker === 'user' ? 'text-blue-400' : 'text-slate-500'
                            }`}>
                                {turn.speaker === 'user' ? 'Student' : 'AI interviewer'}
                            </span>
                            <span className="text-xs text-slate-600">
                                {new Date(turn.timestamp).toLocaleTimeString()}
                            </span>
                            {turn.latency && turn.latency > 0 && (
                                <span className="text-xs text-slate-600 ml-auto">
                                    {turn.latency < 1000 ? `${turn.latency} ms` : `${(turn.latency / 1000).toFixed(1)} s`}
                                </span>
                            )}
                        </div>

                        <p className="text-sm text-slate-300 leading-relaxed">{turn.text}</p>

                        {nodes.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-700/30">
                                {nodes.map((node) => {
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
                        <p className="text-sm">No transcript data is available.</p>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="w-full max-w-6xl space-y-6 animate-fade-in">
            <div className="glass-panel p-6 rounded-3xl">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-800 bg-slate-900/60 mb-4">
                            <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-bold">
                                Results and reflection
                            </span>
                        </div>
                        <h2 className="text-2xl lg:text-3xl font-bold text-white">Interview results</h2>
                        <p className="text-slate-400 text-sm mt-2">
                            {submission.studentName} - {submission.courseName} - {new Date(submission.timestamp).toLocaleDateString()}
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-center px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 min-w-[110px]">
                            <div className="text-3xl font-black text-emerald-400">{submission.score}</div>
                            <div className="text-xs text-slate-500 uppercase tracking-wider">Score</div>
                        </div>
                        <Button onClick={onBack} variant="secondary" size="sm">
                            Back
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-3">
                {(['overview', 'reasoning', 'peers', 'transcript'] as ResultsTab[]).map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`results-tab ${activeTab === tab ? 'results-tab-active' : ''}`}
                    >
                        {tab === 'overview' ? 'Overview' :
                         tab === 'reasoning' ? 'Reasoning' :
                         tab === 'peers' ? 'Peers' :
                         'Transcript'}
                    </button>
                ))}
            </div>

            {activeTab === 'overview' && renderOverview()}
            {activeTab === 'reasoning' && renderReasoning()}
            {activeTab === 'peers' && renderPeers()}
            {activeTab === 'transcript' && renderTranscript()}
        </div>
    );
};
