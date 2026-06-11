import { describe, it, expect } from 'vitest';
import { normalizeSpeech, lightNormalize } from '../lib/reasoning/speechNormalizer';

describe('normalizeSpeech', () => {
    it('returns an empty result for empty input', () => {
        const result = normalizeSpeech('');
        expect(result.normalized).toBe('');
        expect(result.fillersRemoved).toBe(0);
        expect(result.selfRepairsDetected).toBe(0);
        expect(result.repetitionsRemoved).toBe(0);
        expect(result.wasModified).toBe(false);
    });

    it('removes English filler words and counts them', () => {
        const result = normalizeSpeech('um I think uh photosynthesis is um important');
        expect(result.normalized).toBe('I think photosynthesis is important');
        expect(result.fillersRemoved).toBe(3);
        expect(result.wasModified).toBe(true);
        expect(result.original).toBe('um I think uh photosynthesis is um important');
    });

    it('handles a self-repair by keeping the corrected segment', () => {
        const result = normalizeSpeech('The answer is mitosis no wait it is meiosis');
        expect(result.selfRepairsDetected).toBe(1);
        expect(result.normalized).not.toContain('no wait');
        expect(result.normalized).toContain('meiosis');
    });

    it('handles "I mean" repairs', () => {
        const result = normalizeSpeech('It grows by osmosis, I mean, diffusion');
        expect(result.selfRepairsDetected).toBe(1);
        expect(result.normalized).not.toContain('I mean');
        expect(result.normalized).toContain('diffusion');
    });

    it('deduplicates single-word stutters', () => {
        const result = normalizeSpeech('the the cell divides into two parts');
        expect(result.normalized).toBe('the cell divides into two parts');
        expect(result.repetitionsRemoved).toBe(1);
    });

    it('deduplicates repeated two-word phrases', () => {
        const result = normalizeSpeech('I think I think the answer is correct');
        expect(result.normalized).toBe('I think the answer is correct');
        expect(result.repetitionsRemoved).toBe(1);
    });

    it('leaves clean text untouched', () => {
        const clean = 'Photosynthesis converts light into chemical energy.';
        const result = normalizeSpeech(clean);
        expect(result.normalized).toBe(clean);
        expect(result.wasModified).toBe(false);
        expect(result.fillersRemoved).toBe(0);
    });
});

describe('lightNormalize', () => {
    it('returns an empty string for falsy input', () => {
        expect(lightNormalize('')).toBe('');
    });

    it('removes fillers including multi-word phrases', () => {
        expect(lightNormalize('um you know the answer')).toBe('the answer');
    });

    it('removes Korean fillers', () => {
        expect(lightNormalize('음 광합성은 중요하다')).toBe('광합성은 중요하다');
    });

    it('collapses whitespace', () => {
        expect(lightNormalize('the   cell    divides')).toBe('the cell divides');
    });
});
