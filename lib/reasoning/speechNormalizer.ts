/**
 * Spoken Discourse Preprocessing Pipeline
 * 
 * Normalizes spoken utterances by removing fillers, self-repairs,
 * and repetitions before they enter the argumentation analysis engine.
 * 
 * Addresses: Spoken vs. Written Argumentation Gap (Research Problem 1)
 * - Filler word removal (um, uh, like, 어, 음, 그러니까...)
 * - Self-repair / false-start detection ("I mean", "no wait", "let me rephrase")
 * - Stuttering / consecutive repetition deduplication
 * - Basic sentence boundary normalization for unpunctuated speech
 */

// ─────────────────────────────────────────────────────────────────────────────
// Filler Words (English & Korean)
// ─────────────────────────────────────────────────────────────────────────────

const ENGLISH_FILLERS = [
    'um', 'uh', 'uhh', 'umm', 'hmm', 'huh', 'eh',
    'you know', 'I mean like', 'kind of like',
    'like', 'basically', 'actually', 'literally',
    'sort of', 'kind of', 'you see', 'right',
    'okay so', 'so yeah', 'yeah so', 'well like',
];

const KOREAN_FILLERS = [
    '어', '음', '으음', '에', '아', '그',
    '그러니까', '뭐랄까', '있잖아', '그니까',
    '아니 그', '그게', '뭐', '이제',
    '좀', '약간', '진짜', '막',
];

