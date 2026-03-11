/**
 * Causal/Argument Graph Builder
 * Extracts keywords and identifies causal relationships from speech.
 * 
 * Enhanced with:
 * - Real utterance classification (claim/evidence/counterargument/justification)
 * - Speech normalization preprocessing for spoken discourse
 * - Toulmin-aware node typing
 */

import { ArgumentNode, ArgumentEdge, ArgumentGraph } from '../../types';
import {
    CAUSAL_PATTERNS as REASONING_CAUSAL_PATTERNS,
    JUSTIFICATION_PATTERNS,
    COUNTER_ARGUMENT_PATTERNS,
    GENERALIZATION_PATTERNS
} from './patterns';
import { normalizeSpeech } from './speechNormalizer';

// ─────────────────────────────────────────────────────────────────────────────
// Causal Relationship Patterns (English & Korean)
// ─────────────────────────────────────────────────────────────────────────────

const CAUSAL_PATTERNS: { pattern: RegExp; relation: string }[] = [
    // Cause-Effect
    { pattern: /(.+?)\s+(causes?|caused)\s+(.+)/gi, relation: 'causes' },
    { pattern: /(.+?)\s+(leads? to|led to)\s+(.+)/gi, relation: 'leads to' },
    { pattern: /(.+?)\s+(results? in|resulted in)\s+(.+)/gi, relation: 'results in' },
    { pattern: /because\s+(.+?),?\s+(.+)/gi, relation: 'because' },
    { pattern: /(.+?)\s+because\s+(.+)/gi, relation: 'because' },
    { pattern: /if\s+(.+?),?\s+then\s+(.+)/gi, relation: 'if-then' },

    // Influence
    { pattern: /(.+?)\s+(affects?|affected)\s+(.+)/gi, relation: 'affects' },
    { pattern: /(.+?)\s+(influences?|influenced)\s+(.+)/gi, relation: 'influences' },
    { pattern: /(.+?)\s+(impacts?|impacted)\s+(.+)/gi, relation: 'impacts' },

    // Dependency
    { pattern: /(.+?)\s+(depends? on|dependent on)\s+(.+)/gi, relation: 'depends on' },
    { pattern: /(.+?)\s+(requires?|required)\s+(.+)/gi, relation: 'requires' },
    { pattern: /(.+?)\s+(needs?|needed)\s+(.+)/gi, relation: 'needs' },

    // Correlation
    { pattern: /(.+?)\s+(is related to|relates? to)\s+(.+)/gi, relation: 'related to' },
    { pattern: /(.+?)\s+(is connected to|connects? to)\s+(.+)/gi, relation: 'connected to' },
    { pattern: /(.+?)\s+(is associated with|associates? with)\s+(.+)/gi, relation: 'associated with' },

    // Contrast
    { pattern: /(.+?)\s+(but|however)\s+(.+)/gi, relation: 'contrasts' },
    { pattern: /although\s+(.+?),?\s+(.+)/gi, relation: 'although' },

    // Korean patterns
    { pattern: /(.+?)(?:이|가)\s*(.+?)(?:을|를)?\s*(?:초래|야기)/g, relation: 'causes' },
    { pattern: /(.+?)(?:때문에|으로 인해)\s*(.+)/g, relation: 'because' },
    { pattern: /(.+?)(?:이|가)\s*(.+?)에\s*영향/g, relation: 'affects' },
    { pattern: /만약\s*(.+?)(?:이|가|라면),?\s*(.+)/g, relation: 'if-then' },
];

// Stopwords to exclude from keywords
const STOPWORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
    'that', 'which', 'who', 'whom', 'this', 'these', 'those', 'it', 'its',
    'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just',
    'i', 'me', 'my', 'myself', 'we', 'our', 'you', 'your', 'he', 'she', 'they',
    'think', 'believe', 'know', 'see', 'say', 'said', 'like', 'well', 'also',
    'really', 'actually', 'basically', 'something', 'thing', 'things'
]);

