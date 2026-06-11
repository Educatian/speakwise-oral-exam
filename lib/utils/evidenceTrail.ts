import { Submission } from '../../types';

export interface EvidenceTrailItem {
    snippet: string;
    matchingTurnIndex: number | null;
}

/**
 * Flatten the rubric + reasoning evidence quotes into a deduplicated trail
 * (max 8 entries) and link each snippet to the transcript turn it most likely
 * came from. Pure helper extracted from SubmissionDetailModal so it can be
 * unit-tested in isolation.
 */
export const buildEvidenceTrail = (submission: Submission): EvidenceTrailItem[] => {
    const evidencePool = [
        ...(submission.rubricBreakdown?.conceptualUnderstanding.evidence || []),
        ...(submission.rubricBreakdown?.communicationClarity.evidence || []),
        ...(submission.rubricBreakdown?.criticalThinking.evidence || []),
        ...(submission.rubricBreakdown?.engagement.evidence || []),
        ...(submission.reasoningRubric?.explicitJustification.examples || []),
        ...(submission.reasoningRubric?.abstractionGeneralization.instances || [])
    ];

    const uniqueEvidence = Array.from(new Set(evidencePool.map((item) => item.trim()).filter(Boolean))).slice(0, 8);
    return uniqueEvidence.map((snippet) => {
        const normalizedSnippet = snippet.toLowerCase();
        const matchingTurnIndex = submission.transcript.findIndex((turn) =>
            turn.text.toLowerCase().includes(normalizedSnippet) ||
            normalizedSnippet.includes(turn.text.toLowerCase().slice(0, Math.min(turn.text.length, 48)))
        );

        return {
            snippet,
            matchingTurnIndex: matchingTurnIndex >= 0 ? matchingTurnIndex : null
        };
    });
};

/**
 * Flatten all rubric-evidence quotes so the concept map can highlight the
 * concepts the scorer actually cited (map → grade traceability).
 */
export const collectEvidenceQuotes = (submission: Submission | null): string[] =>
    submission?.rubricBreakdown
        ? (Object.values(submission.rubricBreakdown) as Array<{ evidence?: string[] }>).flatMap((d) => d?.evidence ?? [])
        : [];
