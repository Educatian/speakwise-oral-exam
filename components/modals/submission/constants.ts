import { InstructorReviewStatus, SubmissionAnnotationCategory } from '../../../types';

export const REVIEW_STATUS_LABELS: Record<InstructorReviewStatus, string> = {
    pending: 'Pending review',
    validated: 'Validated',
    overridden: 'Score overridden'
};

export const ANNOTATION_COLORS: Record<SubmissionAnnotationCategory, string> = {
    strength: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    concern: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    evidence: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200',
    follow_up: 'border-amber-500/30 bg-amber-500/10 text-amber-100'
};
