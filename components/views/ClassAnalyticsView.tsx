import React, { useMemo, useState } from 'react';
import { Course, Submission } from '../../types';
import {
    BarChart,
    Histogram,
    MetricCard,
    RadarChart,
    Sparkline,
} from '../charts';
import { ErrorBoundary } from '../ui/ErrorBoundary';

interface ClassAnalyticsViewProps {
    courses: Course[];
    /** Optional: filter to a single course. When null, rolls up across all
     *  visible courses. */
    selectedCourseId?: string | null;
    onSelectCourse?: (courseId: string | null) => void;
    onSelectSubmission?: (submission: Submission) => void;
}

type CourseSub = Submission & { courseName: string; courseId: string };

function meanOrNull(xs: number[]): number | null {
    if (xs.length === 0) return null;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Population standard deviation; null for n < 2 (dispersion is undefined). */
function stdDevOrNull(xs: number[]): number | null {
    if (xs.length < 2) return null;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
    return Math.sqrt(variance);
}

function medianOrNull(xs: number[]): number | null {
    if (xs.length === 0) return null;
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function safeFixed(v: number | null, digits = 1): string {
    return v == null ? '—' : v.toFixed(digits);
}

/** Minimum cohort size below which means/SD are statistically unreliable. */
const SMALL_N_THRESHOLD = 5;

function triggerDownload(filename: string, mime: string, content: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function csvCell(v: unknown): string {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const ClassAnalyticsView: React.FC<ClassAnalyticsViewProps> = ({
    courses,
    selectedCourseId,
    onSelectCourse,
    onSelectSubmission,
}) => {
    const [sortKey, setSortKey] = useState<'name' | 'score' | 'reasoning' | 'confidence' | 'turns' | 'time'>('time');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [visibleDimensions, setVisibleDimensions] = useState(true);

    const submissions: CourseSub[] = useMemo(() => {
        const source = selectedCourseId
            ? courses.filter((c) => c.id === selectedCourseId)
            : courses;
        return source.flatMap((c) =>
            c.submissions.map((s) => ({ ...s, courseName: c.name, courseId: c.id })),
        );
    }, [courses, selectedCourseId]);

    const totals = useMemo(() => {
        const scores = submissions.map((s) => s.score);
        const reasoningScores = submissions
            .map((s) => s.reasoningRubric?.overallReasoningScore)
            .filter((x): x is number => typeof x === 'number');
        const confidences = submissions
            .map((s) => s.confidenceScore)
            .filter((x): x is number => typeof x === 'number');
        const bargeIns = submissions.reduce(
            (acc, s) => acc + (s.bargeInEvents?.length ?? 0),
            0,
        );
        return {
            count: submissions.length,
            avgScore: meanOrNull(scores),
            sdScore: stdDevOrNull(scores),
            medianScore: medianOrNull(scores),
            avgReasoning: meanOrNull(reasoningScores),
            sdReasoning: stdDevOrNull(reasoningScores),
            avgConfidence: meanOrNull(confidences),
            bargeIns,
        };
    }, [submissions]);

    // Submissions the evaluation pipeline flagged for a human look — low model
    // confidence, large LLM/pattern disagreement, dropped responses, or too few
    // turns. Surfacing these is the core "human review matters" affordance.
    const flagged = useMemo(
        () => submissions.filter((s) => s.needsReview && !s.instructorReview),
        [submissions],
    );

    const exportRows = useMemo(
        () =>
            [...submissions]
                .sort((a, b) => a.timestamp - b.timestamp)
                .map((s) => ({
                    student: s.studentName,
                    course: s.courseName,
                    score: s.score,
                    finalScore: s.instructorReview?.overrideScore ?? s.score,
                    reasoningScore: s.reasoningRubric?.overallReasoningScore ?? '',
                    scoreAgreement: s.scoreAgreement ?? '',
                    confidence: s.confidenceScore != null ? Math.round(s.confidenceScore * 100) : '',
                    turns: s.latencyMetrics?.turnCount ?? '',
                    avgResponseMs: s.latencyMetrics?.avgInitialLatency != null ? Math.round(s.latencyMetrics.avgInitialLatency) : '',
                    bargeIns: s.bargeInEvents?.length ?? 0,
                    toulminCompleteness: s.reasoningRubric?.toulminAnalysis?.completenessScore ?? '',
                    coherence: s.argumentGraph?.coherenceScore != null ? Math.round(s.argumentGraph.coherenceScore) : '',
                    needsReview: s.needsReview ? 'yes' : 'no',
                    reviewReasons: (s.reviewReasons ?? []).join(' | '),
                    reviewStatus: s.instructorReview?.status ?? 'pending',
                    analysisVersion: s.analysisVersion ?? '',
                    promptVersion: s.promptVersion ?? '',
                    evalModel: s.evalModel ?? '',
                    timestamp: new Date(s.timestamp).toISOString(),
                })),
        [submissions],
    );

    const exportCsv = () => {
        const headers = Object.keys(exportRows[0] ?? { student: '' });
        const lines = [
            headers.join(','),
            ...exportRows.map((r) => headers.map((h) => csvCell((r as Record<string, unknown>)[h])).join(',')),
        ];
        const stamp = new Date().toISOString().slice(0, 10);
        triggerDownload(`speakwise-cohort-${stamp}.csv`, 'text/csv;charset=utf-8', lines.join('\n'));
    };

    const exportJson = () => {
        const stamp = new Date().toISOString().slice(0, 10);
        triggerDownload(
            `speakwise-cohort-${stamp}.json`,
            'application/json',
            JSON.stringify({ exportedAt: new Date().toISOString(), count: exportRows.length, rows: exportRows }, null, 2),
        );
    };

    const classRadar = useMemo(() => {
        const withRubric = submissions
            .map((s) => s.rubricBreakdown)
            .filter((r): r is NonNullable<typeof r> => !!r);
        if (withRubric.length === 0) return null;
        const axisScore = (key: keyof typeof withRubric[number]) =>
            withRubric.reduce((a, r) => a + r[key].score, 0) / withRubric.length;
        return [
            axisScore('conceptualUnderstanding'),
            axisScore('communicationClarity'),
            axisScore('criticalThinking'),
            axisScore('engagement'),
        ];
    }, [submissions]);

    const reasoningBars = useMemo(() => {
        const withRubric = submissions
            .map((s) => s.reasoningRubric)
            .filter((r): r is NonNullable<typeof r> => !!r);
        if (withRubric.length === 0) return null;
        const avg = (pick: (r: NonNullable<typeof withRubric[number]>) => number) =>
            withRubric.reduce((a, r) => a + pick(r), 0) / withRubric.length;
        return [
            { label: 'Explicit Justification', value: avg((r) => r.explicitJustification.score), tone: 'indigo' as const },
            { label: 'Causal Explanation', value: avg((r) => r.causalExplanation.score), tone: 'emerald' as const },
            { label: 'Counter-Argument Handling', value: avg((r) => r.counterArgumentHandling.score), tone: 'amber' as const },
            { label: 'Abstraction / Generalization', value: avg((r) => r.abstractionGeneralization.score), tone: 'rose' as const },
        ];
    }, [submissions]);

    const scoreTrend = useMemo(() => {
        // Ordered oldest → newest so the sparkline reads left-to-right in time.
        return [...submissions]
            .sort((a, b) => a.timestamp - b.timestamp)
            .map((s) => s.score);
    }, [submissions]);

    const sortedTable = useMemo(() => {
        const dir = sortDir === 'asc' ? 1 : -1;
        const sorted = [...submissions];
        sorted.sort((a, b) => {
            switch (sortKey) {
                case 'name':
                    return a.studentName.localeCompare(b.studentName) * dir;
                case 'score':
                    return (a.score - b.score) * dir;
                case 'reasoning':
                    return ((a.reasoningRubric?.overallReasoningScore ?? -1) -
                        (b.reasoningRubric?.overallReasoningScore ?? -1)) * dir;
                case 'confidence':
                    return ((a.confidenceScore ?? -1) - (b.confidenceScore ?? -1)) * dir;
                case 'turns':
                    return ((a.latencyMetrics?.turnCount ?? 0) -
                        (b.latencyMetrics?.turnCount ?? 0)) * dir;
                case 'time':
                default:
                    return (a.timestamp - b.timestamp) * dir;
            }
        });
        return sorted;
    }, [submissions, sortKey, sortDir]);

    function toggleSort(key: typeof sortKey) {
        if (key === sortKey) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    }

    if (submissions.length === 0) {
        return (
            <div className="glass-panel p-8 rounded-3xl text-center">
                <h3 className="text-lg font-semibold text-slate-300">No submissions yet</h3>
                <p className="text-sm text-slate-500 mt-2">
                    Analytics will appear after the first student completes an interview.
                </p>
                <p className="text-xs text-slate-600 mt-2">
                    Share the course number and entry code with your students to get the first attempts in.
                </p>
            </div>
        );
    }

    return (
        <div className="glass-panel p-6 rounded-3xl space-y-6">
            {/* Header + course filter */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h3 className="text-lg font-bold text-white">Class Analytics</h3>
                    <p className="text-xs text-slate-500">
                        {selectedCourseId
                            ? `Filtered to ${courses.find((c) => c.id === selectedCourseId)?.name ?? '…'}`
                            : `All visible courses (${courses.length})`}
                    </p>
                    {totals.count < SMALL_N_THRESHOLD && (
                        <p className="text-[11px] text-amber-300/80 mt-1">
                            Small cohort (n = {totals.count}): averages and spread are indicative only.
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {onSelectCourse && courses.length > 1 && (
                        <select
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                            value={selectedCourseId ?? ''}
                            onChange={(e) =>
                                onSelectCourse(e.target.value === '' ? null : e.target.value)
                            }
                            aria-label="Filter analytics by course"
                        >
                            <option value="">All courses</option>
                            {courses.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    )}
                    <button
                        type="button"
                        onClick={exportCsv}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-500"
                        aria-label="Export cohort analytics as CSV"
                    >
                        Export CSV
                    </button>
                    <button
                        type="button"
                        onClick={exportJson}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-500"
                        aria-label="Export cohort analytics as JSON"
                    >
                        JSON
                    </button>
                </div>
            </div>

            {/* Top metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard
                    label="Submissions"
                    value={totals.count}
                    sublabel={flagged.length > 0 ? `${flagged.length} flagged for review` : 'all reviewed/clear'}
                    tone="indigo"
                />
                <MetricCard
                    label="Avg Score"
                    value={`${safeFixed(totals.avgScore, 0)}%`}
                    sublabel={`median ${safeFixed(totals.medianScore, 0)} · SD ${safeFixed(totals.sdScore, 1)}`}
                    tone="emerald"
                />
                <MetricCard
                    label="Avg Reasoning"
                    value={totals.avgReasoning == null ? '—' : `${totals.avgReasoning.toFixed(0)}/100`}
                    sublabel={`SD ${safeFixed(totals.sdReasoning, 1)} · rubric overall`}
                    tone="amber"
                />
                <MetricCard
                    label="Avg Confidence"
                    value={totals.avgConfidence == null ? '—' : `${(totals.avgConfidence * 100).toFixed(0)}%`}
                    sublabel="AI self-rated (calibrated)"
                    tone="default"
                />
            </div>

            {/* Score distribution + trend */}
            <ErrorBoundary compact panelName="score distribution">
            <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            Score Distribution
                        </h4>
                        <span className="text-[10px] text-slate-500">10 bins · 0–100</span>
                    </div>
                    <Histogram
                        values={submissions.map((s) => s.score)}
                        min={0}
                        max={100}
                        bins={10}
                        unit="%"
                        heightClass="h-36"
                    />
                </div>
                <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            Score over time
                        </h4>
                        <span className="text-[10px] text-slate-500">oldest → newest</span>
                    </div>
                    <Sparkline
                        values={scoreTrend}
                        min={0}
                        max={100}
                        tone="emerald"
                        height={80}
                    />
                    <div className="mt-2 text-[10px] text-slate-500 flex justify-between tabular-nums">
                        <span>min {Math.min(...scoreTrend)}%</span>
                        <span>max {Math.max(...scoreTrend)}%</span>
                    </div>
                </div>
            </div>
            </ErrorBoundary>

            {/* Class radar + reasoning bars */}
            {(classRadar || reasoningBars) && (
                <ErrorBoundary compact panelName="rubric profile">
                <div className="grid md:grid-cols-2 gap-6">
                    {classRadar && (
                        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                    Class Rubric Profile
                                </h4>
                                <span className="text-[10px] text-slate-500">avg 0–25 per axis</span>
                            </div>
                            <RadarChart
                                axes={['Conceptual', 'Clarity', 'Critical', 'Engagement']}
                                max={25}
                                series={[{ label: 'Class avg', values: classRadar, tone: 'indigo' }]}
                            />
                        </div>
                    )}
                    {reasoningBars && (
                        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                    Reasoning dimensions
                                </h4>
                                <button
                                    className="text-[10px] text-slate-500 hover:text-slate-300 underline"
                                    onClick={() => setVisibleDimensions((v) => !v)}
                                >
                                    {visibleDimensions ? 'hide' : 'show'}
                                </button>
                            </div>
                            {visibleDimensions && (
                                <BarChart data={reasoningBars} max={5} />
                            )}
                        </div>
                    )}
                </div>
                </ErrorBoundary>
            )}

            {/* Flagged for review */}
            {flagged.length > 0 && (
                <div className="bg-amber-500/[0.04] border border-amber-500/20 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-amber-300 uppercase tracking-widest">
                            Flagged for review
                            <span className="text-amber-200/60 font-normal"> · {flagged.length}</span>
                        </h4>
                        <span className="text-[10px] text-slate-500">low confidence · score disagreement · thin evidence</span>
                    </div>
                    <ul className="space-y-2">
                        {flagged.map((s) => (
                            <li
                                key={s.id}
                                className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-2.5 ${onSelectSubmission ? 'cursor-pointer hover:border-amber-500/40' : ''}`}
                                onClick={() => onSelectSubmission?.(s)}
                            >
                                <div className="min-w-0">
                                    <span className="text-sm text-slate-200 font-medium">{s.studentName}</span>
                                    <span className="text-xs text-slate-500"> · {s.courseName}</span>
                                </div>
                                <p className="text-xs text-amber-200/80 sm:text-right sm:max-w-[60%] truncate">
                                    {(s.reviewReasons ?? []).join('; ') || 'Needs a human look'}
                                </p>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Per-student table */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        Per-student breakdown
                    </h4>
                    <span className="text-[10px] text-slate-500">click headers to sort</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-950/40 text-xs text-slate-400 uppercase tracking-widest">
                            <tr>
                                <TableHeader label="Student" active={sortKey === 'name'} dir={sortDir} onClick={() => toggleSort('name')} />
                                <TableHeader label="Course" />
                                <TableHeader label="Score" active={sortKey === 'score'} dir={sortDir} onClick={() => toggleSort('score')} align="right" />
                                <TableHeader label="Reasoning" active={sortKey === 'reasoning'} dir={sortDir} onClick={() => toggleSort('reasoning')} align="right" />
                                <TableHeader label="Confidence" active={sortKey === 'confidence'} dir={sortDir} onClick={() => toggleSort('confidence')} align="right" />
                                <TableHeader label="Turns" active={sortKey === 'turns'} dir={sortDir} onClick={() => toggleSort('turns')} align="right" />
                                <TableHeader label="Barge-ins" align="right" />
                                <TableHeader label="When" active={sortKey === 'time'} dir={sortDir} onClick={() => toggleSort('time')} align="right" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {sortedTable.map((s) => {
                                const reasoning = s.reasoningRubric?.overallReasoningScore;
                                const turns = s.latencyMetrics?.turnCount ?? 0;
                                const bargeIns = s.bargeInEvents?.length ?? 0;
                                return (
                                    <tr
                                        key={s.id}
                                        className={`hover:bg-slate-800/30 ${onSelectSubmission ? 'cursor-pointer' : ''}`}
                                        onClick={() => onSelectSubmission?.(s)}
                                    >
                                        <td className="px-4 py-2 text-slate-200">
                                            <span className="inline-flex items-center gap-1.5">
                                                {s.needsReview && !s.instructorReview && (
                                                    <span
                                                        className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400"
                                                        title={(s.reviewReasons ?? []).join('; ') || 'Flagged for review'}
                                                        aria-label="Flagged for review"
                                                    />
                                                )}
                                                {s.instructorReview && (
                                                    <span
                                                        className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
                                                        title={`Reviewed (${s.instructorReview.status})`}
                                                        aria-label="Reviewed"
                                                    />
                                                )}
                                                {s.studentName}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-slate-500 truncate max-w-[16ch]">{s.courseName}</td>
                                        <td className="px-4 py-2 text-right tabular-nums text-slate-100">{s.score}%</td>
                                        <td className="px-4 py-2 text-right tabular-nums text-slate-300">
                                            {reasoning == null ? '—' : reasoning.toFixed(0)}
                                        </td>
                                        <td className="px-4 py-2 text-right tabular-nums text-slate-400">
                                            {s.confidenceScore == null ? '—' : `${(s.confidenceScore * 100).toFixed(0)}%`}
                                        </td>
                                        <td className="px-4 py-2 text-right tabular-nums text-slate-400">{turns || '—'}</td>
                                        <td className="px-4 py-2 text-right tabular-nums text-slate-400">{bargeIns || '—'}</td>
                                        <td className="px-4 py-2 text-right text-[11px] text-slate-500 tabular-nums">
                                            {new Date(s.timestamp).toLocaleDateString()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

interface TableHeaderProps {
    label: string;
    active?: boolean;
    dir?: 'asc' | 'desc';
    onClick?: () => void;
    align?: 'left' | 'right';
}

const TableHeader: React.FC<TableHeaderProps> = ({
    label,
    active,
    dir,
    onClick,
    align = 'left',
}) => {
    const baseAlign = align === 'right' ? 'text-right' : 'text-left';
    const cursor = onClick ? 'cursor-pointer hover:text-slate-200' : '';
    const activeCls = active ? 'text-indigo-300' : '';
    return (
        <th
            scope="col"
            onClick={onClick}
            className={`px-4 py-3 font-bold ${baseAlign} ${cursor} ${activeCls}`}
        >
            {label}
            {active && <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>}
        </th>
    );
};

export default ClassAnalyticsView;
