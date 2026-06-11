import { describe, it, expect } from 'vitest';
import {
    analyzeReasoningPatterns,
    analyzeToulminComponents,
    calculateReasoningScores,
    detectRephrasing,
    detectTurnInitiative
} from '../lib/reasoning/patterns';

describe('analyzeReasoningPatterns', () => {
    it('detects causal markers in an English transcript', () => {
        const text =
            'The ice melts because the temperature rises. Therefore the sea level goes up, ' +
            'and consequently coastal cities flood.';
        const result = analyzeReasoningPatterns(text);
        expect(result.causal.count).toBeGreaterThanOrEqual(3);
        expect(result.causal.examples.length).toBeGreaterThan(0);
    });

    it('detects justification markers', () => {
        const text =
            'For example, birds migrate south in winter. According to the textbook this is ' +
            'driven by food availability. Evidence suggests temperature also matters.';
        const result = analyzeReasoningPatterns(text);
        expect(result.justification.count).toBeGreaterThanOrEqual(3);
    });

    it('detects counter-argument and generalization markers', () => {
        const text =
            'In general plants need sunlight. However, some species thrive in shade. ' +
            'Typically they grow near the forest floor.';
        const result = analyzeReasoningPatterns(text);
        expect(result.counterArgument.count).toBeGreaterThanOrEqual(1);
        expect(result.generalization.count).toBeGreaterThanOrEqual(2);
    });

    it('detects Korean causal markers', () => {
        const text = '온도가 올라갔기 때문에 얼음이 녹습니다. 그래서 해수면이 상승합니다.';
        const result = analyzeReasoningPatterns(text);
        expect(result.causal.count).toBeGreaterThanOrEqual(2);
    });

    it('returns zero counts on text without reasoning markers', () => {
        const result = analyzeReasoningPatterns('The sky is blue.');
        expect(result.causal.count).toBe(0);
        expect(result.justification.count).toBe(0);
        expect(result.counterArgument.count).toBe(0);
    });
});

describe('analyzeToulminComponents', () => {
    const richArgument =
        'Climate change is accelerating. For example, sea levels rose 20cm last century. ' +
        'This means that thermal expansion is already underway. Studies have shown the trend ' +
        'is robust across datasets. Probably it will continue, unless emissions drop sharply.';

    it('detects all six components on a complete argument', () => {
        const analysis = analyzeToulminComponents(richArgument);
        expect(analysis.claim.detected).toBe(true);
        expect(analysis.data.detected).toBe(true);
        expect(analysis.warrant.detected).toBe(true);
        expect(analysis.backing.detected).toBe(true);
        expect(analysis.qualifier.detected).toBe(true);
        expect(analysis.rebuttal.detected).toBe(true);
        expect(analysis.missingComponents).toEqual([]);
        expect(analysis.completenessScore).toBe(100);
    });

    it('flags missing components on a bare claim', () => {
        const analysis = analyzeToulminComponents('The sky is blue.');
        expect(analysis.claim.detected).toBe(true);
        expect(analysis.data.detected).toBe(false);
        expect(analysis.missingComponents).toContain('Data/Evidence');
        expect(analysis.missingComponents).toContain('Warrant (logical bridge)');
        expect(analysis.missingComponents.length).toBe(5);
    });

    it('treats empty text as no claim', () => {
        const analysis = analyzeToulminComponents('   ');
        expect(analysis.claim.detected).toBe(false);
    });
});

describe('calculateReasoningScores', () => {
    it('caps each dimension score at 5', () => {
        const text = Array(8).fill('This happens because of that.').join(' ');
        const scores = calculateReasoningScores(analyzeReasoningPatterns(text));
        expect(scores.causalExplanation.score).toBe(5);
        expect(scores.overallReasoningScore).toBeLessThanOrEqual(100);
        expect(scores.overallReasoningScore).toBeGreaterThan(0);
    });

    it('weights counter-arguments double', () => {
        const text = 'However, the opposite can be true.';
        const scores = calculateReasoningScores(analyzeReasoningPatterns(text));
        expect(scores.counterArgumentHandling.attempts).toBe(1);
        expect(scores.counterArgumentHandling.score).toBe(2);
    });

    it('omits Toulmin analysis when full text is not provided', () => {
        const scores = calculateReasoningScores(analyzeReasoningPatterns('Plain text.'));
        expect(scores.toulminAnalysis).toBeUndefined();
    });

    it('includes Toulmin analysis when full text is provided', () => {
        const text = 'For example, this is supported by data because reasons.';
        const scores = calculateReasoningScores(analyzeReasoningPatterns(text), text);
        expect(scores.toulminAnalysis).toBeDefined();
        expect(scores.toulminAnalysis!.data.detected).toBe(true);
    });
});

describe('detectRephrasing', () => {
    it('returns false when either side is empty', () => {
        expect(detectRephrasing('', 'something')).toBe(false);
        expect(detectRephrasing('something', '')).toBe(false);
    });

    it('detects an explicit rephrasing marker', () => {
        expect(
            detectRephrasing(
                'in other words the cycle converts light into chemical energy',
                'photosynthesis stores energy'
            )
        ).toBe(true);
    });

    it('detects rephrasing through high word overlap', () => {
        expect(
            detectRephrasing(
                'energy comes from inside mitochondria structures',
                'mitochondria structures produce most cellular energy'
            )
        ).toBe(true);
    });

    it('returns false for unrelated statements', () => {
        expect(detectRephrasing('dogs bark', 'photosynthesis converts light')).toBe(false);
    });
});

describe('detectTurnInitiative', () => {
    it('detects an explicit initiative marker', () => {
        expect(
            detectTurnInitiative('another point is the role of enzymes here', 'What is osmosis?')
        ).toBe(true);
    });

    it('returns false for a short direct answer to an elaborate prompt', () => {
        expect(detectTurnInitiative('yes', 'Can you elaborate on that?')).toBe(false);
    });

    it('treats long novel responses as initiative', () => {
        const long = 'the process of cellular respiration involves glycolysis '.repeat(5);
        expect(detectTurnInitiative(long, 'What is respiration?')).toBe(true);
    });
});
