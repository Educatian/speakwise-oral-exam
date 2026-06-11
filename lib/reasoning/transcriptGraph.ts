import { ArgumentGraph, TranscriptionItem } from '../../types';
import { ArgumentGraphBuilder } from './argumentGraph';

/**
 * Deterministic fallback used when LLM concept-network generation fails:
 * rebuild a minimal argument graph straight from the transcript with the
 * rule-based ArgumentGraphBuilder. Pure helper extracted from
 * SubmissionDetailModal so it can be unit-tested in isolation.
 */
export const buildTranscriptFallbackGraph = (transcript: TranscriptionItem[]): ArgumentGraph => {
    const builder = new ArgumentGraphBuilder();
    let lastQuestionId: string | undefined;
    transcript.forEach((item) => {
        if (item.speaker === 'interviewer') {
            if (item.text.includes('?')) {
                lastQuestionId = builder.addQuestion(item.text, item.timestamp);
            }
        } else {
            builder.processUserUtterance(item.text, item.timestamp, lastQuestionId);
        }
    });
    return builder.getGraph();
};
