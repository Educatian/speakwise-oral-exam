import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArgumentGraph, InstructorReview, InstructorReviewStatus, Submission, SubmissionAnnotation, SubmissionAnnotationCategory } from '../../types';
import { Modal, Button, ArgumentMapView } from '../ui';
import { ArgumentGraphBuilder } from '../../lib/reasoning';
import { generateConceptNetwork } from '../../lib/reasoning/conceptNetwork';
import { GroupKnowledgeService } from '../../lib/services/GroupKnowledgeService';
import { getMasteryLevel } from '../../lib/utils/scoreDisplay';
import { createSubmissionAnnotation, subscribeToSubmissionAnnotationsRealtime } from '../../lib/supabase';
import { SubmissionAnalyticsSection } from './SubmissionAnalyticsPanels';

interface SubmissionDetailModalProps {
    submission: Submission | null;
    peerSubmissions?: Submission[];
    canEditReview?: boolean;
    currentReviewerName?: string;
    currentReviewerEmail?: string;
    onUpdateReview?: (submissionId: string, review: InstructorReview) => Promise<void> | void;
    onClose: () => void;
}

const REVIEW_STATUS_LABELS: Record<InstructorReviewStatus, string> = {
    pending: 'Pending review',
    validated: 'Validated',
    overridden: 'Score overridden'
};

const ANNOTATION_COLORS: Record<SubmissionAnnotationCategory, string> = {
    strength: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    concern: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    evidence: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200',
    follow_up: 'border-amber-500/30 bg-amber-500/10 text-amber-100'
};

