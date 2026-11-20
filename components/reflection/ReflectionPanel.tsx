import { Button as AstryxButton } from '@astryxdesign/core/Button';
import './reflection.css';
import React, { useId, useMemo, useState } from 'react';
import type { ReflectionFocus, RubricBreakdown, Submission } from '../../types';
import { Answer, answersFor, criteria, initialFocus, reasoningSpans, sentences, suggestFocus, validFocus } from '../../lib/reflection/evidence';
import { ClaimEvidencePair } from '../ui/ClaimEvidencePair';
import { PracticeResponse } from './PracticeResponse';

type Criterion = keyof RubricBreakdown;
const roleLabels: Record<string, string> = { claim: 'Claim', evidence: 'Evidence', justification: 'How they connect' };

function SourceTurn({ answer, title, submission }: { answer: Answer; title: string; submission: Submission }) {
    const sourceId = useId();
    const [excerpt, setExcerpt] = useState('');
    const at = excerpt ? answer.turn.text.indexOf(excerpt) : -1;
    return <article className="reflection-source">
        <strong>{title}</strong><small>Turn {answer.index + 1}</small>
        {answer.prompt && <p className="reflection-question">{answer.prompt.text}</p>}
        <blockquote id={sourceId}>{at < 0 ? answer.turn.text : <>
            {answer.turn.text.slice(0, at)}<mark>{excerpt}</mark>{answer.turn.text.slice(at + excerpt.length)}
        </>}</blockquote>
        <details><summary>Trace the reasoning</summary>
            <ol className="reflection-map">{reasoningSpans(submission, answer).map(({type, quote}) =>
                <li key={type}>{quote ? <button type="button" className="results-tab" aria-controls={sourceId}
                    aria-pressed={at >= 0 && excerpt === quote} onClick={() => setExcerpt(excerpt === quote ? '' : quote)}>
                    {roleLabels[type]}</button> : <><strong>{roleLabels[type]}</strong><span>No linked excerpt</span></>}</li>)}</ol>
        </details>
    </article>;
}

function EvidencePair({ submission, answers, focus, confirmed }: {
    submission: Submission; answers: Answer[]; focus: ReflectionFocus; confirmed: boolean;
}) {
    if (!validFocus(focus, answers)) return null;
    const first = answers.find(a => a.id === focus.initialId)!;
    const second = answers.find(a => a.id === focus.followUpId);
    return <section>
        <h4>{criteria[focus.criterion]}</h4>
        <p className="reflection-caption">{confirmed ? 'Selected by your instructor' : 'Suggested from matching rubric excerpts'}</p>
        <div className="reflection-comparison">
            <SourceTurn title={second ? 'First answer in this pair' : 'Answer linked to this criterion'} answer={first} submission={submission} />
            {second && <SourceTurn title={confirmed ? 'Answer after the follow-up' : 'Later answer · check the question'} answer={second} submission={submission} />}
        </div>
    </section>;
}

export function ReflectionPanel({ submission }: { submission: Submission }) {
    const answers = useMemo(() => answersFor(submission.transcript), [submission.transcript]);
    const [selectedId, setSelectedId] = useState('');
    const [quote, setQuote] = useState('');
    const [compared, setCompared] = useState(false);
    const answer = answers.find(a => a.id === selectedId);
    const focus = initialFocus(submission, answers);
    const sentenceOptions = answer ? sentences(answer.turn.text) : [];
    if (!answers.length) return <section className="reflection-panel"><h3>Reflect on your answer</h3><p>No student response was captured for this attempt.</p></section>;
    return <section className="reflection-panel">
        <h3>Reflect on your answer</h3>
        <p>Where did you explain your thinking most clearly? Pick your own words before opening the feedback.</p>
        <fieldset className="sw-passage-picker">
            <legend>Choose a sentence from the transcript</legend>
            <div className="sw-turn-list">{answers.map(a => <div className="sw-turn" key={a.id}>
                <small>Turn {a.index + 1}</small>
                {a.prompt && <p className="reflection-question">{a.prompt.text}</p>}
                {sentences(a.turn.text).map((sentence, i) => <label className="reflection-choice" key={i}>
                    <input type="radio" name={'quote-' + submission.id} checked={selectedId === a.id && quote === String(i)}
                        onChange={() => { setSelectedId(a.id); setQuote(String(i)); setCompared(false); }} />
                    <span>{sentence}</span>
                </label>)}
            </div>)}</div>
        </fieldset>
        {!compared && <AstryxButton type="button" label="Compare with feedback" variant="primary" isDisabled={!answer || quote === ''} clickAction={() => setCompared(true)} />}
        {compared && answer && quote !== '' && <>
            {focus && answer.id !== focus.initialId && answer.id !== focus.followUpId &&
                <SourceTurn submission={submission} answer={answer} title="Your selected answer" />}
            {focus ? <EvidencePair submission={submission} answers={answers} focus={focus} confirmed={validFocus(submission.instructorReview?.reflectionFocus, answers)} /> :
                <section><p className="reflection-caption">No rubric excerpt could be linked to a specific turn. Review your selected answer.</p>
                    <SourceTurn submission={submission} answer={answer} title="Your selected answer" /></section>}
            {submission.argumentGraph && <ClaimEvidencePair graph={submission.argumentGraph} transcript={submission.transcript} answerTurnIndex={answer.index} />}
            <PracticeResponse submissionId={submission.id} answer={answer} quote={sentenceOptions[Number(quote)]} transferPrompt={focus?.transferPrompt} />
        </>}
    </section>;
}