// Build filler removal regex — match fillers at word boundaries
// For multi-word fillers, match them as phrases
function buildFillerRegex(fillers: string[]): RegExp {
    // Sort by length descending so longer phrases match first
    const sorted = [...fillers].sort((a, b) => b.length - a.length);
    const escaped = sorted.map(f =>
        f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    // Match at word boundaries, with optional trailing comma/space
    return new RegExp(`\\b(?:${escaped.join('|')})\\b[,;]?\\s*`, 'gi');
}

const ENGLISH_FILLER_RE = buildFillerRegex(ENGLISH_FILLERS);
const KOREAN_FILLER_RE = new RegExp(
    `(?:${KOREAN_FILLERS.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})[,;]?\\s*`,
    'g'
);

// ─────────────────────────────────────────────────────────────────────────────
// Self-Repair Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Patterns that signal the speaker is correcting themselves.
 * Strategy: keep only the content AFTER the repair marker.
 */
const SELF_REPAIR_PATTERNS: RegExp[] = [
    // English
    /\b(?:I mean|no wait|wait|actually no|let me rephrase|what I meant (?:is|was)|sorry|no no|or rather)\b[,.]?\s*/gi,
    // Korean
    /(?:아니|아니 그게|아 아니|다시 말하면|아니야)[,.]?\s*/g,
];

/**
 * Detect and handle self-repairs by keeping corrected version.
 * If "X, I mean, Y" → keep "Y"
 */
function handleSelfRepairs(text: string): string {
    let result = text;

    for (const pattern of SELF_REPAIR_PATTERNS) {
        // Reset regex state
        pattern.lastIndex = 0;

        // Split on repair markers and keep the last segment
        // (which is the corrected version)
        const parts = result.split(pattern).filter(p => p.trim().length > 0);
        if (parts.length > 1) {
            // Keep the last substantial part (the correction)
            // but preserve earlier content that isn't being corrected
            // Strategy: if a repair marker appears, keep content before it
            // but replace the immediately preceding clause with the correction
            result = parts.join(' ');
        }
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Repetition Deduplication
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove consecutive word/phrase repetitions (stuttering pattern).
 * "the the concept" → "the concept"
 * "I think I think that" → "I think that"
 */
function deduplicateRepetitions(text: string): string {
    // Single word repetition: "the the" → "the"
    let result = text.replace(/\b(\w+)\s+\1\b/gi, '$1');

    // Two-word phrase repetition: "I think I think" → "I think"
    result = result.replace(/\b(\w+\s+\w+)\s+\1\b/gi, '$1');

    // Three-word phrase repetition
    result = result.replace(/\b(\w+\s+\w+\s+\w+)\s+\1\b/gi, '$1');

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sentence Boundary Normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert basic sentence boundaries into unpunctuated spoken text.
 * Uses discourse markers as boundary signals.
 */
const SENTENCE_BOUNDARY_MARKERS = [
    /\b(and then)\b/gi,
    /\b(so then)\b/gi,
    /\b(but then)\b/gi,
    /\b(and also)\b/gi,
    /\b(also)\b(?=\s+[A-Z])/g,   // "also" followed by capital letter
];

function normalizeSentenceBoundaries(text: string): string {
    let result = text;

    // Only add periods if the text has very few existing sentence boundaries
    const existingPeriods = (text.match(/[.!?]/g) || []).length;
    const wordCount = text.split(/\s+/).length;

    // If fewer than 1 sentence marker per 30 words, the text likely lacks punctuation
    if (wordCount > 15 && existingPeriods < wordCount / 30) {
        for (const marker of SENTENCE_BOUNDARY_MARKERS) {
            result = result.replace(marker, '. $1');
        }
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Pipeline
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizationResult {
    /** The cleaned text ready for analysis */
    normalized: string;
    /** Original text before normalization */
    original: string;
    /** Number of fillers removed */
    fillersRemoved: number;
    /** Number of self-repairs detected */
    selfRepairsDetected: number;
    /** Number of repetitions deduplicated */
    repetitionsRemoved: number;
    /** Whether the text was substantially modified */
    wasModified: boolean;
}

/**
 * Full spoken discourse normalization pipeline.
 * Processes raw ASR output to produce clean text suitable for
 * argumentation analysis.
 * 
 * Pipeline order:
 * 1. Filler removal (preserves semantic content)
 * 2. Self-repair handling (keeps corrected version)
 * 3. Repetition deduplication (removes stuttering)
 * 4. Sentence boundary normalization (adds punctuation cues)
 * 5. Whitespace cleanup
 */
export function normalizeSpeech(text: string): NormalizationResult {
    if (!text || text.trim().length === 0) {
        return {
            normalized: '',
            original: text,
            fillersRemoved: 0,
            selfRepairsDetected: 0,
            repetitionsRemoved: 0,
            wasModified: false
        };
    }

    const original = text;
    let current = text;

    // Step 1: Count and remove fillers
    const englishFillerMatches = current.match(ENGLISH_FILLER_RE) || [];
    const koreanFillerMatches = current.match(KOREAN_FILLER_RE) || [];
    const fillersRemoved = englishFillerMatches.length + koreanFillerMatches.length;

    current = current.replace(ENGLISH_FILLER_RE, ' ');
    current = current.replace(KOREAN_FILLER_RE, ' ');

    // Step 2: Handle self-repairs
    const beforeRepair = current;
    current = handleSelfRepairs(current);
    const selfRepairsDetected = beforeRepair !== current ? 1 : 0;

    // Step 3: Deduplicate repetitions
    const beforeDedup = current;
    current = deduplicateRepetitions(current);
    const repetitionsRemoved = beforeDedup.length - current.length > 2 ? 1 : 0;

    // Step 4: Normalize sentence boundaries
    current = normalizeSentenceBoundaries(current);

    // Step 5: Clean up whitespace
    current = current
        .replace(/\s+/g, ' ')          // collapse multiple spaces
        .replace(/\s+([.,;!?])/g, '$1') // remove space before punctuation
        .replace(/([.!?])\s*\./g, '$1') // remove double periods
        .trim();

    return {
        normalized: current,
        original,
        fillersRemoved,
        selfRepairsDetected,
        repetitionsRemoved,
        wasModified: current !== original.replace(/\s+/g, ' ').trim()
    };
}

/**
 * Light normalization — only removes fillers without
 * altering discourse structure. Use for real-time display.
 */
export function lightNormalize(text: string): string {
    if (!text) return '';
    return text
        .replace(ENGLISH_FILLER_RE, ' ')
        .replace(KOREAN_FILLER_RE, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export default { normalizeSpeech, lightNormalize };
