import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArgumentGraph, InstructorReview, InstructorReviewStatus, Submission } from '../../types';
import { Modal, Button, ArgumentMapView } from '../ui';
import { ArgumentGraphBuilder } from '../../lib/reasoning';
import { generateConceptNetwork } from '../../lib/reasoning/conceptNetwork';
import { GroupKnowledgeService } from '../../lib/services/GroupKnowledgeService';
import { getMasteryLevel } from '../../lib/utils/scoreDisplay';

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
    const transcriptRefs = useRef<Record<number, HTMLDivElement | null>>({});

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
    }, [submission, currentReviewerEmail, currentReviewerName]);

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
                </div>

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
                                <div
                                    className={`flex-1 px-4 py-3 rounded-xl text-sm ${turn.speaker === 'user'
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
