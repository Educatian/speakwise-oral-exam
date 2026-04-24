/**
 * AI-Powered Hierarchical Concept Network Generator
 * Uses Gemini to extract 3-level hierarchical concept networks from interview transcripts.
 * 
 * Structure:
 *   Level 0 (ROOT): 1 node — the main theoretical concept being assessed
 *   Level 1 (PILLARS): 2-4 nodes — core sub-concepts/principles
 *   Level 2 (EVIDENCE): 3-8 nodes — concrete examples, applications, tools
 */

import { chatCompleteJson } from '../services/aiClient';
import { ArgumentGraph, ArgumentNode, ArgumentEdge } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HierarchicalNode {
    id: string;
    label: string;
    level: 0 | 1 | 2;
    type: 'THEORY' | 'PRINCIPLE' | 'EXAMPLE' | 'DOMAIN' | 'TOOL';
}

export interface HierarchicalLink {
    source: string;
    target: string;
    relation: 'defines' | 'requires' | 'exemplifies' | 'enables' | 'located_in';
}

export interface HierarchicalNetwork {
    root: string;
    nodes: HierarchicalNode[];
    links: HierarchicalLink[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Template
// ─────────────────────────────────────────────────────────────────────────────

const CONCEPT_NETWORK_PROMPT = `You are a knowledge graph architect for educational assessment.

Analyze the student's oral response and build a HIERARCHICAL concept network.

## STRUCTURE RULES
The graph must have exactly 3 levels:
- Level 0 (ROOT): 1 node — the main theoretical concept being assessed
  (e.g., "situated learning")
- Level 1 (PILLARS): 2-4 nodes — core sub-concepts or principles that 
  directly define/support the root
  (e.g., "authenticity", "social interaction", "context")
- Level 2 (EVIDENCE): 3-8 nodes — concrete examples, applications, 
  or tools the student mentioned
  (e.g., "VR", "digital platform", "museum exhibit")

## NODE RULES
- Label: 1-3 words MAX, noun/concept only (no verbs, no sentences)
- Assign level: 0, 1, or 2
- Assign type: THEORY | PRINCIPLE | EXAMPLE | DOMAIN | TOOL

## LINK RULES
Links must flow from higher level to lower level (parent → child).
Use ONLY these relation types:
- "defines" (root → pillar)
- "requires" (pillar → pillar)  
- "exemplifies" (evidence → pillar)
- "enables" (tool → principle)
- "located_in" (example → domain)

## OUTPUT (strict JSON only, no explanation, no markdown)
{
  "root": "situated learning",
  "nodes": [
    {"id": "n0", "label": "situated learning", "level": 0, "type": "THEORY"},
    {"id": "n1", "label": "authenticity", "level": 1, "type": "PRINCIPLE"},
    {"id": "n2", "label": "VR simulation", "level": 2, "type": "TOOL"}
  ],
  "links": [
    {"source": "n0", "target": "n1", "relation": "defines"},
    {"source": "n2", "target": "n1", "relation": "exemplifies"}
  ]
}

## TRANSCRIPT:
`;

// ─────────────────────────────────────────────────────────────────────────────
// API Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a hierarchical concept network from transcript using Gemini AI.
 * Returns an ArgumentGraph compatible with the visualization system.
 */
export async function generateConceptNetwork(
    transcript: Array<{ speaker: string; text: string; timestamp: number }>
): Promise<ArgumentGraph> {
    // Build transcript text
    const transcriptText = transcript
        .map(t => `${t.speaker === 'user' ? 'STUDENT' : 'INTERVIEWER'}: ${t.text}`)
        .join('\n');

    // Minimum transcript length check
    if (transcriptText.length < 50) {
        return { nodes: [], edges: [], coherenceScore: 0, complexity: 0 };
    }

    try {
        const result = await chatCompleteJson<HierarchicalNetwork>(
            CONCEPT_NETWORK_PROMPT + transcriptText
        );

        if (!result.nodes || !Array.isArray(result.nodes) || result.nodes.length === 0) {
            throw new Error('Invalid network structure: no nodes');
        }

        return convertToArgumentGraph(result);
    } catch (err) {
        console.error('[ConceptNetwork] AI generation failed, falling back:', err);
        return fallbackExtraction(transcript);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversion to ArgumentGraph
// ─────────────────────────────────────────────────────────────────────────────

function convertToArgumentGraph(result: HierarchicalNetwork): ArgumentGraph {
    const nodeIdMap = new Map<string, string>();

    const nodes: ArgumentNode[] = result.nodes.map((n, i) => {
        const nodeId = `cn_${i}_${Date.now()}`;
        nodeIdMap.set(n.id, nodeId);

        // Map hierarchical type to ArgumentNode type for backwards compatibility
        const typeMap: Record<string, ArgumentNode['type']> = {
            'THEORY': 'claim',
            'PRINCIPLE': 'justification',
            'EXAMPLE': 'evidence',
            'DOMAIN': 'counterargument',
            'TOOL': 'evidence'
        };

        return {
            id: nodeId,
            type: typeMap[n.type] || 'claim',
            content: n.label,
            speaker: 'user' as const,
            timestamp: Date.now(),
            metadata: {
                conceptType: n.type,
                level: n.level
            }
        };
    });

    const edges: ArgumentEdge[] = (result.links || [])
        .filter(l => nodeIdMap.has(l.source) && nodeIdMap.has(l.target))
        .map(l => ({
            from: nodeIdMap.get(l.source)!,
            to: nodeIdMap.get(l.target)!,
            relation: l.relation
        }));

    // Calculate coherence based on connectivity
    const connectedNodes = new Set(edges.flatMap(e => [e.from, e.to]));
    const coherence = nodes.length > 0
        ? Math.round((connectedNodes.size / nodes.length) * 100)
        : 0;

    return {
        nodes,
        edges,
        coherenceScore: coherence,
        complexity: nodes.length + edges.length
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback
// ─────────────────────────────────────────────────────────────────────────────

function fallbackExtraction(
    transcript: Array<{ speaker: string; text: string; timestamp: number }>
): ArgumentGraph {
    const { ArgumentGraphBuilder } = require('./argumentGraph');
    const builder = new ArgumentGraphBuilder();
    let lastQuestionId: string | undefined;

    transcript.forEach(item => {
        if (item.speaker === 'interviewer') {
            if (item.text.includes('?')) {
                lastQuestionId = builder.addQuestion(item.text, item.timestamp);
            }
        } else {
            builder.processUserUtterance(item.text, item.timestamp, lastQuestionId);
        }
    });

    return builder.getGraph();
}

export default generateConceptNetwork;
