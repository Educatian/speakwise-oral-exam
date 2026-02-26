import { LatencyMetrics, BargeInEvent, TranscriptionItem, DialogueMetrics, ArgumentGraph } from '../../types';

export const DEFAULT_LATENCY_METRICS: LatencyMetrics = {
    avgInitialLatency: 0,
    maxLatency: 0,
    minLatency: Infinity,
    totalThinkingTime: 0,
    turnCount: 0,
    turnTakingRatio: 0
};

export const DEFAULT_DIALOGUE_METRICS: DialogueMetrics = {
    turnInitiatives: 0,
    rephrasingEvents: 0,
    followUpDepth: [],
    avgFollowUpDepth: 0,
    latencyVariation: 0,
    questionResponseRatio: 0
};

export function detectBargeInEvent(
    isInterviewerSpeaking: boolean,
    currentInterviewerText: string,
    studentUtterance: string
): BargeInEvent | null {
    if (isInterviewerSpeaking && currentInterviewerText) {
        return {
            timestamp: Date.now(),
            interruptedContent: currentInterviewerText,
            studentUtterance: studentUtterance,
            interpretationType: 'unknown'
        };
    }
    return null;
}

export function calculateLatencyMetrics(
    latencies: number[],
    userSpeakingTime: number,
    interviewerSpeakingTime: number
): LatencyMetrics {
    if (latencies.length === 0) {
        return DEFAULT_LATENCY_METRICS;
    }

    const sum = latencies.reduce((a, b) => a + b, 0);
    const avg = sum / latencies.length;
    const max = Math.max(...latencies);
    const min = Math.min(...latencies);

    const ratio = interviewerSpeakingTime > 0 ? userSpeakingTime / interviewerSpeakingTime : 0;

    return {
        avgInitialLatency: Math.round(avg),
        maxLatency: max,
        minLatency: min === Infinity ? 0 : min,
        totalThinkingTime: sum,
        turnCount: latencies.length,
        turnTakingRatio: Math.round(ratio * 100) / 100
    };
}
