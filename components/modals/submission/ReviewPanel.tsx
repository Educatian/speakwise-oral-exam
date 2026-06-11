import React from 'react';
import { InstructorReview, InstructorReviewStatus, Submission } from '../../../types';
import { Button } from '../../ui';

interface ReviewPanelProps {
    submission: Submission;
    reviewDraft: InstructorReview | null;
    setReviewDraft: React.Dispatch<React.SetStateAction<InstructorReview | null>>;
    canEditReview: boolean;
    /** Whether an onUpdateReview handler was supplied to the modal. */
    hasUpdateHandler: boolean;
    isSavingReview: boolean;
    onSaveReview: () => void;
}

/** Instructor review panel: status select, override score, notes, save action. */
export const ReviewPanel: React.FC<ReviewPanelProps> = ({
    submission,
    reviewDraft,
    setReviewDraft,
    canEditReview,
    hasUpdateHandler,
    isSavingReview,
    onSaveReview
}) => (
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
                            disabled={!canEditReview || !hasUpdateHandler}
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
                            disabled={!canEditReview || !hasUpdateHandler || reviewDraft.status !== 'overridden'}
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
                            disabled={!canEditReview || !hasUpdateHandler}
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

        {canEditReview && hasUpdateHandler ? (
            <div className="flex justify-end">
                <Button onClick={onSaveReview} disabled={isSavingReview}>
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
);
