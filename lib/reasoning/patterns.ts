/**
 * Reasoning Pattern Detection Library
 * NLP-based pattern matching for reasoning quality assessment
 */

// ─────────────────────────────────────────────────────────────────────────────
// Pattern Definitions
// ─────────────────────────────────────────────────────────────────────────────

/** Causal/Mechanistic Explanation Patterns */
export const CAUSAL_PATTERNS: RegExp[] = [
    /because\s+/gi,
    /therefore\s+/gi,
    /as a result\s*/gi,
    /this leads to/gi,
    /consequently/gi,
    /due to\s+/gi,
    /since\s+/gi,
    /that's why/gi,
    /for this reason/gi,
    /which causes/gi,
    /results in/gi,
    // Korean patterns
    /때문에/g,
    /그래서/g,
    /따라서/g,
    /결과적으로/g,
    /그러므로/g
];

/** Justification/Evidence Patterns */
export const JUSTIFICATION_PATTERNS: RegExp[] = [
    /the reason (is|being)/gi,
    /this (shows|demonstrates|proves)/gi,
    /evidence (suggests|shows|indicates)/gi,
    /for example/gi,
    /for instance/gi,
    /according to/gi,
    /based on/gi,
    /this is supported by/gi,
    /research (shows|suggests|indicates)/gi,
    // Korean patterns
    /예를 들어/g,
    /왜냐하면/g,
    /근거로는/g,
    /이유는/g
];

/** Generalization/Abstraction Patterns */
export const GENERALIZATION_PATTERNS: RegExp[] = [
    /in general/gi,
    /generally speaking/gi,
    /this applies to (all|every|most)/gi,
    /broadly speaking/gi,
    /as a (rule|principle)/gi,
    /overall/gi,
    /in most cases/gi,
    /typically/gi,
    /usually/gi,
    // Korean patterns
    /일반적으로/g,
    /보통은/g,
    /대부분의 경우/g
];

