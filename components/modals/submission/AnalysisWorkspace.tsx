import React from 'react';
import { ArgumentGraph, Submission, SubmissionAnnotation } from '../../../types';
import { ANNOTATION_COLORS } from './constants';
import { SubmissionConceptMap } from './SubmissionConceptMap';

interface AnalysisWorkspaceProps {
    submission: Submission;
    argumentGraph: ArgumentGraph | null;
    graphLoading: boolean;
    evidenceQuotes: string[];
    annotations: SubmissionAnnotation[];
    selectedTurnAnnotations: SubmissionAnnotation[];
    activeTranscriptIndex: number | null;
    highlightedTranscriptIndices: number[];
    canEditReview: boolean;
    setActiveTranscriptIndex: React.Dispatch<React.SetStateAction<number | null>>;
    setHighlightedTranscriptIndices: React.Dispatch<React.SetStateAction<number[]>>;
    setAnnotationTurnIndex: React.Dispatch<React.SetStateAction<number | null>>;
}

/**
 * Integrated analysis workspace: interactive concept map, focused transcript
 * turn list, and the annotation context for the active turn.
 */
export const AnalysisWorkspace: React.FC<AnalysisWorkspaceProps> = ({
    submission,
    argumentGraph,
    graphLoading,
    evidenceQuotes,
    annotations,
    selectedTurnAnnotations,
    activeTranscriptIndex,
    highlightedTranscriptIndices,
    canEditReview,
    setActiveTranscriptIndex,
    setHighlightedTranscriptIndices,
    setAnnotationTurnIndex
}) => (
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
                    <SubmissionConceptMap
                        graph={argumentGraph}
                        submission={submission}
                        activeTurnIndex={activeTranscriptIndex}
                        onActiveTurnIndexChange={setActiveTranscriptIndex}
                        onHighlightTurnsChange={setHighlightedTranscriptIndices}
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
);
