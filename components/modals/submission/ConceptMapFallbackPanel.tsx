import React from 'react';
import { ArgumentGraph, Submission } from '../../../types';
import { SubmissionConceptMap } from './SubmissionConceptMap';

interface ConceptMapFallbackPanelProps {
    submission: Submission;
    argumentGraph: ArgumentGraph | null;
    graphLoading: boolean;
    evidenceQuotes: string[];
    activeTranscriptIndex: number | null;
    setActiveTranscriptIndex: React.Dispatch<React.SetStateAction<number | null>>;
    setHighlightedTranscriptIndices: React.Dispatch<React.SetStateAction<number[]>>;
}

/**
 * Argument Map fallback — shown when the integrated workspace above doesn't
 * have a graph. Kept for parity with legacy submissions that only have the
 * minimal ArgumentGraph.
 */
export const ConceptMapFallbackPanel: React.FC<ConceptMapFallbackPanelProps> = ({
    submission,
    argumentGraph,
    graphLoading,
    evidenceQuotes,
    activeTranscriptIndex,
    setActiveTranscriptIndex,
    setHighlightedTranscriptIndices
}) => (
    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
        {graphLoading ? (
            <div className="text-center py-10">
                <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-slate-400 text-sm font-medium">Analyzing concept network...</p>
                <p className="text-xs text-slate-600 mt-1">The model is reconstructing semantic relationships from the conversation.</p>
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
            <div className="text-center py-6 text-slate-500">
                <h4 className="text-slate-400 font-bold text-sm mb-1">Concept network</h4>
                <p className="text-xs">No concept network is available for this session.</p>
            </div>
        )}
    </div>
);
