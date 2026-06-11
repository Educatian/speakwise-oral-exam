import { describe, it, expect } from 'vitest';
import {
    getMasteryLevel,
    getShortMasteryLabel,
    getScoreColor,
    formatScoreConstructively
} from '../lib/utils/scoreDisplay';

describe('getMasteryLevel', () => {
    it('maps score bands to mastery levels (boundaries inclusive)', () => {
        expect(getMasteryLevel(100).level).toBe('Expert');
        expect(getMasteryLevel(90).level).toBe('Expert');
        expect(getMasteryLevel(89).level).toBe('Proficient');
        expect(getMasteryLevel(80).level).toBe('Proficient');
        expect(getMasteryLevel(79).level).toBe('Developing');
        expect(getMasteryLevel(70).level).toBe('Developing');
        expect(getMasteryLevel(69).level).toBe('Emerging');
        expect(getMasteryLevel(60).level).toBe('Emerging');
        expect(getMasteryLevel(59).level).toBe('Beginning');
        expect(getMasteryLevel(0).level).toBe('Beginning');
    });

    it('uses growth-oriented labels instead of letter grades', () => {
        expect(getMasteryLevel(30).label).toBe('Getting Started');
        expect(getMasteryLevel(95).label).toBe('Excellent');
    });

    it('keeps the deprecated emoji field empty', () => {
        expect(getMasteryLevel(95).emoji).toBe('');
        expect(getMasteryLevel(10).emoji).toBe('');
    });
});

describe('getShortMasteryLabel / getScoreColor', () => {
    it('returns the label of the mastery level', () => {
        expect(getShortMasteryLabel(75)).toBe('Good Progress');
    });

    it('returns the Tailwind color class of the mastery level', () => {
        expect(getScoreColor(95)).toBe('text-emerald-400');
        expect(getScoreColor(40)).toBe('text-amber-400');
    });
});

describe('formatScoreConstructively', () => {
    it('combines percentage and label by default', () => {
        expect(formatScoreConstructively(45)).toBe('45% · Getting Started');
    });

    it('returns only the label when percentage is hidden', () => {
        expect(formatScoreConstructively(92, false)).toBe('Excellent');
    });
});