export const SubmissionDetailModal: React.FC<SubmissionDetailModalProps> = ({
    submission,
    peerSubmissions,
    canEditReview = false,
    currentReviewerName,
    currentReviewerEmail,
    onUpdateReview,
    onClose
}) => {
    const [argumentGraph, setArgumentGraph] = useState<ArgumentGraph | null>(null);
    const [graphLoading, setGraphLoading] = useState(false);
    const [reviewDraft, setReviewDraft] = useState<InstructorReview | null>(null);
    const [isSavingReview, setIsSavingReview] = useState(false);
    const [activeTranscriptIndex, setActiveTranscriptIndex] = useState<number | null>(null);
    const [highlightedTranscriptIndices, setHighlightedTranscriptIndices] = useState<number[]>([]);
    const [annotations, setAnnotations] = useState<SubmissionAnnotation[]>([]);
    const [annotationDraft, setAnnotationDraft] = useState('');
    const [annotationCategory, setAnnotationCategory] = useState<SubmissionAnnotationCategory>('evidence');
    const [annotationTurnIndex, setAnnotationTurnIndex] = useState<number | null>(null);
    const [isSavingAnnotation, setIsSavingAnnotation] = useState(false);
    const transcriptRefs = useRef<Record<number, HTMLDivElement | null>>({});

    // Flatten all rubric-evidence quotes so the concept map can highlight the
    // concepts the scorer actually cited (map → grade traceability).
    const evidenceQuotes: string[] = submission?.rubricBreakdown
        ? (Object.values(submission.rubricBreakdown) as Array<{ evidence?: string[] }>).flatMap((d) => d?.evidence ?? [])
        : [];

    useEffect(() => {
        if (!submission) {
            setArgumentGraph(null);
            return;
        }

        if (submission.argumentGraph && submission.argumentGraph.nodes.length > 0 && submission.argumentGraph.edges.length > 0) {
            setArgumentGraph(submission.argumentGraph);
            return;
        }

        if (submission.transcript && submission.transcript.length > 0) {
            setGraphLoading(true);
            generateConceptNetwork(submission.transcript)
                .then((graph) => {
                    setArgumentGraph(graph);
                    setGraphLoading(false);
                })
                .catch((error) => {
                    console.error('[SubmissionDetail] Concept network generation failed:', error);
                    const builder = new ArgumentGraphBuilder();
                    let lastQuestionId: string | undefined;
                    submission.transcript.forEach((item) => {
                        if (item.speaker === 'interviewer') {
                            if (item.text.includes('?')) {
                                lastQuestionId = builder.addQuestion(item.text, item.timestamp);
                            }
                        } else {
                            builder.processUserUtterance(item.text, item.timestamp, lastQuestionId);
                        }
                    });
                    setArgumentGraph(builder.getGraph());
                    setGraphLoading(false);
                });
        }
    }, [submission]);

    useEffect(() => {
        if (!submission) {
            setReviewDraft(null);
            setAnnotations([]);
            return;
        }

        setReviewDraft(
            submission.instructorReview || {
                status: 'pending',
                reviewerName: currentReviewerName || 'Instructor',
                reviewerEmail: currentReviewerEmail,
                reviewedAt: Date.now(),
                overrideScore: null,
                notes: ''
            }
        );
        setActiveTranscriptIndex(null);
        setHighlightedTranscriptIndices([]);
        setAnnotationTurnIndex(null);
        setAnnotationDraft('');
    }, [submission, currentReviewerEmail, currentReviewerName]);

    useEffect(() => {
        if (!submission) return;
        return subscribeToSubmissionAnnotationsRealtime(submission.id, (loadedAnnotations) => {
            setAnnotations(loadedAnnotations);
        });
    }, [submission]);

    const peerData = useMemo(() => {
        if (!submission || !peerSubmissions || peerSubmissions.length === 0) {
            return null;
        }
        return GroupKnowledgeService.getPeerClaims([submission, ...peerSubmissions], submission.studentName);
    }, [peerSubmissions, submission]);

    useEffect(() => {
        const targetIndex = activeTranscriptIndex ?? highlightedTranscriptIndices[0];
        if (targetIndex == null) return;

        const target = transcriptRefs.current[targetIndex];
        if (!target) return;

        target.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
        target.focus({ preventScroll: true });
    }, [activeTranscriptIndex, highlightedTranscriptIndices]);

    if (!submission) return null;

    const mastery = getMasteryLevel(submission.score);
    const reviewedScore = submission.instructorReview?.overrideScore ?? null;
    const displayScore = reviewedScore ?? submission.score;
    const scoreDelta = reviewedScore == null ? 0 : reviewedScore - submission.score;

    const handleSaveReview = async () => {
        if (!submission || !reviewDraft || !onUpdateReview) return;

        const normalizedReview: InstructorReview = {
            ...reviewDraft,
            reviewerName: reviewDraft.reviewerName || currentReviewerName || 'Instructor',
            reviewerEmail: reviewDraft.reviewerEmail || currentReviewerEmail,
            reviewedAt: Date.now(),
            overrideScore:
                reviewDraft.status === 'overridden'
                    ? Math.max(0, Math.min(100, Number(reviewDraft.overrideScore ?? submission.score)))
                    : null
        };

        setIsSavingReview(true);
        try {
            await onUpdateReview(submission.id, normalizedReview);
        } finally {
            setIsSavingReview(false);
        }
    };

    const evidenceTrail = useMemo(() => {
        if (!submission) return [];

        const evidencePool = [
            ...(submission.rubricBreakdown?.conceptualUnderstanding.evidence || []),
            ...(submission.rubricBreakdown?.communicationClarity.evidence || []),
            ...(submission.rubricBreakdown?.criticalThinking.evidence || []),
            ...(submission.rubricBreakdown?.engagement.evidence || []),
            ...(submission.reasoningRubric?.explicitJustification.examples || []),
            ...(submission.reasoningRubric?.abstractionGeneralization.instances || [])
        ];

        const uniqueEvidence = Array.from(new Set(evidencePool.map((item) => item.trim()).filter(Boolean))).slice(0, 8);
        return uniqueEvidence.map((snippet) => {
            const normalizedSnippet = snippet.toLowerCase();
            const matchingTurnIndex = submission.transcript.findIndex((turn) =>
                turn.text.toLowerCase().includes(normalizedSnippet) ||
                normalizedSnippet.includes(turn.text.toLowerCase().slice(0, Math.min(turn.text.length, 48)))
            );

            return {
                snippet,
                matchingTurnIndex: matchingTurnIndex >= 0 ? matchingTurnIndex : null
            };
        });
    }, [submission]);

    const selectedTurnAnnotations = useMemo(() => {
        if (activeTranscriptIndex == null) return [];
        return annotations.filter((annotation) => annotation.transcriptIndex === activeTranscriptIndex);
    }, [activeTranscriptIndex, annotations]);

    const handleSaveAnnotation = async () => {
        if (!submission || annotationTurnIndex == null || !annotationDraft.trim()) return;

        const annotation: SubmissionAnnotation = {
            id: `annotation_${Math.random().toString(36).slice(2, 9)}`,
            submissionId: submission.id,
            transcriptIndex: annotationTurnIndex,
            category: annotationCategory,
            note: annotationDraft.trim(),
            authorName: currentReviewerName || 'Instructor',
            authorEmail: currentReviewerEmail,
            createdAt: Date.now()
        };

        setIsSavingAnnotation(true);
        try {
            await createSubmissionAnnotation(annotation);
            setAnnotationDraft('');
        } finally {
            setIsSavingAnnotation(false);
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={submission.studentName}
            subtitle={submission.courseName || 'Classroom Interview'}
            size="lg"
        >
            <div className="space-y-6">
                <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between bg-slate-900/50 p-6 rounded-2xl border border-slate-800 gap-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-4 flex-wrap">
                            <div className={`text-4xl font-black ${getMasteryLevel(displayScore).color}`}>
                                {getMasteryLevel(displayScore).emoji} {displayScore}%
                            </div>
                            <div className={`text-sm font-bold px-3 py-1 rounded-lg ${mastery.bgColor} ${mastery.color}`}>
                                {getMasteryLevel(displayScore).label}
                            </div>
                            {submission.instructorReview && (
                                <div className="px-3 py-1 rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-300 text-xs font-semibold">
                                    {REVIEW_STATUS_LABELS[submission.instructorReview.status]}
                                </div>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                            <span>AI score: {submission.score}%</span>
                            {reviewedScore != null && (
                                <span>
                                    Final reviewed score: {reviewedScore}%
                                    {scoreDelta !== 0 && ` (${scoreDelta > 0 ? '+' : ''}${scoreDelta})`}
                                </span>
                            )}
                            <span>{submission.transcript.length} transcript turns</span>
                        </div>
                    </div>
                    <div className="text-left xl:text-right">
                        <h4 className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-1">
                            Session date
                        </h4>
                        <p className="text-slate-300 font-medium">
                            <time dateTime={new Date(submission.timestamp).toISOString()}>
                                {new Date(submission.timestamp).toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </time>
                        </p>
                    </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div>
                            <h4 className="text-slate-200 font-semibold">Instructor review</h4>
                            <p className="text-sm text-slate-500 mt-1">
                                Validate the AI result or override the final score with instructor notes.
                            </p>
                        </div>
                        {submission.instructorReview && (
                            <div className="text-xs text-slate-500">
                                Reviewed by {submission.instructorReview.reviewerName} on{' '}
                                {new Date(submission.instructorReview.reviewedAt).toLocaleDateString()}
                            </div>
                        )}
                    </div>

                    {reviewDraft && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="space-y-4">
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Review status</span>
                                    <select
                                        value={reviewDraft.status}
                                        disabled={!canEditReview || !onUpdateReview}
                                        onChange={(event) => setReviewDraft((current) => current ? {
                                            ...current,
                                            status: event.target.value as InstructorReviewStatus,
                                            overrideScore: event.target.value === 'overridden'
                                                ? (current.overrideScore ?? submission.score)
                                                : null
                                        } : current)}
                                        className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                                    >
                                        <option value="pending">Pending review</option>
                                        <option value="validated">Validated AI score</option>
                                        <option value="overridden">Override final score</option>
                                    </select>
                                </label>

                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Final score</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        disabled={!canEditReview || !onUpdateReview || reviewDraft.status !== 'overridden'}
                                        value={reviewDraft.status === 'overridden' ? (reviewDraft.overrideScore ?? submission.score) : submission.score}
                                        onChange={(event) => setReviewDraft((current) => current ? {
                                            ...current,
                                            overrideScore: Number(event.target.value)
                                        } : current)}
                                        className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
                                    />
                                    <p className="mt-2 text-xs text-slate-500">
                                        Use override only when the AI score needs adjustment after review.
                                    </p>
                                </label>
                            </div>

                            <div className="space-y-4">
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Instructor notes</span>
                                    <textarea
                                        value={reviewDraft.notes || ''}
                                        disabled={!canEditReview || !onUpdateReview}
                                        onChange={(event) => setReviewDraft((current) => current ? {
                                            ...current,
                                            notes: event.target.value
                                        } : current)}
                                        rows={6}
                                        placeholder="Capture why the score was validated or adjusted, plus next teaching actions."
                                        className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
                                    />
                                </label>

                                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
                                    <p className="font-medium text-slate-300 mb-2">Review guidance</p>
                                    <p>Confirm the AI score when it matches your judgment, or override it when evidence in the transcript suggests a more accurate final evaluation.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {canEditReview && onUpdateReview ? (
                        <div className="flex justify-end">
                            <Button onClick={handleSaveReview} disabled={isSavingReview}>
                                {isSavingReview ? 'Saving review...' : 'Save instructor review'}
                            </Button>
                        </div>
                    ) : submission.instructorReview?.notes ? (
                        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                            <p className="text-xs uppercase tracking-wide text-indigo-300 font-semibold mb-2">Instructor notes</p>
                            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{submission.instructorReview.notes}</p>
                        </div>
                    ) : null}
                </div>

                <div className="bg-indigo-500/5 border border-indigo-500/20 p-6 rounded-2xl">
                    <div className="flex items-center gap-2 mb-3">
                        <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        <h4 className="text-indigo-400 font-bold text-sm uppercase">AI feedback</h4>
                    </div>
                    <p className="text-slate-300 text-sm leading-relaxed italic">
                        "{submission.feedback}"
                    </p>
                    {typeof submission.confidenceScore === 'number' && (
                        <div className="mt-3 pt-3 border-t border-indigo-500/20 flex items-center justify-between text-xs">
                            <span className="text-slate-500 uppercase tracking-widest">AI Confidence</span>
                            <span className="text-indigo-300 font-bold tabular-nums">
                                {(submission.confidenceScore * 100).toFixed(0)}%
                            </span>
                        </div>
                    )}
                    {submission.confidenceRationale && (
                        <p className="text-slate-500 text-xs mt-2 italic">
                            {submission.confidenceRationale}
                        </p>
                    )}
                </div>

                {/* Analytics panels — rubric radar, reasoning bars, timing,
                     barge-in list. Complements the integrated workspace below
                     by rendering the dimensions those panels don't visualize. */}
                <SubmissionAnalyticsSection submission={submission} />

                <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div>
                            <h4 className="text-slate-200 font-semibold">Speech capture archive</h4>
                            <p className="text-sm text-slate-500 mt-1">Raw turn captures are stored separately from the final transcript so failed or very short turns can still be audited.</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                            <span>{submission.rawTranscriptTurns?.length || 0} raw turn{(submission.rawTranscriptTurns?.length || 0) !== 1 ? 's' : ''}</span>
                            <span>{submission.failedTranscriptions?.length || 0} queued failure{(submission.failedTranscriptions?.length || 0) !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-3 max-h-[280px] overflow-y-auto custom-scrollbar">
                            {(submission.rawTranscriptTurns?.length || 0) === 0 ? (
                                <p className="text-sm text-slate-500">No raw capture turns were preserved for this submission.</p>
                            ) : (
                                submission.rawTranscriptTurns!.map((turn, index) => (
                                    <div key={turn.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-500">Raw turn {index + 1}</span>
                                            <span className={`text-[10px] uppercase tracking-[0.18em] font-bold ${
                                                turn.status === 'transcribed'
                                                    ? 'text-emerald-300'
                                                    : turn.status === 'failed'
                                                        ? 'text-rose-300'
                                                        : 'text-amber-300'
                                            }`}>
                                                {turn.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 mt-2">
                                            <span>{turn.durationMs}ms</span>
                                            <span>{turn.sampleCount} samples</span>
                                            {turn.latency != null && <span>Latency {turn.latency}ms</span>}
                                        </div>
                                        <p className="text-xs text-slate-400 mt-2 break-all">
                                            {turn.transcriptText || turn.error || 'Awaiting review'}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-3 max-h-[280px] overflow-y-auto custom-scrollbar">
                            {(submission.failedTranscriptions?.length || 0) === 0 ? (
                                <p className="text-sm text-slate-500">No failed or short transcription turns were queued.</p>
                            ) : (
                                submission.failedTranscriptions!.map((turn) => (
                                    <div key={`failed-${turn.id}`} className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-rose-200">
                                                {turn.status === 'too_short' ? 'Too short' : 'Failed transcription'}
                                            </span>
                                            <span className="text-[10px] text-rose-200">{turn.durationMs}ms</span>
                                        </div>
                                        <p className="text-sm text-rose-100 mt-2 leading-relaxed">
                                            {turn.error || 'No error detail was stored.'}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div>
                            <h4 className="text-slate-200 font-semibold">Integrated analysis workspace</h4>
                            <p className="text-sm text-slate-500 mt-1">Navigate the argument map, jump to transcript evidence, and anchor annotations without leaving the same review surface.</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                            <span>{argumentGraph?.nodes.length || 0} concepts</span>
                            <span>{annotations.length} annotations</span>
                            <span>{submission.failedTranscriptions?.length || 0} failed capture{(submission.failedTranscriptions?.length || 0) !== 1 ? 's' : ''}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                            {graphLoading ? (
                                <div className="text-center py-10">
                                    <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin mx-auto mb-3" />
                                    <p className="text-slate-400 text-sm font-medium">Analyzing concept network...</p>
                                </div>
                            ) : argumentGraph && argumentGraph.nodes.length > 0 ? (
                                <ArgumentMapView
                                    graph={argumentGraph}
                                    transcript={submission.transcript}
                                    activeTurnIndex={activeTranscriptIndex}
                                    onActiveTurnIndexChange={setActiveTranscriptIndex}
                                    onHighlightTurnsChange={setHighlightedTranscriptIndices}
                                    storageKey={submission.id}
                                    evidenceQuotes={evidenceQuotes}
                                />
                            ) : (
                                <div className="text-center py-8 text-slate-500">
                                    <p className="text-sm">No concept network is available for this session.</p>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-3 max-h-[360px] overflow-y-auto custom-scrollbar">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Focused transcript</p>
                                        <p className="text-xs text-slate-600 mt-1">Select a turn from the map, evidence list, or transcript to inspect its annotations.</p>
                                    </div>
                                    <span className="text-[11px] text-slate-500">
                                        {activeTranscriptIndex != null ? `Turn ${activeTranscriptIndex + 1}` : 'No turn selected'}
                                    </span>
                                </div>
                                {submission.transcript.map((turn, index) => (
                                    <button
                                        key={`analysis-turn-${turn.timestamp}-${index}`}
                                        type="button"
                                        onClick={() => setActiveTranscriptIndex(index)}
                                        className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                                            activeTranscriptIndex === index
                                                ? 'border-emerald-500/40 bg-emerald-500/10'
                                                : highlightedTranscriptIndices.includes(index)
                                                    ? 'border-indigo-500/30 bg-indigo-500/10'
                                                    : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span className={`text-[10px] uppercase tracking-[0.18em] font-bold ${turn.speaker === 'user' ? 'text-indigo-300' : 'text-emerald-300'}`}>
                                                {turn.speaker === 'user' ? 'Student' : 'AI interviewer'}
                                            </span>
                                            <span className="text-[10px] text-slate-500">Turn {index + 1}</span>
                                        </div>
                                        <p className="text-sm text-slate-200 leading-relaxed mt-2">{turn.text}</p>
                                        <div className="flex flex-wrap items-center gap-2 mt-3">
                                            {annotations
                                                .filter((annotation) => annotation.transcriptIndex === index)
                                                .map((annotation) => (
                                                    <span
                                                        key={`analysis-annotation-${annotation.id}`}
                                                        className={`px-2 py-1 rounded-full text-[10px] border ${ANNOTATION_COLORS[annotation.category]}`}
                                                    >
                                                        {annotation.category.replace('_', ' ')}
                                                    </span>
                                                ))}
                                            {canEditReview && (
                                                <span className="px-2 py-1 rounded-full text-[10px] border border-slate-700 bg-slate-950/50 text-slate-400">
                                                    Click to annotate
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Annotation context</p>
                                        <p className="text-xs text-slate-600 mt-1">Reviewer evidence tied to the active transcript turn.</p>
                                    </div>
                                    <span className="text-[11px] text-slate-500">
                                        {selectedTurnAnnotations.length} note{selectedTurnAnnotations.length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                {selectedTurnAnnotations.length === 0 ? (
                                    <p className="text-sm text-slate-500">No annotations are attached to the selected turn yet.</p>
                                ) : (
                                    selectedTurnAnnotations.map((annotation) => (
                                        <div key={`selected-${annotation.id}`} className={`rounded-2xl border px-4 py-3 ${ANNOTATION_COLORS[annotation.category]}`}>
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="text-[10px] uppercase tracking-[0.18em] font-bold">{annotation.category.replace('_', ' ')}</span>
                                                <span className="text-[10px] opacity-70">{annotation.authorName}</span>
                                            </div>
                                            <p className="text-sm mt-2 leading-relaxed">{annotation.note}</p>
                                        </div>
                                    ))
                                )}
                                {canEditReview && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (activeTranscriptIndex != null) {
                                                setAnnotationTurnIndex(activeTranscriptIndex);
                                            }
                                        }}
                                        className="w-full rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-200 hover:border-indigo-500/40"
                                    >
                                        {activeTranscriptIndex != null
                                            ? `Prepare annotation for turn ${activeTranscriptIndex + 1}`
                                            : 'Select a transcript turn to start annotating'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {evidenceTrail.length > 0 && (
                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <div>
                                <h4 className="text-slate-300 font-semibold">Evidence trail</h4>
                                <p className="text-sm text-slate-500 mt-1">Quick links to transcript evidence that shaped the current scoring model.</p>
                            </div>
                            <span className="text-xs text-slate-600">{evidenceTrail.length} reference{evidenceTrail.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="space-y-2">
                            {evidenceTrail.map((item, index) => (
                                <button
                                    key={`${item.snippet}-${index}`}
                                    type="button"
                                    onClick={() => {
                                        if (item.matchingTurnIndex != null) {
                                            setActiveTranscriptIndex(item.matchingTurnIndex);
                                        }
                                    }}
                                    className="w-full rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-left hover:border-indigo-500/30 transition-colors"
                                >
                                    <p className="text-sm text-slate-200 leading-relaxed">{item.snippet}</p>
                                    <p className="text-[11px] text-slate-500 mt-2">
                                        {item.matchingTurnIndex != null ? `Jump to transcript turn ${item.matchingTurnIndex + 1}` : 'No exact transcript turn match was found'}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Argument Map fallback — shown when the integrated workspace
                    above doesn't have a graph. Kept for parity with legacy
                    submissions that only have the minimal ArgumentGraph. */}
                <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
                    {graphLoading ? (
                        <div className="text-center py-10">
                            <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-slate-400 text-sm font-medium">Analyzing concept network...</p>
                            <p className="text-xs text-slate-600 mt-1">The model is reconstructing semantic relationships from the conversation.</p>
                        </div>
                    ) : argumentGraph && argumentGraph.nodes.length > 0 ? (
                        <ArgumentMapView
                            graph={argumentGraph}
                            transcript={submission.transcript}
                            activeTurnIndex={activeTranscriptIndex}
                            onActiveTurnIndexChange={setActiveTranscriptIndex}
                            onHighlightTurnsChange={setHighlightedTranscriptIndices}
                            storageKey={submission.id}
                            evidenceQuotes={evidenceQuotes}
                        />
                    ) : (
                        <div className="text-center py-6 text-slate-500">
                            <h4 className="text-slate-400 font-bold text-sm mb-1">Concept network</h4>
                            <p className="text-xs">No concept network is available for this session.</p>
                        </div>
                    )}
                </div>

                {submission.reasoningRubric && (
                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-slate-400 font-bold text-xs uppercase tracking-widest">
                                Argumentative reasoning analysis
                            </h4>
                            <span className="text-lg font-black text-indigo-400">
                                {submission.reasoningRubric.overallReasoningScore}%
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {[
                                { label: 'Justification', score: submission.reasoningRubric.explicitJustification.score, hint: `${submission.reasoningRubric.explicitJustification.count} evidence-based statements` },
                                { label: 'Causal reasoning', score: submission.reasoningRubric.causalExplanation.score, hint: `${submission.reasoningRubric.causalExplanation.patterns.length} causal markers found` },
                                { label: 'Counter-argument handling', score: submission.reasoningRubric.counterArgumentHandling.score, hint: `${submission.reasoningRubric.counterArgumentHandling.attempts} rebuttal attempts` },
                                { label: 'Abstraction', score: submission.reasoningRubric.abstractionGeneralization.score, hint: `${submission.reasoningRubric.abstractionGeneralization.instances.length} generalization attempts` }
                            ].map((item) => (
                                <div key={item.label} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-semibold text-slate-200">{item.label}</span>
                                        <span className="text-sm font-black text-indigo-300">{item.score}/5</span>
                                    </div>
                                    <div className="w-full bg-slate-700 rounded-full h-1.5">
                                        <div
                                            className="h-1.5 rounded-full bg-indigo-400 transition-all duration-500"
                                            style={{ width: `${(item.score / 5) * 100}%` }}
                                        />
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-2">{item.hint}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div>
                            <h4 className="text-slate-300 font-semibold">Transcript annotations</h4>
                            <p className="text-sm text-slate-500 mt-1">Anchor evidence, flag concerns, and leave follow-up cues directly on specific turns.</p>
                        </div>
                        <div className="text-xs text-slate-500">
                            {annotations.length} saved annotation{annotations.length !== 1 ? 's' : ''}
                        </div>
                    </div>

                    {(canEditReview || annotations.length > 0) && (
                        <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_minmax(0,1fr)] gap-4">
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                                <label className="block">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Annotation type</span>
                                    <select
                                        value={annotationCategory}
                                        disabled={!canEditReview}
                                        onChange={(event) => setAnnotationCategory(event.target.value as SubmissionAnnotationCategory)}
                                        className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60"
                                    >
                                        <option value="evidence">Evidence</option>
                                        <option value="strength">Strength</option>
                                        <option value="concern">Concern</option>
                                        <option value="follow_up">Follow up</option>
                                    </select>
                                </label>
                                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">
                                    {annotationTurnIndex == null
                                        ? 'Select a transcript turn to anchor a new annotation.'
                                        : `Preparing an annotation for transcript turn ${annotationTurnIndex + 1}.`}
                                </div>
                                <textarea
                                    value={annotationDraft}
                                    disabled={!canEditReview}
                                    onChange={(event) => setAnnotationDraft(event.target.value)}
                                    rows={4}
                                    placeholder="Add evidence, a scoring rationale, or a follow-up teaching note."
                                    className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60"
                                />
                                {canEditReview && (
                                    <div className="flex justify-end">
                                        <Button onClick={handleSaveAnnotation} disabled={annotationTurnIndex == null || !annotationDraft.trim() || isSavingAnnotation}>
                                            {isSavingAnnotation ? 'Saving annotation...' : 'Save annotation'}
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-3 max-h-[320px] overflow-y-auto custom-scrollbar">
                                {annotations.length === 0 ? (
                                    <p className="text-sm text-slate-500">No annotations yet. Add reviewer evidence to build a stronger grading trail.</p>
                                ) : (
                                    annotations.map((annotation) => (
                                        <button
                                            key={annotation.id}
                                            type="button"
                                            onClick={() => setActiveTranscriptIndex(annotation.transcriptIndex)}
                                            className={`w-full rounded-2xl border px-4 py-3 text-left ${ANNOTATION_COLORS[annotation.category]}`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="text-[10px] uppercase tracking-[0.18em] font-bold">
                                                    {annotation.category.replace('_', ' ')} • Turn {annotation.transcriptIndex + 1}
                                                </span>
                                                <span className="text-[10px] opacity-70">
                                                    {new Date(annotation.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                            <p className="text-sm mt-2 leading-relaxed">{annotation.note}</p>
                                            <p className="text-[11px] mt-2 opacity-70">By {annotation.authorName}</p>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <h4 className="text-slate-500 font-bold text-xs uppercase tracking-widest">
                        Full conversation transcript
                    </h4>

                    <div className="space-y-3 max-h-[40vh] overflow-y-auto custom-scrollbar pr-2">
                        {submission.transcript.map((turn, index) => (
                            <div
                                key={`${turn.timestamp}-${index}`}
                                ref={(element) => {
                                    transcriptRefs.current[index] = element;
                                }}
                                tabIndex={-1}
                                className={`flex gap-3 cursor-pointer ${turn.speaker === 'user' ? 'flex-row-reverse' : ''}`}
                                onClick={() => setActiveTranscriptIndex(index)}
                            >
                                <div
                                    className={`text-[10px] font-bold uppercase mt-1 flex-shrink-0 w-16 ${turn.speaker === 'user' ? 'text-indigo-400 text-right' : 'text-emerald-400'
                                        }`}
                                >
                                    {turn.speaker === 'user' ? 'Student' : 'AI'}
                                </div>
                                <div className="flex-1 space-y-2">
                                    <div
                                        className={`px-4 py-3 rounded-xl text-sm ${turn.speaker === 'user'
                                            ? 'bg-indigo-600/20 text-indigo-100 rounded-tr-sm'
                                            : 'bg-slate-800 text-slate-300 rounded-tl-sm'
                                            } ${activeTranscriptIndex === index
                                                ? 'ring-2 ring-emerald-400/70 shadow-lg shadow-emerald-500/10'
                                                : highlightedTranscriptIndices.includes(index)
                                                    ? 'ring-1 ring-indigo-400/60 shadow-md shadow-indigo-500/10'
                                                    : ''
                                            } transition-all duration-300 outline-none`}
                                    >
                                        {turn.text}
                                    </div>
                                    <div className={`flex flex-wrap items-center gap-2 ${turn.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        {annotations
                                            .filter((annotation) => annotation.transcriptIndex === index)
                                            .map((annotation) => (
                                                <button
                                                    key={annotation.id}
                                                    type="button"
                                                    onClick={() => setActiveTranscriptIndex(index)}
                                                    className={`px-2 py-1 rounded-full text-[10px] border ${ANNOTATION_COLORS[annotation.category]}`}
                                                >
                                                    {annotation.category.replace('_', ' ')}
                                                </button>
                                            ))}
                                        {canEditReview && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setAnnotationTurnIndex(index);
                                                    setActiveTranscriptIndex(index);
                                                }}
                                                className="px-2 py-1 rounded-full text-[10px] border border-slate-700 bg-slate-950/50 text-slate-400 hover:text-white hover:border-indigo-500/30"
                                            >
                                                Annotate turn
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {peerData && (peerData.shared.length > 0 || peerData.unique.length > 0) && (
                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
                        <h4 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-3">
                            Peer perspectives
                        </h4>
                        {peerData.shared.length > 0 && (
                            <div className="mb-4">
                                <p className="text-xs text-emerald-500 font-medium mb-2">Shared ideas</p>
                                <div className="space-y-2">
                                    {peerData.shared.map((item, index) => (
                                        <div key={index} className="flex items-start gap-2 text-sm">
                                            <span className="flex-shrink-0 px-1.5 py-0.5 bg-emerald-500/20 rounded text-xs text-emerald-400">{item.count + 1}</span>
                                            <span className="text-slate-400">"{item.claim}"</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {peerData.unique.length > 0 && (
                            <div>
                                <p className="text-xs text-indigo-500 font-medium mb-2">Different perspectives</p>
                                <div className="space-y-2">
                                    {peerData.unique.map((item, index) => (
                                        <div key={index} className="flex items-start gap-2 text-sm">
                                            <span className="flex-shrink-0 px-1.5 py-0.5 bg-indigo-500/20 rounded text-xs text-indigo-400">{item.count}</span>
                                            <span className="text-slate-400">"{item.claim}"</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-end pt-4 border-t border-slate-800">
                    <Button variant="ghost" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default SubmissionDetailModal;
