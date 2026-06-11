import { describe, it, expect } from 'vitest';
import { buildTranscriptFallbackGraph } from '../lib/reasoning/transcriptGraph';
import type { TranscriptionItem } from '../types';

describe('buildTranscriptFallbackGraph', () => {
    it('returns an empty graph for an empty transcript', () => {
        const graph = buildTranscriptFallbackGraph([]);
        expect(graph.nodes).toEqual([]);
        expect(graph.edges).toEqual([]);
    });

    it('adds question nodes only for interviewer turns containing a question mark', () => {
        const transcript: TranscriptionItem[] = [
            { speaker: 'interviewer', text: 'Welcome to the session.', timestamp: 1 },
            { speaker: 'interviewer', text: 'Why does the moon orbit the earth?', timestamp: 2 }
        ];

        const graph = buildTranscriptFallbackGraph(transcript);
        const questions = graph.nodes.filter((node) => node.type === 'question');
        expect(questions).toHaveLength(1);
        expect(questions[0].content).toContain('moon');
        expect(questions[0].speaker).toBe('interviewer');
    });

    it('links the user response keywords to the preceding question', () => {
        const transcript: TranscriptionItem[] = [
            { speaker: 'interviewer', text: 'What is inside an atom?', timestamp: 1 },
            { speaker: 'user', text: 'Protons neutrons electrons nucleus shells.', timestamp: 2 }
        ];

        const graph = buildTranscriptFallbackGraph(transcript);
        const questionNode = graph.nodes.find((node) => node.type === 'question');
        const userNodes = graph.nodes.filter((node) => node.speaker === 'user');

        expect(questionNode).toBeDefined();
        expect(userNodes.length).toBeGreaterThan(0);
        expect(graph.edges.some((edge) => edge.from === questionNode!.id)).toBe(true);
    });

    it('still creates user keyword nodes when no question precedes them', () => {
        const transcript: TranscriptionItem[] = [
            { speaker: 'user', text: 'Gravity pulls planets toward stars constantly.', timestamp: 1 }
        ];

        const graph = buildTranscriptFallbackGraph(transcript);
        expect(graph.nodes.length).toBeGreaterThan(0);
        expect(graph.nodes.every((node) => node.speaker === 'user')).toBe(true);
    });
});
