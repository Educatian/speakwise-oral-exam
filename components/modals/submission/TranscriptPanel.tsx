import React from 'react';
import { SubmissionAnnotation, TranscriptionItem } from '../../../types';
import { ANNOTATION_COLORS } from './constants';

interface TranscriptPanelProps {
    transcript: TranscriptionItem[];
    annotations: SubmissionAnnotation[];
    canEditReview: boolean;
    activeTranscriptIndex: number | null;
    highlightedTranscriptIndices: number[];
    /** Refs the parent uses for scroll-into-view focus on the active turn. */
    transcriptRefs: React.MutableRefObject<Record<number, HTMLDivElement | null>>;
    onSelectTurn: (index: number) => void;
    onAnnotateTurn: (index: number) => void;
}

/** Full conversation transcript with annotation chips + annotate-turn action. */
export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({
    transcript,
    annotations,
    canEditReview,
    activeTranscriptIndex,
    highlightedTranscriptIndices,
    transcriptRefs,
    onSelectTurn,
    onAnnotateTurn
}) => (
    <div className="space-y-4">
        <h4 className="text-slate-500 font-bold text-xs uppercase tracking-widest">
            Full conversation transcript
        </h4>

        <div className="space-y-3 max-h-[40vh] overflow-y-auto custom-scrollbar pr-2">
            {transcript.map((turn, index) => (
                <div
                    key={`${turn.timestamp}-${index}`}
                    ref={(element) => {
                        transcriptRefs.current[index] = element;
                    }}
                    tabIndex={-1}
                    className={`flex gap-3 cursor-pointer ${turn.speaker === 'user' ? 'flex-row-reverse' : ''}`}
                    onClick={() => onSelectTurn(index)}
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
                                        onClick={() => onSelectTurn(index)}
                                        className={`px-2 py-1 rounded-full text-[10px] border ${ANNOTATION_COLORS[annotation.category]}`}
                                    >
                                        {annotation.category.replace('_', ' ')}
                                    </button>
                                ))}
                            {canEditReview && (
                                <button
                                    type="button"
                                    onClick={() => onAnnotateTurn(index)}
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
);
