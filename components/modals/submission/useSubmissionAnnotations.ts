import { useEffect, useMemo, useState } from 'react';
import { Submission, SubmissionAnnotation, SubmissionAnnotationCategory } from '../../../types';
import { createSubmissionAnnotation, subscribeToSubmissionAnnotationsRealtime } from '../../../lib/supabase';

interface UseSubmissionAnnotationsOptions {
    submission: Submission | null;
    currentReviewerName?: string;
    currentReviewerEmail?: string;
    activeTranscriptIndex: number | null;
}

/**
 * Annotation workflow state: real-time annotation sync, composer draft state,
 * and the save flow that preserves the draft when the server write fails.
 */
export const useSubmissionAnnotations = ({
    submission,
    currentReviewerName,
    currentReviewerEmail,
    activeTranscriptIndex
}: UseSubmissionAnnotationsOptions) => {
    const [annotations, setAnnotations] = useState<SubmissionAnnotation[]>([]);
    const [annotationDraft, setAnnotationDraft] = useState('');
    const [annotationCategory, setAnnotationCategory] = useState<SubmissionAnnotationCategory>('evidence');
    const [annotationTurnIndex, setAnnotationTurnIndex] = useState<number | null>(null);
    const [isSavingAnnotation, setIsSavingAnnotation] = useState(false);
    const [annotationError, setAnnotationError] = useState<string | null>(null);

    useEffect(() => {
        if (!submission) return;
        return subscribeToSubmissionAnnotationsRealtime(submission.id, (loadedAnnotations) => {
            setAnnotations(loadedAnnotations);
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
            setAnnotationError(null);
        } catch (error) {
            // createSubmissionAnnotation propagates server failures instead of
            // silently writing a local-only copy — keep the draft so nothing is
            // lost and tell the reviewer.
            console.error('Failed to save annotation:', error);
            setAnnotationError('The annotation could not be saved to the server. Your draft is kept — please try again.');
        } finally {
            setIsSavingAnnotation(false);
        }
    };

    return {
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
    };
};
