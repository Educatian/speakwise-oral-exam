import React, { useEffect, useMemo, useRef, useState } from 'react';
import { InstructorReview, Submission } from '../../types';
import { Modal, Button, ErrorBoundary } from '../ui';
import { GroupKnowledgeService } from '../../lib/services/GroupKnowledgeService';
import { buildEvidenceTrail, collectEvidenceQuotes } from '../../lib/utils/evidenceTrail';
import { SubmissionAnalyticsSection } from './SubmissionAnalyticsPanels';
import {
    AiFeedbackPanel,
    AnalysisWorkspace,
    AnnotationEditor,
    ConceptMapFallbackPanel,
    EvidenceTrailPanel,
    PeerPerspectivesPanel,
    ReasoningAnalysisPanel,
    ReviewPanel,
    ScoreSummaryHeader,
    SpeechCapturePanel,
    TranscriptPanel
} from './submission';
import { useSubmissionConceptGraph } from './submission/useSubmissionConceptGraph';
import { useSubmissionAnnotations } from './submission/useSubmissionAnnotations';

interface SubmissionDetailModalProps {
    submission: Submission | null;
    peerSubmissions?: Submission[];
    canEditReview?: boolean;
    currentReviewerName?: string;
    currentReviewerEmail?: string;
    onUpdateReview?: (submissionId: string, review: InstructorReview) => Promise<void> | void;
    onClose: () => void;
}

export const SubmissionDetailModal: React.FC<SubmissionDetailModalProps> = ({
    submission,
    peerSubmissions,
    canEditReview = false,
    currentReviewerName,
    currentReviewerEmail,
    onUpdateReview,
    onClose
}) => {
    const { argumentGraph, graphLoading } = useSubmissionConceptGraph(submission);
    const [reviewDraft, setReviewDraft] = useState<InstructorReview | null>(null);
    const [isSavingReview, setIsSavingReview] = useState(false);
    const [activeTranscriptIndex, setActiveTranscriptIndex] = useState<number | null>(null);
    const [highlightedTranscriptIndices, setHighlightedTranscriptIndices] = useState<number[]>([]);
    const {
        annotations,
        setAnnotations,
        annotationDraft,
        setAnnotationDraft,
        annotationCategory,
        setAnnotationCategory,
        annotationTurnIndex,
        setAnnotationTurnIndex,
        isSavingAnnotation,
        annotationError,
        selectedTurnAnnotations,
        handleSaveAnnotation
    } = useSubmissionAnnotations({ submission, currentReviewerName, currentReviewerEmail, activeTranscriptIndex });
    const transcriptRefs = useRef<Record<number, HTMLDivElement | null>>({});

    // Flatten all rubric-evidence quotes so the concept map can highlight the
    // concepts the scorer actually cited (map → grade traceability).
    const evidenceQuotes: string[] = collectEvidenceQuotes(submission);

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
    }, [submission, currentReviewerEmail, currentReviewerName, setAnnotations, setAnnotationTurnIndex, setAnnotationDraft]);

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

    const evidenceTrail = useMemo(() => (submission ? buildEvidenceTrail(submission) : []), [submission]);

    if (!submission) return null;

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

    const handleAnnotateTurn = (index: number) => {
        setAnnotationTurnIndex(index);
        setActiveTranscriptIndex(index);
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
                <ScoreSummaryHeader submission={submission} />

                <ReviewPanel
                    submission={submission}
                    reviewDraft={reviewDraft}
                    setReviewDraft={setReviewDraft}
                    canEditReview={canEditReview}
                    hasUpdateHandler={!!onUpdateReview}
                    isSavingReview={isSavingReview}
                    onSaveReview={handleSaveReview}
                />

                <AiFeedbackPanel submission={submission} />

                {/* Analytics panels — rubric radar, reasoning bars, timing,
                     barge-in list. Complements the integrated workspace below
                     by rendering the dimensions those panels don't visualize. */}
                <ErrorBoundary compact panelName="submission analytics">
                    <SubmissionAnalyticsSection submission={submission} />
                </ErrorBoundary>

                <SpeechCapturePanel submission={submission} />

                <AnalysisWorkspace
                    submission={submission}
                    argumentGraph={argumentGraph}
                    graphLoading={graphLoading}
                    evidenceQuotes={evidenceQuotes}
                    annotations={annotations}
                    selectedTurnAnnotations={selectedTurnAnnotations}
                    activeTranscriptIndex={activeTranscriptIndex}
                    highlightedTranscriptIndices={highlightedTranscriptIndices}
                    canEditReview={canEditReview}
                    setActiveTranscriptIndex={setActiveTranscriptIndex}
                    setHighlightedTranscriptIndices={setHighlightedTranscriptIndices}
                    setAnnotationTurnIndex={setAnnotationTurnIndex}
                />

                {evidenceTrail.length > 0 && (
                    <EvidenceTrailPanel evidenceTrail={evidenceTrail} onSelectTurn={setActiveTranscriptIndex} />
                )}

                <ConceptMapFallbackPanel
                    submission={submission}
                    argumentGraph={argumentGraph}
                    graphLoading={graphLoading}
                    evidenceQuotes={evidenceQuotes}
                    activeTranscriptIndex={activeTranscriptIndex}
                    setActiveTranscriptIndex={setActiveTranscriptIndex}
                    setHighlightedTranscriptIndices={setHighlightedTranscriptIndices}
                />

                {submission.reasoningRubric && (
                    <ReasoningAnalysisPanel reasoningRubric={submission.reasoningRubric} />
                )}

                <AnnotationEditor
                    annotations={annotations}
                    canEditReview={canEditReview}
                    annotationCategory={annotationCategory}
                    setAnnotationCategory={setAnnotationCategory}
                    annotationTurnIndex={annotationTurnIndex}
                    annotationDraft={annotationDraft}
                    setAnnotationDraft={setAnnotationDraft}
                    annotationError={annotationError}
                    isSavingAnnotation={isSavingAnnotation}
                    onSaveAnnotation={handleSaveAnnotation}
                    onSelectTurn={setActiveTranscriptIndex}
                />

                <TranscriptPanel
                    transcript={submission.transcript}
                    annotations={annotations}
                    canEditReview={canEditReview}
                    activeTranscriptIndex={activeTranscriptIndex}
                    highlightedTranscriptIndices={highlightedTranscriptIndices}
                    transcriptRefs={transcriptRefs}
                    onSelectTurn={setActiveTranscriptIndex}
                    onAnnotateTurn={handleAnnotateTurn}
                />

                {peerData && (peerData.shared.length > 0 || peerData.unique.length > 0) && (
                    <PeerPerspectivesPanel peerData={peerData} />
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
