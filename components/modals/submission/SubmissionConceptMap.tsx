import React from 'react';
import { ArgumentGraph, Submission } from '../../../types';
import { ArgumentMapView, ErrorBoundary } from '../../ui';

interface SubmissionConceptMapProps {
    graph: ArgumentGraph;
    submission: Submission;
    activeTurnIndex: number | null;
    onActiveTurnIndexChange: (index: number | null) => void;
    onHighlightTurnsChange: (indices: number[]) => void;
    evidenceQuotes: string[];
}

/**
 * Error-bounded ArgumentMapView with the exact prop wiring both the
 * integrated workspace and the legacy fallback panel share.
 */
export const SubmissionConceptMap: React.FC<SubmissionConceptMapProps> = ({
    graph,
    submission,
    activeTurnIndex,
    onActiveTurnIndexChange,
    onHighlightTurnsChange,
    evidenceQuotes
}) => (
    <ErrorBoundary compact panelName="concept map">
        <ArgumentMapView
            graph={graph}
            transcript={submission.transcript}
            activeTurnIndex={activeTurnIndex}
            onActiveTurnIndexChange={onActiveTurnIndexChange}
            onHighlightTurnsChange={onHighlightTurnsChange}
            storageKey={submission.id}
            evidenceQuotes={evidenceQuotes}
        />
    </ErrorBoundary>
);
