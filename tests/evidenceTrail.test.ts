import { describe, it, expect } from 'vitest';
import { buildEvidenceTrail, collectEvidenceQuotes } from '../lib/utils/evidenceTrail';
import type { Submission } from '../types';

const makeSubmission = (overrides: Partial<Submission> = {}): Submission =>
    ({
        id: 's1',
        studentName: 'student',
        timestamp: 0,
        transcript: [],
        score: 80,
        feedback: '',
        ...overrides
    }) as Submission;

const rubric = (evidence: string[]) => ({
    conceptualUnderstanding: { score: 4, evidence },
    communicationClarity: { score: 3, evidence: [] },
    criticalThinking: { score: 3, evidence: [] },
    engagement: { score: 3, evidence: [] }
});

describe('buildEvidenceTrail', () => {
    it('returns an empty trail when there is no evidence', () => {
        expect(buildEvidenceTrail(makeSubmission())).toEqual([]);
    });

    it('links a snippet to the transcript turn that contains it', () => {
        const submission = makeSubmission({
            transcript: [
                { speaker: 'interviewer', text: 'What is photosynthesis?', timestamp: 1 },
                { speaker: 'user', text: 'Plants convert sunlight into chemical energy.', timestamp: 2 }
            ],
            rubricBreakdown: rubric(['convert sunlight into chemical energy'])
        });

        expect(buildEvidenceTrail(submission)).toEqual([
            { snippet: 'convert sunlight into chemical energy', matchingTurnIndex: 1 }
        ]);
    });

    it('matches when the snippet contains the start of a turn (reverse containment)', () => {
        const turnText = 'Energy flows through the food chain.';
        const submission = makeSubmission({
            transcript: [{ speaker: 'user', text: turnText, timestamp: 1 }],
            rubricBreakdown: rubric([`The student said: ${turnText} That was strong.`])
        });

        expect(buildEvidenceTrail(submission)[0].matchingTurnIndex).toBe(0);
    });

    it('returns null matchingTurnIndex when no turn matches', () => {
        const submission = makeSubmission({
            transcript: [{ speaker: 'user', text: 'Completely unrelated answer.', timestamp: 1 }],
            rubricBreakdown: rubric(['quantum entanglement of qubits'])
        });

        expect(buildEvidenceTrail(submission)).toEqual([
            { snippet: 'quantum entanglement of qubits', matchingTurnIndex: null }
        ]);
    });

    it('deduplicates, drops blank snippets, and caps the trail at 8 entries', () => {
        const evidence = [
            ' dup ',
            'dup',
            '   ',
            ...Array.from({ length: 12 }, (_, i) => `unique snippet number ${i}`)
        ];
        const submission = makeSubmission({ rubricBreakdown: rubric(evidence) });

        const trail = buildEvidenceTrail(submission);
        expect(trail).toHaveLength(8);
        expect(trail[0].snippet).toBe('dup');
        expect(trail.filter((item) => item.snippet === 'dup')).toHaveLength(1);
    });

    it('pulls evidence from the reasoning rubric pools too', () => {
        const submission = makeSubmission({
            reasoningRubric: {
                explicitJustification: { score: 4, count: 1, examples: ['because the data shows it'] },
                causalExplanation: { score: 3, patterns: [] },
                counterArgumentHandling: { score: 2, attempts: 0 },
                abstractionGeneralization: { score: 3, instances: ['in general, systems balance'] },
                overallReasoningScore: 70
            }
        });

        const snippets = buildEvidenceTrail(submission).map((item) => item.snippet);
        expect(snippets).toEqual(['because the data shows it', 'in general, systems balance']);
    });
});

describe('collectEvidenceQuotes', () => {
    it('returns an empty list for null or rubric-less submissions', () => {
        expect(collectEvidenceQuotes(null)).toEqual([]);
        expect(collectEvidenceQuotes(makeSubmission())).toEqual([]);
    });

    it('flattens evidence quotes across all rubric dimensions', () => {
        const submission = makeSubmission({
            rubricBreakdown: {
                conceptualUnderstanding: { score: 4, evidence: ['a'] },
                communicationClarity: { score: 3, evidence: ['b', 'c'] },
                criticalThinking: { score: 3, evidence: [] },
                engagement: { score: 3, evidence: ['d'] }
            }
        });

        expect(collectEvidenceQuotes(submission)).toEqual(['a', 'b', 'c', 'd']);
    });
});
