import type { ArgumentNode, ReflectionFocus, RubricBreakdown, Submission, TranscriptionItem } from '../../types';

export const criteria = {
    criticalThinking: 'Critical thinking',
    conceptualUnderstanding: 'Conceptual understanding',
    communicationClarity: 'Communication clarity',
    engagement: 'Engagement'
} satisfies Record<keyof RubricBreakdown, string>;

export interface Answer {
    id: string;
    index: number;
    turn: TranscriptionItem;
    prompt?: TranscriptionItem;
}

// IDs are scoped to one immutable submitted transcript, including legacy submissions.
export function answersFor(transcript: TranscriptionItem[] = []): Answer[] {
    const answers: Answer[] = [];
    let prompt: TranscriptionItem | undefined;
    transcript.forEach((turn, index) => {
        if (!turn?.text?.trim()) return;
        if (turn.speaker === 'interviewer') prompt = turn;
        if (turn.speaker === 'user') answers.push({ id: 'turn-' + (index + 1), index, turn, prompt });
    });
    return answers;
}

function normalize(text: string) {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function validFocus(focus: ReflectionFocus | undefined, answers: Answer[]) {
    if (!focus || !Object.hasOwn(criteria, focus.criterion)) return false;
    const first = answers.find(answer => answer.id === focus.initialId);
    if (!first) return false;
    if (!focus.followUpId) return true;
    const later = answers.find(answer => answer.id === focus.followUpId);
    return !!later && later.index > first.index && !!later.prompt && later.prompt !== first.prompt;
}

export function suggestFocus(submission: Submission, answers: Answer[], criterion: keyof RubricBreakdown): ReflectionFocus | undefined {
    const excerpts = submission.rubricBreakdown?.[criterion]?.evidence || [];
    const matched = new Set<string>();
    for (const entry of excerpts) {
        if (typeof entry !== 'string') continue;
        const quote = normalize(entry).replace(/^["“]|["”]$/g, '').trim();
        if (quote.length < 8) continue;
        const hits = answers.filter(answer => normalize(answer.turn.text).includes(quote));
        if (hits.length === 1) matched.add(hits[0].id);
    }
    const found = answers.filter(answer => matched.has(answer.id));
    if (!found.length) return undefined;
    const first = found[0];
    const later = found.find(answer => answer.index > first.index && answer.prompt && answer.prompt !== first.prompt);
    return { criterion, initialId: first.id, followUpId: later?.id };
}

export function initialFocus(submission: Submission, answers: Answer[]) {
    const saved = submission.instructorReview?.reflectionFocus;
    if (validFocus(saved, answers)) return saved;
    const candidates = (Object.keys(criteria) as (keyof RubricBreakdown)[])
        .map(criterion => suggestFocus(submission, answers, criterion));
    return candidates.find(focus => focus?.followUpId) ?? candidates.find(Boolean);
}

export function reasoningSpans(submission: Submission, answer: Answer) {
    const types: ArgumentNode['type'][] = ['claim', 'evidence', 'justification'];
    return types.map(type => {
        const node = submission.argumentGraph?.nodes?.find(n =>
            n.speaker === 'user' && n.type === type && n.content?.trim() &&
            answer.turn.text.includes(n.content) &&
            (n.timestamp === answer.turn.timestamp ||
             submission.transcript.filter(t => t.speaker === 'user' && t.text.includes(n.content)).length === 1));
        return { type, quote: node?.content };
    });
}

export function sentences(text: string): string[] {
    if (typeof Intl.Segmenter === 'function') {
        const items = Array.from(new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(text));
        return items.map(item => item.segment.trim()).filter(Boolean);
    }
    return [text.trim()];
}
