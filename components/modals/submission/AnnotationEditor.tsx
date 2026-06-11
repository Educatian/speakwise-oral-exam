import React from 'react';
import { SubmissionAnnotation, SubmissionAnnotationCategory } from '../../../types';
import { Button } from '../../ui';
import { ANNOTATION_COLORS } from './constants';

interface AnnotationEditorProps {
    annotations: SubmissionAnnotation[];
    canEditReview: boolean;
    annotationCategory: SubmissionAnnotationCategory;
    setAnnotationCategory: (category: SubmissionAnnotationCategory) => void;
    annotationTurnIndex: number | null;
    annotationDraft: string;
    setAnnotationDraft: (draft: string) => void;
    annotationError: string | null;
    isSavingAnnotation: boolean;
    onSaveAnnotation: () => void;
    onSelectTurn: (index: number) => void;
}

/**
 * Transcript annotations section: annotation composer (category, anchored
 * turn, draft, error feedback, save) plus the saved-annotation list.
 */
export const AnnotationEditor: React.FC<AnnotationEditorProps> = ({
    annotations,
    canEditReview,
    annotationCategory,
    setAnnotationCategory,
    annotationTurnIndex,
    annotationDraft,
    setAnnotationDraft,
    annotationError,
    isSavingAnnotation,
    onSaveAnnotation,
    onSelectTurn
}) => (
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
                    {annotationError && (
                        <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2" role="alert">
                            {annotationError}
                        </p>
                    )}
                    {canEditReview && (
                        <div className="flex justify-end">
                            <Button onClick={onSaveAnnotation} disabled={annotationTurnIndex == null || !annotationDraft.trim() || isSavingAnnotation}>
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
                                onClick={() => onSelectTurn(annotation.transcriptIndex)}
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
);
