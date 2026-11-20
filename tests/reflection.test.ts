import { describe, expect, it } from 'vitest';
import type { Submission } from '../types';
import { answersFor, initialFocus, reasoningSpans, sentences, suggestFocus, validFocus } from '../lib/reflection/evidence';

const submission: Submission = {
    id: 'sample', studentName: 'Learner', timestamp: 1, score: 80, feedback: '',
    transcript: [
        {speaker:'interviewer',text:'Why?',timestamp:1},
        {speaker:'user',text:'The sign changed.',timestamp:2},
        {speaker:'interviewer',text:'Give a reason.',timestamp:3},
        {speaker:'user',text:'The sign changed. The slope reversed.',timestamp:4}
    ],
    rubricBreakdown:{
        conceptualUnderstanding:{score:18,evidence:['The slope reversed.']},
        criticalThinking:{score:19,evidence:['The sign changed.']},
        communicationClarity:{score:20,evidence:[]}, engagement:{score:23,evidence:[]}
    }
};
const answers = answersFor(submission.transcript);
describe('reflection provenance', () => {
    it('keeps the original turn numbers and prompt context', () => {
        expect(answers.map(a => a.id)).toEqual(['turn-2','turn-4']);
        expect(answers[1].prompt?.text).toEqual('Give a reason.');
    });
    it('omits ambiguous quotes and never fabricates a follow-up', () => {
        expect(suggestFocus(submission, answers, 'criticalThinking')).toBeUndefined();
        expect(initialFocus(submission, answers)).toMatchObject({initialId:'turn-4',followUpId:undefined});
    });
    it('rejects stale, reversed and same-prompt follow-up links', () => {
        const focus = {criterion:'engagement',initialId:'turn-2',followUpId:'turn-4'} as const;
        expect(validFocus(focus, answers)).toBe(true);
        expect(validFocus({...focus,initialId:'missing'}, answers)).toBe(false);
        expect(validFocus({...focus,initialId:'turn-4',followUpId:'turn-2'}, answers)).toBe(false);
        expect(validFocus(focus, [answers[0], {...answers[1],prompt:answers[0].prompt}])).toBe(false);
    });
    it('shows only argument spans actually present in the selected answer', () => {
        const sub = {...submission, argumentGraph:{coherenceScore:0,complexity:0,edges:[],nodes:[
            {id:'c',type:'claim' as const,speaker:'user' as const,content:'The sign changed.',timestamp:2}
        ]}};
        expect(reasoningSpans(sub,answers[0])[0].quote).toBe('The sign changed.');
        expect(reasoningSpans(sub,answers[1])[0].quote).toBeUndefined();
    });
    it('supports older records and preserves selected wording', () => {
        expect(answersFor(undefined)).toEqual([]);
        const original = '첫 주장입니다. My reason follows.';
        expect(sentences(original).every(part => original.includes(part))).toBe(true);
    });
});
