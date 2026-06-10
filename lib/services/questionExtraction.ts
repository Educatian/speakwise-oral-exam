/**
 * Document-grounded oral-exam question extraction.
 *
 * Short sources go through a single LLM pass. Long sources use a RAG-style
 * map → reduce: each chunk is mined for key points + candidate questions in
 * parallel, then a consolidation pass synthesizes one knowledge base and a
 * deduplicated, Bloom-spanning question set. This keeps extraction faithful to
 * the whole document instead of silently truncating to the first N characters.
 */
import { chatCompleteJson } from './aiClient';

export interface ExtractedExam {
    knowledgeBase: string;
    questions: string[];
}

export interface ExtractionSource {
    name: string;
    text: string;
}

// Below this combined length, one pass sees the whole document.
const SINGLE_CALL_CHAR_LIMIT = 14000;
// Per-chunk budget for the map phase (paragraph-aligned).
const CHUNK_CHARS = 8000;

const QUESTION_GUIDANCE = `Write questions an expert oral examiner would actually ask. Each must:
- be answerable ONLY from genuine understanding of THIS material (not generic trivia),
- span Bloom's levels overall (a couple of explain/understand, several apply/analyze, at least one evaluate/justify),
- be open-ended (never yes/no), a single question, ending with "?".`;

/** Split on paragraph boundaries, hard-splitting any oversized paragraph. */
function chunkText(text: string, size: number): string[] {
    if (text.length <= size) return [text];
    const chunks: string[] = [];
    let current = '';
    for (const para of text.split(/\n\s*\n/)) {
        if (para.length > size) {
            if (current) { chunks.push(current); current = ''; }
            for (let i = 0; i < para.length; i += size) chunks.push(para.slice(i, i + size));
            continue;
        }
        if (current.length + para.length + 2 > size && current) {
            chunks.push(current);
            current = '';
        }
        current = current ? `${current}\n\n${para}` : para;
    }
    if (current) chunks.push(current);
    return chunks;
}

function normalize(parsed: any): ExtractedExam {
    const questions = Array.isArray(parsed?.questions)
        ? parsed.questions.map((q: any) => String(q).trim()).filter(Boolean)
        : [];
    return {
        knowledgeBase: typeof parsed?.knowledgeBase === 'string' ? parsed.knowledgeBase.trim() : '',
        questions
    };
}

async function singlePass(joined: string, courseName: string): Promise<ExtractedExam> {
    const prompt = `You are designing an oral examination from course materials for the course "${courseName || 'this course'}".

From the document(s) below, produce:
1. "knowledgeBase": a 2-3 paragraph summary of the key concepts, definitions, and learning objectives the student is expected to master.
2. "questions": 6-8 high-quality oral-exam questions grounded in this specific material.

${QUESTION_GUIDANCE}

Return ONLY this JSON (no markdown fences):
{"knowledgeBase":"...","questions":["...?","...?"]}

${joined}`;
    const parsed = await chatCompleteJson<ExtractedExam>(prompt, { temperature: 0.4 });
    return normalize(parsed);
}

async function mapReduce(sources: ExtractionSource[], courseName: string): Promise<ExtractedExam> {
    const chunks: ExtractionSource[] = [];
    for (const source of sources) {
        for (const piece of chunkText(source.text, CHUNK_CHARS)) {
            chunks.push({ name: source.name, text: piece });
        }
    }

    // MAP — mine each chunk independently (in parallel).
    const mapped = await Promise.all(
        chunks.map(async (chunk, index) => {
            const prompt = `This is excerpt ${index + 1} of course material for "${courseName || 'a course'}".
Extract:
1. "keyPoints": 3-6 of the most exam-worthy concepts/facts in THIS excerpt (short phrases).
2. "candidateQuestions": 2-4 oral-exam questions answerable from THIS excerpt. ${QUESTION_GUIDANCE}

Return ONLY JSON: {"keyPoints":["..."],"candidateQuestions":["...?"]}

${chunk.text}`;
            try {
                return await chatCompleteJson<{ keyPoints?: string[]; candidateQuestions?: string[] }>(
                    prompt,
                    { temperature: 0.4 }
                );
            } catch {
                return { keyPoints: [], candidateQuestions: [] };
            }
        })
    );

    const keyPoints = mapped.flatMap((m) => m.keyPoints || []);
    const candidates = mapped.flatMap((m) => m.candidateQuestions || []);

    if (keyPoints.length === 0 && candidates.length === 0) {
        throw new Error('Could not extract any usable content from the document(s).');
    }

    // REDUCE — consolidate across the whole document.
    const reducePrompt = `You are finalizing an oral examination for "${courseName || 'a course'}".
Below are key points and candidate questions extracted from across the full material.

KEY POINTS:
${keyPoints.map((k) => `- ${k}`).join('\n')}

CANDIDATE QUESTIONS:
${candidates.map((q) => `- ${q}`).join('\n')}

Produce:
1. "knowledgeBase": a coherent 2-3 paragraph synthesis of what the student must master (merge and deduplicate the key points).
2. "questions": the 6-8 strongest, NON-redundant questions. Prefer the candidates but rewrite for clarity, remove duplicates and near-duplicates, and ensure they span Bloom's levels. ${QUESTION_GUIDANCE}

Return ONLY JSON: {"knowledgeBase":"...","questions":["...?"]}`;

    // The reduce call is the single funnel for all the parallel map work on a
    // long document. Retry once, then fall back to assembling a result directly
    // from the mined content rather than discarding everything on a transient
    // LLM/JSON hiccup.
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const parsed = normalize(await chatCompleteJson<ExtractedExam>(reducePrompt, { temperature: 0.4 }));
            if (parsed.questions.length > 0) return parsed;
        } catch (err) {
            console.warn(`[questionExtraction] reduce attempt ${attempt + 1} failed:`, err);
        }
    }

    // Fallback: dedupe the mined candidates and synthesize a light knowledge base.
    const dedupedQuestions = Array.from(
        new Map(candidates.map((q) => [q.trim().toLowerCase(), q.trim()])).values()
    ).filter(Boolean).slice(0, 8);
    const dedupedKeyPoints = Array.from(new Set(keyPoints.map((k) => k.trim()).filter(Boolean)));
    const knowledgeBase = dedupedKeyPoints.length
        ? `Key concepts drawn from the uploaded material:\n- ${dedupedKeyPoints.join('\n- ')}`
        : '';
    return { knowledgeBase, questions: dedupedQuestions };
}

/**
 * Build a knowledge base + oral-exam question set from one or more documents.
 * Routes short inputs through a single pass and long inputs through map→reduce.
 */
export async function extractExamFromText(
    sources: ExtractionSource[],
    courseName: string
): Promise<ExtractedExam> {
    const usable = sources.filter((s) => s.text && s.text.trim().length > 0);
    if (usable.length === 0) {
        throw new Error('No readable text could be extracted from the uploaded file(s).');
    }

    const joined = usable.map((s) => `--- File: ${s.name} ---\n${s.text}`).join('\n\n');
    const result = joined.length <= SINGLE_CALL_CHAR_LIMIT
        ? await singlePass(joined, courseName)
        : await mapReduce(usable, courseName);

    if (result.questions.length === 0) {
        throw new Error('The document was read, but no questions could be generated from it.');
    }
    return result;
}
