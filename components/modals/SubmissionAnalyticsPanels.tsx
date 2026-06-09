import React from 'react';
import {
    ArgumentGraph,
    BargeInEvent,
    DialogueMetrics,
    LatencyMetrics,
    ReasoningRubric,
    RubricBreakdown,
    Submission,
    TranscriptionItem,
} from '../../types';
import { BarChart, MetricCard, RadarChart, Sparkline } from '../charts';

// ─────────────────────────────────────────────────────────────────────────────
// Rubric radar + evidence
// ─────────────────────────────────────────────────────────────────────────────

const rubricAxes = [
    'Conceptual',
    'Clarity',
    'Critical',
    'Engagement',
];

export const RubricBreakdownPanel: React.FC<{ rubric: RubricBreakdown }> = ({ rubric }) => {
    const values = [
        rubric.conceptualUnderstanding.score,
        rubric.communicationClarity.score,
        rubric.criticalThinking.score,
        rubric.engagement.score,
    ];
    const dimensions: Array<{
        label: string;
        score: number;
        evidence: string[];
        tone: 'indigo' | 'emerald' | 'amber' | 'rose';
    }> = [
        { label: 'Conceptual Understanding', score: rubric.conceptualUnderstanding.score, evidence: rubric.conceptualUnderstanding.evidence ?? [], tone: 'indigo' },
        { label: 'Communication Clarity', score: rubric.communicationClarity.score, evidence: rubric.communicationClarity.evidence ?? [], tone: 'emerald' },
        { label: 'Critical Thinking', score: rubric.criticalThinking.score, evidence: rubric.criticalThinking.evidence ?? [], tone: 'amber' },
        { label: 'Engagement', score: rubric.engagement.score, evidence: rubric.engagement.evidence ?? [], tone: 'rose' },
    ];

    return (
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">🎯</span>
                <h4 className="text-slate-300 font-bold text-sm uppercase tracking-widest">
                    Rubric Breakdown
                </h4>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
                <RadarChart
                    axes={rubricAxes}
                    max={25}
                    series={[{ label: 'Score', values, tone: 'indigo' }]}
                />
                <div className="space-y-3">
                    {dimensions.map((d) => (
                        <details key={d.label} className="group bg-slate-950/40 rounded-lg border border-slate-800 p-3">
                            <summary className="flex justify-between items-center cursor-pointer select-none">
                                <span className="text-sm text-slate-300">{d.label}</span>
                                <span className="text-sm font-bold text-slate-100 tabular-nums">
                                    {d.score}<span className="text-slate-500 font-normal">/25</span>
                                </span>
                            </summary>
                            {d.evidence.length > 0 ? (
                                <ul className="mt-3 space-y-1.5 text-xs text-slate-400">
                                    {d.evidence.map((e, i) => (
                                        <li key={i} className="pl-3 border-l-2 border-slate-700 italic">
                                            "{e}"
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="mt-3 text-xs text-slate-500">No evidence captured.</p>
                            )}
                        </details>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Reasoning quality bars + overall score
// ─────────────────────────────────────────────────────────────────────────────

export const ReasoningQualityPanel: React.FC<{ rubric: ReasoningRubric }> = ({ rubric }) => (
    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
                <span className="text-2xl">🧠</span>
                <h4 className="text-slate-300 font-bold text-sm uppercase tracking-widest">
                    Reasoning Quality
                </h4>
            </div>
            <div className="text-sm">
                <span className="text-slate-500">Overall</span>{' '}
                <span className="text-indigo-300 font-bold tabular-nums">
                    {rubric.overallReasoningScore.toFixed(0)}/100
                </span>
            </div>
        </div>
        <BarChart
            max={5}
            data={[
                { label: 'Explicit Justification', value: rubric.explicitJustification.score, tone: 'indigo' },
                { label: 'Causal Explanation', value: rubric.causalExplanation.score, tone: 'emerald' },
                { label: 'Counter-Argument Handling', value: rubric.counterArgumentHandling.score, tone: 'amber' },
                { label: 'Abstraction / Generalization', value: rubric.abstractionGeneralization.score, tone: 'rose' },
            ]}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4 text-xs text-slate-500">
            <span>Justifications: <span className="text-slate-300 tabular-nums">{rubric.explicitJustification.count}</span></span>
            <span>Causal patterns: <span className="text-slate-300 tabular-nums">{rubric.causalExplanation.patterns.length}</span></span>
            <span>Counter attempts: <span className="text-slate-300 tabular-nums">{rubric.counterArgumentHandling.attempts}</span></span>
            <span>Generalizations: <span className="text-slate-300 tabular-nums">{rubric.abstractionGeneralization.instances.length}</span></span>
        </div>
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Toulmin argument completeness (Claim / Data / Warrant / Backing / Qualifier / Rebuttal)
// ─────────────────────────────────────────────────────────────────────────────

const TOULMIN_ORDER: Array<{
    key: keyof NonNullable<ReasoningRubric['toulminAnalysis']>;
    label: string;
    short: string;
}> = [
    { key: 'claim', label: 'Claim', short: 'C' },
    { key: 'data', label: 'Data / Evidence', short: 'D' },
    { key: 'warrant', label: 'Warrant', short: 'W' },
    { key: 'backing', label: 'Backing', short: 'B' },
    { key: 'qualifier', label: 'Qualifier', short: 'Q' },
    { key: 'rebuttal', label: 'Rebuttal', short: 'R' },
];

export const ToulminCompletenessPanel: React.FC<{ rubric: ReasoningRubric }> = ({ rubric }) => {
    const t = rubric.toulminAnalysis;
    if (!t) return null;
    return (
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">🧱</span>
                    <h4 className="text-slate-300 font-bold text-sm uppercase tracking-widest">
                        Argument Completeness
                    </h4>
                </div>
                <div className="text-sm">
                    <span className="text-slate-500">Toulmin</span>{' '}
                    <span className="text-indigo-300 font-bold tabular-nums">{t.completenessScore}/100</span>
                </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {TOULMIN_ORDER.map(({ key, label, short }) => {
                    const comp = t[key] as { detected: boolean; count: number; examples: string[] };
                    const present = comp?.detected;
                    return (
                        <div
                            key={key}
                            className={`rounded-xl border p-3 text-center ${
                                present
                                    ? 'border-emerald-500/30 bg-emerald-500/10'
                                    : 'border-slate-700/60 bg-slate-950/40'
                            }`}
                            title={comp?.examples?.[0] ? `"${comp.examples[0]}"` : label}
                        >
                            <div
                                className={`mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                                    present ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500'
                                }`}
                            >
                                {short}
                            </div>
                            <div className={`text-[10px] uppercase tracking-wide ${present ? 'text-emerald-300/80' : 'text-slate-500'}`}>
                                {label}
                            </div>
                            {present && comp.count > 0 && (
                                <div className="text-[10px] text-slate-500 tabular-nums mt-0.5">×{comp.count}</div>
                            )}
                        </div>
                    );
                })}
            </div>
            {t.missingComponents.length > 0 && (
                <p className="mt-4 text-xs text-slate-400">
                    <span className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">To strengthen: </span>
                    {t.missingComponents.join(', ')}
                </p>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Argument-graph structure (coherence + complexity)
// ─────────────────────────────────────────────────────────────────────────────

export const ArgumentStructurePanel: React.FC<{ graph: ArgumentGraph }> = ({ graph }) => (
    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">🕸️</span>
            <h4 className="text-slate-300 font-bold text-sm uppercase tracking-widest">
                Argument Structure
            </h4>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Coherence" value={`${Math.round(graph.coherenceScore)}%`} sublabel="Logical connectedness" tone="indigo" />
            <MetricCard label="Complexity" value={graph.complexity} sublabel="Nodes + links" tone="default" />
            <MetricCard label="Nodes" value={graph.nodes.length} tone="emerald" />
            <MetricCard label="Links" value={graph.edges.length} tone="amber" />
        </div>
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Session timing / latency metrics
// ─────────────────────────────────────────────────────────────────────────────

function studentLatencySeries(transcript: TranscriptionItem[]): number[] {
    // Interviewer asks, student answers — plot the gap between interviewer's
    // end and student's start. Proxy: transcript items of speaker 'user' that
    // carry a latency value.
    return transcript
        .filter((t) => t.speaker === 'user' && typeof t.latency === 'number' && !t.isBargeIn)
        .map((t) => (t.latency as number) / 1000); // seconds
}

export const SessionTimingPanel: React.FC<{
    metrics: LatencyMetrics;
    dialogue?: DialogueMetrics;
    transcript: TranscriptionItem[];
}> = ({ metrics, dialogue, transcript }) => {
    const perTurnLatencies = studentLatencySeries(transcript);
    return (
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">⏱️</span>
                <h4 className="text-slate-300 font-bold text-sm uppercase tracking-widest">
                    Session Timing
                </h4>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard
                    label="Turns"
                    value={metrics.turnCount}
                    tone="indigo"
                />
                <MetricCard
                    label="Avg Response"
                    value={`${(metrics.avgInitialLatency / 1000).toFixed(1)}s`}
                    sublabel="Time to start"
                    tone="default"
                />
                <MetricCard
                    label="Max Delay"
                    value={`${(metrics.maxLatency / 1000).toFixed(1)}s`}
                    tone="amber"
                />
                <MetricCard
                    label="Turn-Taking"
                    value={metrics.turnTakingRatio.toFixed(2)}
                    sublabel="Student / AI"
                    tone="emerald"
                />
            </div>
            {perTurnLatencies.length >= 2 && (
                <div className="mt-5">
                    <div className="flex justify-between text-[10px] text-slate-500 uppercase tracking-widest mb-1">
                        <span>Response delay per turn</span>
                        <span>{perTurnLatencies.length} turns</span>
                    </div>
                    <Sparkline values={perTurnLatencies} tone="indigo" area />
                </div>
            )}
            {dialogue && (
                <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-400">
                    <div>
                        <div className="text-slate-500 text-[10px] uppercase tracking-widest">Initiatives</div>
                        <div className="tabular-nums">{dialogue.turnInitiatives}</div>
                    </div>
                    <div>
                        <div className="text-slate-500 text-[10px] uppercase tracking-widest">Rephrasing</div>
                        <div className="tabular-nums">{dialogue.rephrasingEvents}</div>
                    </div>
                    <div>
                        <div className="text-slate-500 text-[10px] uppercase tracking-widest">Avg follow-up</div>
                        <div className="tabular-nums">{dialogue.avgFollowUpDepth.toFixed(0)} chars</div>
                    </div>
                    <div>
                        <div className="text-slate-500 text-[10px] uppercase tracking-widest">Latency σ</div>
                        <div className="tabular-nums">{(dialogue.latencyVariation / 1000).toFixed(2)}s</div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Barge-in events
// ─────────────────────────────────────────────────────────────────────────────

const interpretationTone: Record<BargeInEvent['interpretationType'], string> = {
    confidence: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    hasty_generalization: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    correction: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    unknown: 'bg-slate-700/40 text-slate-300 border-slate-600',
};

const interpretationLabel: Record<BargeInEvent['interpretationType'], string> = {
    confidence: 'Confidence',
    hasty_generalization: 'Hasty',
    correction: 'Correction',
    unknown: 'Unclassified',
};

export const BargeInPanel: React.FC<{ events: BargeInEvent[] }> = ({ events }) => {
    if (events.length === 0) return null;
    return (
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">↩️</span>
                <h4 className="text-slate-300 font-bold text-sm uppercase tracking-widest">
                    Interruptions <span className="text-slate-500 font-normal">({events.length})</span>
                </h4>
            </div>
            <ul className="space-y-3">
                {events.map((e, i) => (
                    <li key={i} className="text-xs space-y-1">
                        <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] uppercase font-bold tracking-widest ${interpretationTone[e.interpretationType]}`}>
                                {interpretationLabel[e.interpretationType]}
                            </span>
                            <time className="text-slate-500 tabular-nums" dateTime={new Date(e.timestamp).toISOString()}>
                                {new Date(e.timestamp).toLocaleTimeString()}
                            </time>
                        </div>
                        <div className="pl-2 border-l-2 border-slate-700 text-slate-400 italic">
                            "{e.studentUtterance}"
                        </div>
                        {e.interruptedContent && (
                            <div className="pl-2 text-slate-600">
                                cut off: "{e.interruptedContent.slice(0, 80)}{e.interruptedContent.length > 80 ? '…' : ''}"
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Composite: render whatever is present on a Submission, skip the rest
// ─────────────────────────────────────────────────────────────────────────────

export const SubmissionAnalyticsSection: React.FC<{ submission: Submission }> = ({ submission }) => (
    <>
        {submission.rubricBreakdown && (
            <RubricBreakdownPanel rubric={submission.rubricBreakdown} />
        )}
        {submission.reasoningRubric && (
            <ReasoningQualityPanel rubric={submission.reasoningRubric} />
        )}
        {submission.reasoningRubric?.toulminAnalysis && (
            <ToulminCompletenessPanel rubric={submission.reasoningRubric} />
        )}
        {submission.argumentGraph && submission.argumentGraph.nodes.length > 0 && (
            <ArgumentStructurePanel graph={submission.argumentGraph} />
        )}
        {submission.latencyMetrics && submission.latencyMetrics.turnCount > 0 && (
            <SessionTimingPanel
                metrics={submission.latencyMetrics}
                dialogue={submission.dialogueMetrics}
                transcript={submission.transcript}
            />
        )}
        {submission.bargeInEvents && submission.bargeInEvents.length > 0 && (
            <BargeInPanel events={submission.bargeInEvents} />
        )}
    </>
);

export default SubmissionAnalyticsSection;
