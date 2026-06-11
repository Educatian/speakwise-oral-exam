import { useEffect, useState } from 'react';
import { ArgumentGraph, Submission } from '../../../types';
import { generateConceptNetwork } from '../../../lib/reasoning/conceptNetwork';
import { buildTranscriptFallbackGraph } from '../../../lib/reasoning/transcriptGraph';

/**
 * Resolves the concept/argument graph for a submission: prefer the stored
 * graph, otherwise generate a concept network from the transcript, falling
 * back to the rule-based transcript graph when generation fails.
 */
export const useSubmissionConceptGraph = (submission: Submission | null) => {
    const [argumentGraph, setArgumentGraph] = useState<ArgumentGraph | null>(null);
    const [graphLoading, setGraphLoading] = useState(false);

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
                    setArgumentGraph(buildTranscriptFallbackGraph(submission.transcript));
                    setGraphLoading(false);
                });
        }
    }, [submission]);

    return { argumentGraph, graphLoading };
};