// ─────────────────────────────────────────────────────────────────────────────
// Keyword Extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractKeywords(text: string): string[] {
    // Tokenize and clean
    const words = text
        .toLowerCase()
        .replace(/[^a-zA-Z가-힣\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !STOPWORDS.has(word));

    // Count frequency
    const freq: Record<string, number> = {};
    words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });

    // Return top keywords (appearing more than once or significant)
    return Object.entries(freq)
        .filter(([_, count]) => count >= 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word]) => word);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utterance Classification (Real NLP — replaces stub)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify a spoken utterance into argumentation types using
 * pattern matching from the reasoning pattern library.
 * 
 * Priority order (highest to lowest):
 * 1. Counterargument — "however", "on the other hand", "but", "하지만"
 * 2. Evidence/Justification — "for example", "because", "evidence shows", "왜냐하면"
 * 3. Justification (causal) — "therefore", "consequently", "그래서"
 * 4. Claim — default (no argumentation markers detected)
 */
export function classifyUtterance(text: string): 'claim' | 'evidence' | 'counterargument' | 'justification' {
    if (!text || text.trim().length === 0) return 'claim';

    const lowerText = text.toLowerCase();

    // 1. Check for counterargument patterns (strongest signal)
    for (const pattern of COUNTER_ARGUMENT_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(lowerText)) {
            pattern.lastIndex = 0; // Reset for future use
            return 'counterargument';
        }
    }

    // 2. Check for evidence/justification patterns
    for (const pattern of JUSTIFICATION_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(lowerText)) {
            pattern.lastIndex = 0;
            return 'evidence';
        }
    }

    // 3. Check for causal reasoning patterns (justification)
    for (const pattern of REASONING_CAUSAL_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(lowerText)) {
            pattern.lastIndex = 0;
            return 'justification';
        }
    }

    // 4. Default: claim
    return 'claim';
}

// ─────────────────────────────────────────────────────────────────────────────
// Causal Relationship Extraction
// ─────────────────────────────────────────────────────────────────────────────

interface CausalRelation {
    from: string;
    to: string;
    relation: string;
}

function extractCausalRelations(text: string): CausalRelation[] {
    const relations: CausalRelation[] = [];

    for (const { pattern, relation } of CAUSAL_PATTERNS) {
        // Reset regex
        pattern.lastIndex = 0;

        let match;
        while ((match = pattern.exec(text)) !== null) {
            // Extract the two concepts being related
            const parts = match.slice(1).filter(p => p && p.trim().length > 0);
            if (parts.length >= 2) {
                // Clean and extract key concept from each part
                const fromKeywords = extractKeywords(parts[0]);
                const toKeywords = extractKeywords(parts[parts.length - 1]);

                if (fromKeywords.length > 0 && toKeywords.length > 0) {
                    relations.push({
                        from: fromKeywords[0],
                        to: toKeywords[0],
                        relation
                    });
                }
            }
        }
    }

    return relations;
}

// ─────────────────────────────────────────────────────────────────────────────
// Argument Graph Builder Class
// ─────────────────────────────────────────────────────────────────────────────

export class ArgumentGraphBuilder {
    private nodes: ArgumentNode[] = [];
    private edges: ArgumentEdge[] = [];
    private nodeCounter = 0;
    private keywordNodes: Map<string, string> = new Map(); // keyword -> nodeId

    private generateId(): string {
        return `node_${++this.nodeCounter}_${Date.now()}`;
    }

    /**
     * Get or create a keyword node with proper type classification
     */
    private getOrCreateKeywordNode(keyword: string, timestamp: number, type: ArgumentNode['type'] = 'claim'): string {
        const normalizedKeyword = keyword.toLowerCase().trim();

        if (this.keywordNodes.has(normalizedKeyword)) {
            return this.keywordNodes.get(normalizedKeyword)!;
        }

        const id = this.generateId();
        this.nodes.push({
            id,
            type,
            content: normalizedKeyword,
            speaker: 'user',
            timestamp
        });

        this.keywordNodes.set(normalizedKeyword, id);
        return id;
    }

    /**
     * Add a question from interviewer
     */
    addQuestion(content: string, timestamp: number): string {
        const id = this.generateId();

        // Extract keywords from question
        const keywords = extractKeywords(content);

        this.nodes.push({
            id,
            type: 'question',
            content: keywords.length > 0 ? keywords.join(', ') : content.substring(0, 50),
            speaker: 'interviewer',
            timestamp
        });

        return id;
    }