/** Counter-Argument/Concession Patterns */
export const COUNTER_ARGUMENT_PATTERNS: RegExp[] = [
    /however/gi,
    /on the other hand/gi,
    /but (that|this|it)/gi,
    /although/gi,
    /despite this/gi,
    /nevertheless/gi,
    /while (it's|this is) true/gi,
    /I (see|understand) your point, but/gi,
    /that's a good point, however/gi,
    // Korean patterns
    /하지만/g,
    /그러나/g,
    /반면에/g,
    /그럼에도/g
];

/** Rephrasing/Clarification Patterns */
export const REPHRASING_PATTERNS: RegExp[] = [
    /in other words/gi,
    /what I mean is/gi,
    /to put it (differently|another way)/gi,
    /let me (explain|clarify)/gi,
    /I should (clarify|rephrase)/gi,
    /basically/gi,
    /essentially/gi,
    // Korean patterns
    /다시 말해서/g,
    /즉,/g,
    /다른 말로 하면/g
];

// ─────────────────────────────────────────────────────────────────────────────
// Toulmin Model Patterns (6 Components)
// ─────────────────────────────────────────────────────────────────────────────

/** Warrant patterns — WHY the data supports the claim */
export const WARRANT_PATTERNS: RegExp[] = [
    /this is important because/gi,
    /the reason this matters/gi,
    /this (means|implies|suggests) that/gi,
    /which (shows|tells us|indicates) that/gi,
    /so we can (see|conclude|infer) that/gi,
    /in other words,? this/gi,
    /the (logic|principle|reasoning) here is/gi,
    // Korean
    /이것이 중요한 이유는/g,
    /이는 .*을 의미/g,
    /즉,? 이것은/g,
];

/** Backing patterns — external authority/support for warrants */
export const BACKING_PATTERNS: RegExp[] = [
    /studies have shown/gi,
    /research (has demonstrated|confirms|supports)/gi,
    /historically/gi,
    /experts (agree|suggest|argue)/gi,
    /it is (well-?known|established|accepted) that/gi,
    /in the (literature|field|discipline)/gi,
    /as (noted|described|explained) by/gi,
    /according to (the|recent) (research|data|findings)/gi,
    // Korean
    /연구에 따르면/g,
    /학자들은.*주장/g,
    /전문가들의 의견에 의하면/g,
    /이론적으로/g,
];

/** Qualifier patterns — degree of certainty/hedging */
export const QUALIFIER_PATTERNS: RegExp[] = [
    /probably/gi,
    /in most cases/gi,
    /it seems (likely|probable)/gi,
    /there is a (good|strong|fair) chance/gi,
    /generally/gi,
    /presumably/gi,
    /as far as I know/gi,
    /to my (knowledge|understanding)/gi,
    /it appears that/gi,
    /tends? to/gi,
    // Korean
    /아마도/g,
    /대체로/g,
    /보통.*경우/g,
    /.*것 같습니다/g,
    /.*일 수 있/g,
];

/** Rebuttal patterns — conditions that defeat the claim */
export const REBUTTAL_PATTERNS: RegExp[] = [
    /unless/gi,
    /except (when|if|in)/gi,
    /this (wouldn't|doesn't|won't) apply (if|when)/gi,
    /a (?:key |notable )?(?:limitation|exception|caveat) is/gi,
    /the (counter-?argument|objection|criticism) (?:is|would be)/gi,
    /one could argue that/gi,
    /it is worth noting that/gi,
    /the (weakness|flaw|problem) with this is/gi,
    // Korean
    /단,? .*경우/g,
    /예외적으로/g,
    /제한점은/g,
    /반박할.*있는.*점은/g,
];

// ─────────────────────────────────────────────────────────────────────────────
// Toulmin Analysis Interface & Function
// ─────────────────────────────────────────────────────────────────────────────

export interface ToulminComponent {
    detected: boolean;
    count: number;
    examples: string[];
}

export interface ToulminAnalysis {
    claim: ToulminComponent;       // Default: every utterance
    data: ToulminComponent;        // Maps to JUSTIFICATION_PATTERNS
    warrant: ToulminComponent;     // WARRANT_PATTERNS
    backing: ToulminComponent;     // BACKING_PATTERNS
    qualifier: ToulminComponent;   // QUALIFIER_PATTERNS
    rebuttal: ToulminComponent;    // REBUTTAL_PATTERNS + COUNTER_ARGUMENT_PATTERNS
    /** 0-100: How complete is the argument structure? */
    completenessScore: number;
    /** Which components are missing? */
    missingComponents: string[];
}

function analyzeToulminComponent(text: string, patterns: RegExp[]): ToulminComponent {
    const match = findMatches(text, patterns);
    return {
        detected: match.count > 0,
        count: match.count,
        examples: match.examples
    };
}

/**
 * Analyze text for Toulmin argument model completeness.
 * Maps the 6 Toulmin components to NLP patterns and returns
 * a structured assessment of argument quality.
 */
export function analyzeToulminComponents(text: string): ToulminAnalysis {
    const claim: ToulminComponent = {
        detected: text.trim().length > 0,
        count: 1, // Each utterance is at minimum a claim
        examples: [text.substring(0, 80)]
    };

    const data = analyzeToulminComponent(text, JUSTIFICATION_PATTERNS);
    const warrant = analyzeToulminComponent(text, WARRANT_PATTERNS);
    const backing = analyzeToulminComponent(text, BACKING_PATTERNS);
    const qualifier = analyzeToulminComponent(text, QUALIFIER_PATTERNS);
    const rebuttal = analyzeToulminComponent(text,
        [...REBUTTAL_PATTERNS, ...COUNTER_ARGUMENT_PATTERNS]
    );

    // Calculate completeness (weighted)
    const weights = {
        claim: 0.10,      // Always present
        data: 0.25,       // Most important after claim
        warrant: 0.25,    // Critical for logical connection
        backing: 0.15,    // External support
        qualifier: 0.10,  // Epistemic sophistication
        rebuttal: 0.15    // Counter-consideration
    };

    const completenessScore = Math.round(
        (claim.detected ? weights.claim : 0) +
        (data.detected ? weights.data : 0) +
        (warrant.detected ? weights.warrant : 0) +
        (backing.detected ? weights.backing : 0) +
        (qualifier.detected ? weights.qualifier : 0) +
        (rebuttal.detected ? weights.rebuttal : 0)
    ) * 100;

    const missingComponents: string[] = [];
    if (!data.detected) missingComponents.push('Data/Evidence');
    if (!warrant.detected) missingComponents.push('Warrant (logical bridge)');
    if (!backing.detected) missingComponents.push('Backing (external support)');
    if (!qualifier.detected) missingComponents.push('Qualifier (certainty degree)');
    if (!rebuttal.detected) missingComponents.push('Rebuttal (counter-consideration)');

    return {
        claim,
        data,
        warrant,
        backing,
        qualifier,
        rebuttal,
        completenessScore,
        missingComponents
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Functions
// ─────────────────────────────────────────────────────────────────────────────

export interface PatternMatch {
    pattern: string;
    count: number;
    examples: string[];
}

export interface ReasoningPatternResult {
    causal: PatternMatch;
    justification: PatternMatch;
    generalization: PatternMatch;
    counterArgument: PatternMatch;
    rephrasing: PatternMatch;
}

/**
 * Find all matches for a pattern set in text
 */
function findMatches(text: string, patterns: RegExp[]): PatternMatch {
    const examples: string[] = [];
    let totalCount = 0;

    for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) {
            totalCount += matches.length;
            // Extract surrounding context (up to 50 chars each side)
            const regex = new RegExp(`.{0,30}${pattern.source}.{0,50}`, 'gi');
            const contextMatches = text.match(regex);
            if (contextMatches) {
                examples.push(...contextMatches.slice(0, 3)); // Keep top 3 examples
            }
        }
    }

    return {
        pattern: patterns[0].source,
        count: totalCount,
        examples: [...new Set(examples)].slice(0, 5) // Deduplicate, limit to 5
    };
}

/**
 * Analyze text for all reasoning patterns
 */
export function analyzeReasoningPatterns(text: string): ReasoningPatternResult {
    return {
        causal: findMatches(text, CAUSAL_PATTERNS),
        justification: findMatches(text, JUSTIFICATION_PATTERNS),
        generalization: findMatches(text, GENERALIZATION_PATTERNS),
        counterArgument: findMatches(text, COUNTER_ARGUMENT_PATTERNS),
        rephrasing: findMatches(text, REPHRASING_PATTERNS)
    };
}

/**
 * Calculate reasoning rubric scores from pattern analysis
 */
export function calculateReasoningScores(patterns: ReasoningPatternResult, fullText?: string): {
    explicitJustification: { score: number; count: number; examples: string[] };
    causalExplanation: { score: number; patterns: string[] };
    counterArgumentHandling: { score: number; attempts: number };
    abstractionGeneralization: { score: number; instances: string[] };
    toulminAnalysis?: ToulminAnalysis;
    overallReasoningScore: number;
} {
    // Score calculation (0-5 scale for each dimension)
    const justScore = Math.min(5, patterns.justification.count);
    const causalScore = Math.min(5, patterns.causal.count);
    const counterScore = Math.min(5, patterns.counterArgument.count * 2); // Weight counter-arguments more
    const abstractScore = Math.min(5, patterns.generalization.count);

    // Toulmin analysis (if full text is provided)
    const toulmin = fullText ? analyzeToulminComponents(fullText) : undefined;

    // Overall score (0-100) — now includes Toulmin completeness
    const baseScore = ((justScore + causalScore + counterScore + abstractScore) / 20) * 100;
    const toulminBonus = toulmin ? (toulmin.completenessScore * 0.2) : 0;
    const overallScore = Math.min(100, Math.round(baseScore + toulminBonus));

    return {
        explicitJustification: {
            score: justScore,
            count: patterns.justification.count,
            examples: patterns.justification.examples
        },
        causalExplanation: {
            score: causalScore,
            patterns: patterns.causal.examples
        },
        counterArgumentHandling: {
            score: counterScore,
            attempts: patterns.counterArgument.count
        },
        abstractionGeneralization: {
            score: abstractScore,
            instances: patterns.generalization.examples
        },
        toulminAnalysis: toulmin,
        overallReasoningScore: overallScore
    };
}

/**
 * Detect if current text is a rephrasing of previous text
 */
export function detectRephrasing(current: string, previous: string): boolean {
    if (!previous || !current) return false;

    // Check for explicit rephrasing markers
    for (const pattern of REPHRASING_PATTERNS) {
        if (pattern.test(current)) return true;
    }

    // Simple word overlap check (basic semantic similarity)
    const currentWords = new Set(current.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const previousWords = new Set(previous.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    let overlap = 0;
    for (const word of currentWords) {
        if (previousWords.has(word)) overlap++;
    }

    // If >40% word overlap with different structure, likely rephrasing
    const overlapRatio = overlap / Math.max(currentWords.size, 1);
    return overlapRatio > 0.4 && current !== previous;
}

/**
 * Detect if student is taking initiative (introducing new topics)
 */
export function detectTurnInitiative(userText: string, aiQuestion: string): boolean {
    // Initiative indicators
    const initiativePatterns = [
        /I (also|additionally) want to (mention|add|say)/gi,
        /another (thing|point|aspect) is/gi,
        /let me (also|add|mention)/gi,
        /speaking of which/gi,
        /this reminds me/gi,
        /I'd like to (add|point out)/gi,
        // Korean
        /그리고 추가로/g,
        /덧붙이자면/g,
        /또한/g
    ];

    for (const pattern of initiativePatterns) {
        if (pattern.test(userText)) return true;
    }

    // If response is significantly longer than typical and introduces new terms
    return userText.length > 200 && !aiQuestion.toLowerCase().includes('elaborate');
}

export default {
    analyzeReasoningPatterns,
    calculateReasoningScores,
    analyzeToulminComponents,
    detectRephrasing,
    detectTurnInitiative
};
