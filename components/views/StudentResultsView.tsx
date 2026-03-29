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

const NODE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    claim: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Claim' },
    evidence: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Evidence' },
    counterargument: { bg: 'bg-rose-500/15', text: 'text-rose-400', label: 'Counter' },
    justification: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Justification' },
    question: { bg: 'bg-slate-500/15', text: 'text-slate-400', label: 'Question' }
};

const RUBRIC_LABELS: Record<string, string> = {
    conceptualUnderstanding: 'Conceptual understanding',
    communicationClarity: 'Communication clarity',
    criticalThinking: 'Critical thinking',
    engagement: 'Engagement'
};

const scoreTone = (score: number) => {
    if (score >= 80) return { label: 'Strong performance', badge: 'text-emerald-300', box: 'bg-emerald-500/10 border-emerald-500/20' };
    if (score >= 60) return { label: 'Developing performance', badge: 'text-amber-300', box: 'bg-amber-500/10 border-amber-500/20' };
    return { label: 'Needs more support', badge: 'text-rose-300', box: 'bg-rose-500/10 border-rose-500/20' };
};

export const StudentResultsView: React.FC<StudentResultsViewProps> = ({ submission, peerSubmissions, onBack }) => {
    const [activeTab, setActiveTab] = useState<ResultsTab>('overview');
    const finalScore = submission.instructorReview?.overrideScore ?? submission.score;
    const tone = scoreTone(finalScore);
    const argGraph = submission.argumentGraph;
    const rubricEntries = useMemo<[string, RubricEntry][]>(() => {
        if (!submission.rubricBreakdown) return [];
        return Object.entries(submission.rubricBreakdown) as [string, RubricEntry][];
    }, [submission.rubricBreakdown]);

    const taggedTurns = useMemo(() => {
        if (!submission.transcript?.length) return [];
        return submission.transcript.map((turn) => {
            const nodes: ArgumentNode[] = [];
            if (argGraph?.nodes) {
                for (const node of argGraph.nodes) {
                    if (node.speaker === turn.speaker && turn.text.toLowerCase().includes(node.content.toLowerCase().substring(0, 30))) {
                        nodes.push(node);
                    }
                }
            }
            return { turn, nodes };
        });
    }, [submission.transcript, argGraph]);

    const strengths = useMemo(() => [...rubricEntries].sort((a, b) => b[1].score - a[1].score).slice(0, 2), [rubricEntries]);
    const priorities = useMemo(() => [...rubricEntries].sort((a, b) => a[1].score - b[1].score).slice(0, 2), [rubricEntries]);
    const peerData = useMemo(() => {
        if (!peerSubmissions?.length) return null;
        return GroupKnowledgeService.getPeerClaims([submission, ...peerSubmissions], submission.studentName);
    }, [peerSubmissions, submission]);

    const transcriptEvidence = useMemo(
        () => taggedTurns.filter(({ turn }) => turn.speaker === 'user').slice(0, 3),
        [taggedTurns]
    );

    const summaryCards = [
        ['Overall score', `${finalScore}`, tone.label],
        ['Reasoning score', `${submission.reasoningRubric?.overallReasoningScore ?? 'N/A'}`, 'Analytical depth and structure'],
        ['Turns recorded', `${submission.transcript?.length || 0}`, 'Conversation turns captured'],
        ['Confidence', submission.confidenceScore != null ? `${Math.round(submission.confidenceScore * 100)}%` : 'N/A', 'Model confidence in this evaluation']
    ] as const;

    const renderOverview = () => (
        <div className="space-y-6">
            {submission.instructorReview && (
                <div className="glass-panel p-6 rounded-3xl border border-indigo-500/15">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-bold text-white mb-1">Instructor review</h3>
                            <p className="text-xs text-slate-500">
                                This result has been reviewed by {submission.instructorReview.reviewerName}.
                            </p>
                        </div>
                        <div className="text-left lg:text-right">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-600 font-bold">Final reviewed score</p>
                            <p className="text-2xl font-black text-indigo-300">
                                {submission.instructorReview.overrideScore ?? submission.score}
                            </p>
                        </div>
                    </div>
                    {submission.instructorReview.notes && (
                        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Instructor notes</p>
                            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                                {submission.instructorReview.notes}
                            </p>
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {summaryCards.map(([label, value, hint]) => (
                    <div key={label} className="glass-panel-light rounded-2xl p-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">{label}</p>
                        <p className="text-3xl font-black text-white">{value}</p>
                        <p className="text-xs text-slate-500 mt-2">{hint}</p>
                    </div>
                ))}
            </div>

            <div className="glass-panel p-6 rounded-3xl">
                <div className="flex flex-col lg:flex-row justify-between gap-4">
                    <div className="max-w-2xl">
                        <h3 className="text-lg font-bold text-white mb-2">Evaluation summary</h3>
                        <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                            {submission.feedback || 'No feedback was generated for this submission.'}
                        </p>
                    </div>
                    <div className={`rounded-2xl border px-4 py-3 ${tone.box}`}>
                        <p className={`text-sm font-semibold ${tone.badge}`}>{tone.label}</p>
                        <p className="text-xs text-slate-400 mt-1">Use the sections below to connect the score to evidence.</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-panel p-6 rounded-3xl">
                    <h3 className="text-lg font-bold text-white mb-1">What worked well</h3>
                    <p className="text-xs text-slate-500 mb-4">The clearest strengths in this attempt.</p>
                    <div className="space-y-3">
                        {strengths.length ? strengths.map(([key, entry]) => (
                            <div key={key} className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-semibold text-white">{RUBRIC_LABELS[key] || key}</p>
                                    <span className="text-sm font-mono text-emerald-300">{entry.score}/5</span>
                                </div>
                                <p className="text-xs text-slate-400 mt-2">{entry.evidence?.[0] || 'This area scored well, but no excerpt was captured.'}</p>
                            </div>
                        )) : <p className="text-sm text-slate-500">Strength signals will appear once rubric evidence is available.</p>}
                    </div>
                </div>

                <div className="glass-panel p-6 rounded-3xl">
                    <h3 className="text-lg font-bold text-white mb-1">Next improvement priorities</h3>
                    <p className="text-xs text-slate-500 mb-4">Focus here first before the next attempt.</p>
                    <div className="space-y-3">
                        {priorities.length ? priorities.map(([key, entry]) => (
                            <div key={key} className="rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-semibold text-white">{RUBRIC_LABELS[key] || key}</p>
                                    <span className="text-sm font-mono text-amber-300">{entry.score}/5</span>
                                </div>
                                <p className="text-xs text-slate-400 mt-2">{entry.evidence?.[0] || 'This area needs more support, but no excerpt was captured.'}</p>
                            </div>
                        )) : <p className="text-sm text-slate-500">Growth priorities will appear once rubric evidence is available.</p>}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-panel p-6 rounded-3xl">
                    <h3 className="text-lg font-bold text-white mb-1">Why this score</h3>
                    <p className="text-xs text-slate-500 mb-4">A rubric-led trail showing how the evaluation was formed.</p>
                    <div className="space-y-3">
                        {rubricEntries.length ? rubricEntries.map(([key, entry]) => (
                            <div key={key} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-medium text-white">{RUBRIC_LABELS[key] || key}</p>
                                    <span className="text-sm font-mono text-emerald-400">{entry.score}/5</span>
                                </div>
                                <p className="text-xs text-slate-500 mt-2">{entry.evidence?.[0] || 'No direct quote was stored for this rubric area.'}</p>
                            </div>
                        )) : <p className="text-sm text-slate-500">No rubric breakdown is available for this submission.</p>}
                    </div>
                </div>

                <div className="glass-panel p-6 rounded-3xl">
                    <h3 className="text-lg font-bold text-white mb-1">Evidence trail</h3>
                    <p className="text-xs text-slate-500 mb-4">Selected transcript excerpts that help contextualize the evaluation.</p>
                    <div className="space-y-3">
                        {transcriptEvidence.length ? transcriptEvidence.map(({ turn, nodes }, index) => (
                            <div key={`${turn.timestamp}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                                <p className="text-sm text-slate-300 leading-relaxed">"{turn.text}"</p>
                                {nodes.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {nodes.map((node) => {
                                            const color = NODE_COLORS[node.type] || NODE_COLORS.claim;
                                            return <span key={node.id} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color.bg} ${color.text}`}>{color.label}</span>;
                                        })}
                                    </div>
                                )}
                            </div>
                        )) : <p className="text-sm text-slate-500">No transcript evidence trail is available yet.</p>}
                    </div>
                </div>
            </div>
        </div>
    );

    const renderReasoning = () => (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-panel p-6 rounded-3xl">
                <h3 className="text-lg font-bold text-white mb-1">Reasoning structure</h3>
                <p className="text-xs text-slate-500 mb-4">A summary of argument quality and reasoning patterns.</p>
                {submission.reasoningRubric ? (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"><div className="flex justify-between items-center mb-1"><span className="text-sm text-slate-300 font-medium">Explicit justification</span><span className="text-sm font-mono text-emerald-400">{submission.reasoningRubric.explicitJustification.score}/5</span></div><p className="text-xs text-slate-500">{submission.reasoningRubric.explicitJustification.count} evidence-based statements</p></div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"><div className="flex justify-between items-center mb-1"><span className="text-sm text-slate-300 font-medium">Causal explanation</span><span className="text-sm font-mono text-emerald-400">{submission.reasoningRubric.causalExplanation.score}/5</span></div><p className="text-xs text-slate-500">{submission.reasoningRubric.causalExplanation.patterns.length} causal patterns found</p></div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"><div className="flex justify-between items-center mb-1"><span className="text-sm text-slate-300 font-medium">Counter-argument handling</span><span className="text-sm font-mono text-emerald-400">{submission.reasoningRubric.counterArgumentHandling.score}/5</span></div><p className="text-xs text-slate-500">{submission.reasoningRubric.counterArgumentHandling.attempts} attempts</p></div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"><div className="flex justify-between items-center mb-1"><span className="text-sm text-slate-300 font-medium">Abstraction and generalization</span><span className="text-sm font-mono text-emerald-400">{submission.reasoningRubric.abstractionGeneralization.score}/5</span></div><p className="text-xs text-slate-500">{submission.reasoningRubric.abstractionGeneralization.instances.length} generalization attempts</p></div>
                    </div>
                ) : <p className="text-sm text-slate-500">No reasoning analytics are available.</p>}
            </div>

            <div className="glass-panel p-6 rounded-3xl">
                <h3 className="text-lg font-bold text-white mb-1">Dialogue and argument map</h3>
                <p className="text-xs text-slate-500 mb-4">Signals that help explain how the conversation evolved.</p>
                <div className="space-y-4">
                    {submission.dialogueMetrics && (
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div><p className="text-slate-600 uppercase tracking-wide">Turn initiatives</p><p className="text-slate-300 mt-1">{submission.dialogueMetrics.turnInitiatives}</p></div>
                                <div><p className="text-slate-600 uppercase tracking-wide">Rephrasing events</p><p className="text-slate-300 mt-1">{submission.dialogueMetrics.rephrasingEvents}</p></div>
                                <div><p className="text-slate-600 uppercase tracking-wide">Avg follow-up depth</p><p className="text-slate-300 mt-1">{submission.dialogueMetrics.avgFollowUpDepth}</p></div>
                                <div><p className="text-slate-600 uppercase tracking-wide">Question response ratio</p><p className="text-slate-300 mt-1">{submission.dialogueMetrics.questionResponseRatio.toFixed(2)}</p></div>
                            </div>
                        </div>
                    )}
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                        <p className="text-sm text-slate-300 font-medium">Argument graph</p>
                        <p className="text-xs text-slate-500 mt-2">
                            {argGraph ? `${argGraph.nodes.length} nodes, ${argGraph.edges.length} links, coherence ${Math.round(argGraph.coherenceScore * 100)}%` : 'No argument graph was generated for this attempt.'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderPeers = () => (
        <div className="glass-panel p-6 rounded-3xl">
            <h3 className="text-lg font-bold text-white mb-1">Peer perspectives</h3>
            <p className="text-xs text-slate-500 mb-4">Anonymous comparison with classmates who completed the same interview.</p>
            {peerData ? (
                <div className="space-y-5">
                    {peerData.shared.length > 0 && <div><div className="flex items-center gap-2 mb-3"><span className="text-sm font-medium text-emerald-400">Shared ideas</span><span className="text-xs text-slate-600">Concepts you and your peers both raised</span></div><div className="space-y-2">{peerData.shared.map((item, index) => <div key={index} className="flex items-start gap-3 p-3 bg-emerald-500/5 border border-emerald-500/15 rounded-xl"><div className="flex-shrink-0 px-2 py-0.5 bg-emerald-500/20 rounded-full text-xs font-bold text-emerald-400">{item.count + 1} students</div><p className="text-sm text-slate-300 leading-relaxed">"{item.claim}"</p></div>)}</div></div>}
                    {peerData.unique.length > 0 && <div><div className="flex items-center gap-2 mb-3"><span className="text-sm font-medium text-indigo-400">Different perspectives</span><span className="text-xs text-slate-600">Ideas explored by peers that may expand your answer set</span></div><div className="space-y-2">{peerData.unique.map((item, index) => <div key={index} className="flex items-start gap-3 p-3 bg-indigo-500/5 border border-indigo-500/15 rounded-xl"><div className="flex-shrink-0 px-2 py-0.5 bg-indigo-500/20 rounded-full text-xs font-bold text-indigo-400">{item.count} peers</div><p className="text-sm text-slate-300 leading-relaxed">"{item.claim}"</p></div>)}</div></div>}
                    {peerData.shared.length === 0 && peerData.unique.length === 0 && <p className="text-sm text-slate-500">Not enough overlapping concepts were found for a comparison yet.</p>}
                </div>
            ) : <div className="text-center py-8 text-slate-600"><p className="text-sm">Peer comparisons will appear once more classmates complete the same interview.</p></div>}
        </div>
    );

    const renderTranscript = () => (
        <div className="glass-panel p-6 rounded-3xl">
            <h3 className="text-lg font-bold text-white mb-1">Turn-by-turn transcript</h3>
            <p className="text-xs text-slate-500 mb-4">{submission.transcript?.length || 0} turns and {argGraph?.nodes?.length || 0} tagged argument nodes.</p>
            <div className="space-y-3 max-h-[520px] overflow-y-auto custom-scrollbar pr-2">
                {taggedTurns.map(({ turn, nodes }, index) => (
                    <div key={index} className={`p-4 rounded-2xl border ${turn.speaker === 'user' ? 'bg-blue-500/5 border-blue-500/15 ml-0 mr-8' : 'bg-slate-800/30 border-slate-700/20 ml-8 mr-0'}`}>
                        <div className="flex items-center gap-2 mb-2"><span className={`text-xs font-semibold uppercase tracking-wider ${turn.speaker === 'user' ? 'text-blue-400' : 'text-slate-500'}`}>{turn.speaker === 'user' ? 'Student' : 'AI interviewer'}</span><span className="text-xs text-slate-600">{new Date(turn.timestamp).toLocaleTimeString()}</span>{turn.latency && turn.latency > 0 && <span className="text-xs text-slate-600 ml-auto">{turn.latency < 1000 ? `${turn.latency} ms` : `${(turn.latency / 1000).toFixed(1)} s`}</span>}</div>
                        <p className="text-sm text-slate-300 leading-relaxed">{turn.text}</p>
                        {nodes.length > 0 && <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-700/30">{nodes.map((node) => { const color = NODE_COLORS[node.type] || NODE_COLORS.claim; return <span key={node.id} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color.bg} ${color.text}`}>{color.label}</span>; })}</div>}
                    </div>
                ))}
                {(!submission.transcript || submission.transcript.length === 0) && <div className="text-center py-8 text-slate-600"><p className="text-sm">No transcript data is available.</p></div>}
            </div>
        </div>
    );

    return (
        <div className="w-full max-w-6xl space-y-6 animate-fade-in">
            <div className="glass-panel p-6 rounded-3xl">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-800 bg-slate-900/60 mb-4">
                            <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-bold">Results and reflection</span>
                        </div>
                        <h2 className="text-2xl lg:text-3xl font-bold text-white">Interview results</h2>
                        <p className="text-slate-400 text-sm mt-2">{submission.studentName} - {submission.courseName} - {new Date(submission.timestamp).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className={`text-center px-4 py-3 rounded-2xl border min-w-[132px] ${tone.box}`}>
                            <div className="text-3xl font-black text-white">{finalScore}</div>
                            <div className="text-xs text-slate-500 uppercase tracking-wider">Score</div>
                            <div className={`text-[11px] mt-1 ${tone.badge}`}>{tone.label}</div>
                        </div>
                        <Button onClick={onBack} variant="secondary" size="sm">Back</Button>
                    </div>
                </div>
            </div>
            <div className="flex flex-wrap gap-3">
                {(['overview', 'reasoning', 'peers', 'transcript'] as ResultsTab[]).map((tab) => (
                    <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`results-tab ${activeTab === tab ? 'results-tab-active' : ''}`}>
                        {tab === 'overview' ? 'Overview' : tab === 'reasoning' ? 'Reasoning' : tab === 'peers' ? 'Peers' : 'Transcript'}
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

export default StudentResultsView;