export function FocusEditor({ submission, value, onChange, disabled }: {
    submission: Submission; value?: ReflectionFocus; onChange: (focus: ReflectionFocus | undefined) => void; disabled: boolean;
}) {
    const answers = useMemo(() => answersFor(submission.transcript), [submission.transcript]);
    const suggested = initialFocus(submission, answers);
    const focus = value || suggested;
    const criterion = focus?.criterion || 'criticalThinking';
    const initial = answers.find(a => a.id === focus?.initialId);
    const laterOptions = initial ? answers.filter(a => a.index > initial.index && a.prompt && a.prompt !== initial.prompt) : [];
    if (!answers.length) return null;
    function update(change: Partial<ReflectionFocus>) {
        onChange({ criterion, initialId: initial?.id || answers[0].id, ...focus, ...change });
    }
    return <fieldset className="reflection-panel" disabled={disabled}>
        <legend>Student reflection evidence</legend>
        <p>Choose the criterion and the original answers the student should revisit. Select a later answer only if its question follows up on the first.</p>
        <label>Feedback criterion<select aria-label="Feedback criterion" value={criterion} onChange={e => {
            const key = e.target.value as Criterion;
            const hit = suggestFocus(submission, answers, key);
            onChange({ criterion: key, initialId: hit?.initialId ?? initial?.id ?? answers[0].id, followUpId: hit?.followUpId, transferPrompt: focus?.transferPrompt });
        }}>{Object.entries(criteria).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <div className="sw-turn-list" role="group" aria-label="Choose answers from the transcript">{answers.map(a => {
            const first = a.id === initial?.id;
            const later = a.id === focus?.followUpId;
            return <div className="sw-turn" key={a.id}>
                <small>Turn {a.index + 1}</small>
                {a.prompt && <p className="reflection-question">{a.prompt.text}</p>}
                <blockquote>{a.turn.text}</blockquote>
                <div className="sw-turn-actions">
                    <button type="button" className="results-tab" aria-label={`Use turn ${a.index + 1} as first answer`} aria-pressed={first}
                        onClick={() => { if (!first) update({ initialId: a.id, followUpId: undefined }); }}>First answer</button>
                    <button type="button" className="results-tab" aria-label={`Use turn ${a.index + 1} as follow-up`} aria-pressed={later}
                        disabled={!laterOptions.includes(a)} onClick={() => update({followUpId: later ? undefined : a.id})}>Follow-up</button>
                </div>
            </div>;
        })}</div>
        <label>New practice question (optional)<textarea aria-label="New practice question (optional)" rows={2} value={focus?.transferPrompt || ''} onChange={e => update({transferPrompt:e.target.value})} /></label>
        {focus && validFocus(focus, answers) && <EvidencePair submission={submission} answers={answers} focus={focus} confirmed={!!value} />}
        {focus && !value && <button className="results-tab" type="button" onClick={() => onChange(focus)}>Use suggested evidence</button>}
        {value && <button className="results-tab" type="button" onClick={() => onChange(undefined)}>Use automatic matching</button>}
    </fieldset>;
}
