import { describe, it, expect } from 'vitest';
import {
    DEFAULT_LATENCY_METRICS,
    calculateLatencyMetrics,
    detectBargeInEvent
} from '../lib/voice/analyticsUtils';

describe('calculateLatencyMetrics', () => {
    it('returns the default metrics for an empty latency list', () => {
        expect(calculateLatencyMetrics([], 0, 0)).toEqual(DEFAULT_LATENCY_METRICS);
    });

    it('computes avg, max, min, total, and turn count', () => {
        const metrics = calculateLatencyMetrics([1000, 2000, 3000], 60, 120);
        expect(metrics.avgInitialLatency).toBe(2000);
        expect(metrics.maxLatency).toBe(3000);
        expect(metrics.minLatency).toBe(1000);
        expect(metrics.totalThinkingTime).toBe(6000);
        expect(metrics.turnCount).toBe(3);
    });

    it('computes the turn-taking ratio rounded to 2 decimals', () => {
        expect(calculateLatencyMetrics([100], 60, 120).turnTakingRatio).toBe(0.5);
        expect(calculateLatencyMetrics([100], 100, 300).turnTakingRatio).toBe(0.33);
    });

    it('guards against division by zero interviewer time', () => {
        expect(calculateLatencyMetrics([100], 60, 0).turnTakingRatio).toBe(0);
    });

    it('rounds the average latency', () => {
        expect(calculateLatencyMetrics([100, 101], 0, 0).avgInitialLatency).toBe(101);
    });
});

describe('detectBargeInEvent', () => {
    it('returns an event when the student interrupts the interviewer', () => {
        const event = detectBargeInEvent(true, 'Let me explain the rubric', 'But wait');
        expect(event).not.toBeNull();
        expect(event!.interruptedContent).toBe('Let me explain the rubric');
        expect(event!.studentUtterance).toBe('But wait');
        expect(event!.interpretationType).toBe('unknown');
        expect(typeof event!.timestamp).toBe('number');
    });

    it('returns null when the interviewer is not speaking', () => {
        expect(detectBargeInEvent(false, 'some text', 'hello')).toBeNull();
    });

    it('returns null when there is no interviewer text', () => {
        expect(detectBargeInEvent(true, '', 'hello')).toBeNull();
    });
});
