import { describe, it, expect } from 'vitest';
import ArgumentGraphBuilder, { classifyUtterance } from '../lib/reasoning/argumentGraph';

describe('classifyUtterance', () => {
    it('classifies counter-arguments first (highest priority)', () => {
        expect(classifyUtterance('However, I disagree with that view')).toBe('counterargument');
    });

    it('classifies evidence via justification markers', () => {
        expect(classifyUtterance('for example, birds migrate south every winter')).toBe('evidence');
    });

    it('classifies causal reasoning as justification', () => {
        expect(classifyUtterance('the ice melts due to higher temperatures')).toBe('justification');
    });

    it('defaults to claim when no markers are present', () => {
        expect(classifyUtterance('photosynthesis happens within chloroplasts')).toBe('claim');
    });

    it('treats empty input as a claim', () => {
        expect(classifyUtterance('')).toBe('claim');
        expect(classifyUtterance('   ')).toBe('claim');
    });
});

describe('ArgumentGraphBuilder', () => {
    it('adds interviewer questions as question nodes', () => {
        const builder = new ArgumentGraphBuilder();
        const id = builder.addQuestion('What drives climate change?', 1000);
        const graph = builder.getGraph();
        expect(graph.nodes).toHaveLength(1);
        expect(graph.nodes[0].id).toBe(id);
        expect(graph.nodes[0].type).toBe('question');
        expect(graph.nodes[0].speaker).toBe('interviewer');
    });

    it('extracts a causal edge from a cause-effect utterance', () => {
        const builder = new ArgumentGraphBuilder();
        builder.processUserUtterance('Greenhouse gases cause warming', 2000);
        const graph = builder.getGraph();
        expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
        const causalEdge = graph.edges.find(e => e.relation === 'causes');
        expect(causalEdge).toBeDefined();
        const fromNode = graph.nodes.find(n => n.id === causalEdge!.from);
        expect(fromNode?.content).toBe('greenhouse');
    });

    it('links an answer back to the preceding question with a responds edge', () => {
        const builder = new ArgumentGraphBuilder();
        const qId = builder.addQuestion('What causes warming?', 0);
        builder.processUserUtterance('Greenhouse gases cause warming', 1, qId);
        const graph = builder.getGraph();
        const responds = graph.edges.find(e => e.relation === 'responds' && e.from === qId);
        expect(responds).toBeDefined();
    });

    it('chains standalone keywords with relates edges when no causal pattern exists', () => {
        const builder = new ArgumentGraphBuilder();
        builder.processUserUtterance('photosynthesis chlorophyll sunlight energy', 0);
        const graph = builder.getGraph();
        expect(graph.nodes).toHaveLength(4);
        expect(graph.edges.filter(e => e.relation === 'relates')).toHaveLength(3);
        expect(graph.nodes[0].type).toBe('claim');
    });

    it('reuses keyword nodes instead of duplicating them', () => {
        const builder = new ArgumentGraphBuilder();
        builder.processUserUtterance('Greenhouse gases cause warming', 0);
        const before = builder.getGraph().nodes.length;
        builder.processUserUtterance('Greenhouse gases cause warming', 1);
        const after = builder.getGraph().nodes.length;
        expect(after).toBe(before);
    });

    it('computes complexity as nodes plus edges', () => {
        const builder = new ArgumentGraphBuilder();
        builder.processUserUtterance('photosynthesis chlorophyll sunlight', 0);
        const graph = builder.getGraph();
        expect(graph.complexity).toBe(graph.nodes.length + graph.edges.length);
        expect(graph.coherenceScore).toBeGreaterThan(0);
        expect(graph.coherenceScore).toBeLessThanOrEqual(100);
    });

    it('resets to an empty graph', () => {
        const builder = new ArgumentGraphBuilder();
        builder.addQuestion('Why?', 0);
        builder.processUserUtterance('Because of gravity', 1);
        builder.reset();
        const graph = builder.getGraph();
        expect(graph.nodes).toHaveLength(0);
        expect(graph.edges).toHaveLength(0);
        expect(graph.coherenceScore).toBe(0);
        expect(graph.complexity).toBe(0);
    });
});