    /**
     * Process user utterance - extract keywords and causal relations
     * Now includes: speech normalization + utterance classification
     */
    processUserUtterance(text: string, timestamp: number, lastQuestionId?: string): string {
        // ── Step 0: Normalize spoken discourse ──
        const { normalized } = normalizeSpeech(text);
        const analysisText = normalized || text; // Fallback to original if normalization empties it

        // ── Step 1: Classify the utterance type ──
        const utteranceType = classifyUtterance(analysisText);

        // ── Step 2: Extract causal relationships ──
        const causalRelations = extractCausalRelations(analysisText);

        // Add causal relations to graph with proper type
        for (const rel of causalRelations) {
            const fromId = this.getOrCreateKeywordNode(rel.from, timestamp, utteranceType);
            const toId = this.getOrCreateKeywordNode(rel.to, timestamp, utteranceType);

            // Avoid duplicate edges
            const existingEdge = this.edges.find(e =>
                e.from === fromId && e.to === toId && e.relation === rel.relation
            );

            if (!existingEdge && fromId !== toId) {
                this.edges.push({
                    from: fromId,
                    to: toId,
                    relation: rel.relation as any
                });
            }
        }

        // If no causal relations found, extract standalone keywords and link them
        if (causalRelations.length === 0) {
            const keywords = extractKeywords(analysisText);
            const kwNodeIds: string[] = [];
            keywords.forEach(kw => {
                kwNodeIds.push(this.getOrCreateKeywordNode(kw, timestamp, utteranceType));
            });

            // Chain keywords together so they form a connected subgraph
            for (let i = 0; i < kwNodeIds.length - 1; i++) {
                if (kwNodeIds[i] !== kwNodeIds[i + 1]) {
                    const alreadyExists = this.edges.find(e =>
                        (e.from === kwNodeIds[i] && e.to === kwNodeIds[i + 1]) ||
                        (e.from === kwNodeIds[i + 1] && e.to === kwNodeIds[i])
                    );
                    if (!alreadyExists) {
                        this.edges.push({ from: kwNodeIds[i], to: kwNodeIds[i + 1], relation: 'relates' as any });
                    }
                }
            }

            // Connect first keyword to the question node
            if (lastQuestionId && kwNodeIds.length > 0 && kwNodeIds[0] !== lastQuestionId) {
                const alreadyExists = this.edges.find(e =>
                    e.from === lastQuestionId && e.to === kwNodeIds[0]
                );
                if (!alreadyExists) {
                    this.edges.push({ from: lastQuestionId, to: kwNodeIds[0], relation: 'responds' as any });
                }
            }
        } else if (lastQuestionId) {
            // Even with causal relations, connect them to the question
            const firstCausalNode = this.keywordNodes.get(causalRelations[0].from.toLowerCase().trim());
            if (firstCausalNode && firstCausalNode !== lastQuestionId) {
                const alreadyExists = this.edges.find(e =>
                    e.from === lastQuestionId && e.to === firstCausalNode
                );
                if (!alreadyExists) {
                    this.edges.push({ from: lastQuestionId, to: firstCausalNode, relation: 'responds' as any });
                }
            }
        }

        // Return a virtual node ID (for compatibility)
        return this.generateId();
    }

    /**
     * Calculate coherence score based on graph connectivity
     */
    private calculateCoherence(): number {
        if (this.nodes.length === 0) return 0;

        const connectedNodes = new Set(this.edges.flatMap(e => [e.from, e.to]));
        const keywordNodes = this.nodes.filter(n => n.type !== 'question').length;

        if (keywordNodes === 0) return 0;

        // Coherence based on how connected the concepts are
        const connectionRatio = connectedNodes.size / Math.max(keywordNodes, 1);
        const edgeDensity = this.edges.length / Math.max(keywordNodes, 1);

        return Math.min(100, Math.round((connectionRatio * 50) + (edgeDensity * 30)));
    }

    /**
     * Get the complete causal map
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
        this.keywordNodes.clear();
    }
}

export const argumentGraphBuilder = new ArgumentGraphBuilder();
export default ArgumentGraphBuilder;
