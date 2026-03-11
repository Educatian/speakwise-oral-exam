/**
 * AI-Powered Concept Network Generator
 * Uses Gemini to extract meaningful semantic concept networks from interview transcripts.
 * Produces structured graphs with typed nodes (CORE, EXAMPLE, CONTEXT, ATTRIBUTE)
 * and directed relationship links (defines, enables, exemplifies, etc.)
 */

import { GoogleGenAI } from '@google/genai';
import { ArgumentGraph, ArgumentNode, ArgumentEdge } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ConceptNode {
    id: string;
    label: string;
    type: 'CORE' | 'EXAMPLE' | 'CONTEXT' | 'ATTRIBUTE';
}

interface ConceptLink {
    source: string;
    target: string;
    relation: string;
}

interface ConceptNetworkResult {
    nodes: ConceptNode[];
    links: ConceptLink[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Template
// ─────────────────────────────────────────────────────────────────────────────

const CONCEPT_NETWORK_PROMPT = `You are an expert learning analyst. Analyze the following interview transcript and extract a concept network that captures the student's understanding.

## NODE RULES
1. Extract only MEANINGFUL CONCEPTS (nouns/noun phrases), not filler words or full sentences
2. Classify each node into ONE category:
   - CORE: Central theoretical concepts (e.g., "situated learning", "Lave & Wenger")
   - EXAMPLE: Concrete examples given (e.g., "VR", "digital platform")
   - CONTEXT: Contextual domains mentioned (e.g., "library", "museum")
   - ATTRIBUTE: Descriptive qualities (e.g., "authenticity", "social interaction")
3. Keep node labels SHORT (1-3 words max)
4. Limit to 8-15 most important nodes

## LINK RULES
1. Use SPECIFIC relationship types only:
   - defines: A defines B
   - enables: A enables B
   - exemplifies: A exemplifies B
   - located_in: A located in B
   - requires: A requires B
   - supports: A supports B
   - contrasts: A contrasts B
2. Every link must have a clear directional meaning
3. Avoid generic "relates" — always choose the most precise type

## OUTPUT FORMAT (strict JSON only, no markdown)
{
  "nodes": [
    {"id": "n1", "label": "situated learning", "type": "CORE"},
    {"id": "n2", "label": "authenticity", "type": "ATTRIBUTE"}
  ],
  "links": [
    {"source": "n1", "target": "n2", "relation": "requires"},
    {"source": "n3", "target": "n1", "relation": "exemplifies"}
  ]
}

## QUALITY CHECK before output:
- Are all node labels ≤ 3 words? ✓
- Is every link type specific (not "relates")? ✓
- Do the links form a meaningful semantic structure, not just a chain? ✓
- Are core academic concepts clearly distinguished from examples? ✓

## TRANSCRIPT:
`;

// ─────────────────────────────────────────────────────────────────────────────
// API Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a concept network from transcript using Gemini AI.
 * Returns an ArgumentGraph compatible with the existing visualization system.
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
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: CONCEPT_NETWORK_PROMPT + transcriptText,
            config: {
                responseMimeType: 'application/json',
            }
        });

        const text = response.text?.trim();
        if (!text) throw new Error('Empty response from Gemini');

        const result: ConceptNetworkResult = JSON.parse(text);

        // Validate & convert to ArgumentGraph format
        return convertToArgumentGraph(result);
    } catch (err) {
        console.error('[ConceptNetwork] AI generation failed, falling back to basic extraction:', err);
        return fallbackExtraction(transcript);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversion
// ─────────────────────────────────────────────────────────────────────────────

/** Map concept node types to ArgumentNode types */
const NODE_TYPE_MAP: Record<string, ArgumentNode['type']> = {
    'CORE': 'claim',
    'EXAMPLE': 'evidence',
    'CONTEXT': 'justification',
    'ATTRIBUTE': 'counterargument'
};

function convertToArgumentGraph(result: ConceptNetworkResult): ArgumentGraph {
    if (!result.nodes || !Array.isArray(result.nodes)) {
        return { nodes: [], edges: [], coherenceScore: 0, complexity: 0 };
    }

    const nodeIdMap = new Map<string, string>();

    const nodes: ArgumentNode[] = result.nodes.map((n, i) => {
        const nodeId = `concept_${i}_${Date.now()}`;
        nodeIdMap.set(n.id, nodeId);
        return {
            id: nodeId,
            type: NODE_TYPE_MAP[n.type] || 'claim',
            content: n.label,
            speaker: 'user' as const,
            timestamp: Date.now(),
            // Store original concept type as metadata
            metadata: { conceptType: n.type }
        };
    });

    const edges: ArgumentEdge[] = (result.links || [])
        .filter(l => nodeIdMap.has(l.source) && nodeIdMap.has(l.target))
        .map(l => ({
            from: nodeIdMap.get(l.source)!,
            to: nodeIdMap.get(l.target)!,
            relation: l.relation
        }));

    // Calculate coherence
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
// Fallback (if API fails)
// ─────────────────────────────────────────────────────────────────────────────

function fallbackExtraction(
    transcript: Array<{ speaker: string; text: string; timestamp: number }>
): ArgumentGraph {
    // Simple keyword extraction fallback
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
