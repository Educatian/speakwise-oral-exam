/**
 * Argument Graph Builder
 * Captures claim-evidence-counterargument structure during interviews
 */

import { ArgumentNode, ArgumentEdge, ArgumentGraph } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Argument Classification Patterns
// ─────────────────────────────────────────────────────────────────────────────

const CLAIM_PATTERNS = [
    /I (think|believe|argue|claim)/gi,
    /in my (opinion|view)/gi,
    /my (position|stance) is/gi,
    /the (answer|solution|point) is/gi,
    // Korean
    /제 생각에는/g,
    /저는.*생각합니다/g
];

const EVIDENCE_PATTERNS = [
    /because\s+/gi,
    /for example/gi,
    /according to/gi,
    /evidence (shows|suggests)/gi,
    /research (indicates|shows)/gi,
    /this is (shown|demonstrated) by/gi,
    // Korean
    /왜냐하면/g,
    /예를 들어/g,
    /근거로는/g
];

const COUNTER_PATTERNS = [
    /but (on the other hand|however)/gi,
    /some (might|may|would) argue/gi,
    /while (this|that) is true/gi,
    /I (understand|see) (the|your) point, (but|however)/gi,
    // Korean
    /그러나/g,
    /반면에/g,
    /하지만/g
];

// ─────────────────────────────────────────────────────────────────────────────
// Argument Graph Builder Class
// ─────────────────────────────────────────────────────────────────────────────

export class ArgumentGraphBuilder {
    private nodes: ArgumentNode[] = [];
    private edges: ArgumentEdge[] = [];
    private nodeCounter = 0;

    /**
     * Generate unique node ID
     */
    private generateId(): string {
        return `arg_${++this.nodeCounter}_${Date.now()}`;
    }

    /**
     * Classify utterance type based on patterns
     */
    classifyUtterance(text: string): 'claim' | 'evidence' | 'counterargument' | 'justification' {
        // Check for counter-argument patterns first (highest priority)
        for (const pattern of COUNTER_PATTERNS) {
            if (pattern.test(text)) return 'counterargument';
        }

        // Check for evidence patterns
        for (const pattern of EVIDENCE_PATTERNS) {
            if (pattern.test(text)) return 'evidence';
        }

        // Check for claim patterns
        for (const pattern of CLAIM_PATTERNS) {
            if (pattern.test(text)) return 'claim';
        }

        // Default to justification for explanatory text
        return 'justification';
    }

    /**
     * Add a question from interviewer
     */
    addQuestion(content: string, timestamp: number): string {
        const id = this.generateId();
        this.nodes.push({
            id,
            type: 'question',
            content: content.substring(0, 200), // Truncate for storage
            speaker: 'interviewer',
            timestamp
        });
        return id;
    }

    /**
     * Add a claim node
     */
    addClaim(content: string, timestamp: number, respondsTo?: string): string {
        const id = this.generateId();
        this.nodes.push({
            id,
            type: 'claim',
            content: content.substring(0, 200),
            speaker: 'user',
            timestamp
        });

        if (respondsTo) {
            this.edges.push({
                from: id,
                to: respondsTo,
                relation: 'responds_to'
            });
        }

        return id;
    }

    /**
     * Add evidence supporting a claim
     */
    addEvidence(content: string, supportsClaim: string, timestamp: number): string {
        const id = this.generateId();
        this.nodes.push({
            id,
            type: 'evidence',
            content: content.substring(0, 200),
            speaker: 'user',
            timestamp
        });

        this.edges.push({
            from: id,
            to: supportsClaim,
            relation: 'supports'
        });

        return id;
    }

    /**
     * Add counter-argument
     */
    addCounterArgument(content: string, refutesClaim: string, timestamp: number): string {
        const id = this.generateId();
        this.nodes.push({
            id,
            type: 'counterargument',
            content: content.substring(0, 200),
            speaker: 'user',
            timestamp
        });

        this.edges.push({
            from: id,
            to: refutesClaim,
            relation: 'refutes'
        });

        return id;
    }

    /**
     * Process a user utterance and auto-classify
     */
    processUserUtterance(text: string, timestamp: number, lastQuestionId?: string): string {
        const type = this.classifyUtterance(text);
        const id = this.generateId();

        this.nodes.push({
            id,
            type,
            content: text.substring(0, 200),
            speaker: 'user',
            timestamp
        });

        // Connect to last question if this is a direct response
        if (lastQuestionId && type === 'claim') {
            this.edges.push({
                from: id,
                to: lastQuestionId,
                relation: 'responds_to'
            });
        }

        // Find if this could be evidence for a recent claim
        const lastClaim = this.nodes.filter(n => n.type === 'claim').pop();
        if (type === 'evidence' && lastClaim) {
            this.edges.push({
                from: id,
                to: lastClaim.id,
                relation: 'supports'
            });
        }

        return id;
    }

    /**
     * Calculate coherence score based on graph structure
     */
    private calculateCoherence(): number {
        if (this.nodes.length === 0) return 0;

        const claims = this.nodes.filter(n => n.type === 'claim').length;
        const evidence = this.nodes.filter(n => n.type === 'evidence').length;
        const connected = new Set(this.edges.flatMap(e => [e.from, e.to])).size;

        // Coherence: ratio of connected nodes + evidence-to-claim ratio
        const connectionRatio = connected / Math.max(this.nodes.length, 1);
        const evidenceRatio = claims > 0 ? Math.min(1, evidence / claims) : 0;

        return Math.round((connectionRatio * 0.5 + evidenceRatio * 0.5) * 100);
    }

    /**
     * Get the complete argument graph
     */
    getGraph(): ArgumentGraph {
        return {
            nodes: this.nodes,
            edges: this.edges,
            coherenceScore: this.calculateCoherence(),
            complexity: this.nodes.length + this.edges.length
        };
    }

    /**
     * Reset the graph
     */
    reset(): void {
        this.nodes = [];
        this.edges = [];
        this.nodeCounter = 0;
    }
}

/**
 * Create a singleton instance for use in hooks
 */
export const argumentGraphBuilder = new ArgumentGraphBuilder();

export default ArgumentGraphBuilder;
