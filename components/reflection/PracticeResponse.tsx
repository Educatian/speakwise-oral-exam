import React, { useEffect, useRef, useState } from 'react';
import type { Answer } from '../../lib/reflection/evidence';
import { Practice, readPractice, removePractice, savePractice } from '../../lib/reflection/practice';

function Playback({ audio }: { audio: Blob }) {
    const [url, setUrl] = useState('');
    useEffect(() => {
        const next = URL.createObjectURL(audio);
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [audio]);
    return url ? <audio controls className="reflection-audio" src={url} aria-label="Play practice response" /> : null;
}

export function PracticeResponse({ submissionId, answer, quote, transferPrompt }: {
    submissionId: string; answer: Answer; quote: string; transferPrompt?: string;
}) {
    const revision = 'Say your answer again and explain why your example supports your claim.';
    const [prompt, setPrompt] = useState(revision);
    const [text, setText] = useState('');
    const [audio, setAudio] = useState<Blob>();
    const [history, setHistory] = useState<Practice[]>([]);
    const [phase, setPhase] = useState<'ready'|'requesting'|'recording'|'stopping'|'saving'>('ready');
    const [notice, setNotice] = useState('');
    const alive = useRef(true);
    const recorder = useRef<MediaRecorder | null>(null);
    const pending = useRef(false);

    useEffect(() => {
        alive.current = true;
        let current = true;
        readPractice(submissionId).then(items => { if (current) setHistory(items); })
            .catch(() => { if (current) setNotice('Device storage is unavailable. You can still rehearse here.'); });
        return () => {
            current = false;
            alive.current = false;
            const active = recorder.current;
            if (active) {
                active.onstop = null;
                if (active.state !== 'inactive') active.stop();
                active.stream.getTracks().forEach(t => t.stop());
            }
        };
    }, [submissionId]);

    async function record() {
        if (pending.current || phase !== 'ready') return;
        pending.current = true;
        setPhase('requesting');
        setNotice('');
        let stream: MediaStream | undefined;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (!alive.current) { stream.getTracks().forEach(t => t.stop()); return; }
            const active = new MediaRecorder(stream);
            recorder.current = active;
            const chunks: Blob[] = [];
            let failed = false;
            active.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
            active.onerror = () => { failed = true; setNotice('Recording failed. Try again or type your response.'); };
            active.onstop = () => {
                active.stream.getTracks().forEach(t => t.stop());
                recorder.current = null;
                if (!alive.current) return;
                if (!failed && chunks.length) setAudio(new Blob(chunks, { type: active.mimeType || chunks[0].type }));
                else if (!failed) setNotice('No audio was captured. Record again or type your answer.');
                setPhase('ready');
            };
            active.start();
            setPhase('recording');
        } catch {
            stream?.getTracks().forEach(t => t.stop());
            if (alive.current) { setNotice('Microphone unavailable. You can type your practice answer below.'); setPhase('ready'); }
        } finally { pending.current = false; }
    }

    async function save() {
        if (pending.current || phase !== 'ready' || (!text.trim() && !audio)) return;
        pending.current = true;
        setPhase('saving');
        try {
            const items = await savePractice({ id: crypto.randomUUID(), submissionId, createdAt: Date.now(),
                answerId: answer.id, original: quote, prompt, text: text.trim(), audio });
            if (alive.current) { setHistory(items); setText(''); setAudio(undefined); setNotice('Practice saved on this device.'); }
        } catch {
            if (alive.current) setNotice('Could not save on this device. Your response is still here.');
        } finally { pending.current = false; if (alive.current) setPhase('ready'); }
    }
    const canRecord = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    return <section className="reflection-practice">
        <h4>Try your answer again</h4>
        {transferPrompt && <label>Practice question
            <select aria-label="Practice question" value={prompt} disabled={phase !== 'ready' || !!audio || !!text} onChange={e => setPrompt(e.target.value)}>
                <option value={revision}>Revise this answer</option><option value={transferPrompt}>Apply it to a new question</option>
            </select></label>}
        <p>{prompt}</p>
        <div className="reflection-comparison">
            {prompt === revision && <div><strong>Your original words</strong><blockquote>{quote}</blockquote></div>}
            <div><label>Practice response<textarea aria-label="Practice response" rows={3} value={text} disabled={phase === 'saving'} onChange={e => setText(e.target.value)} placeholder="Type your answer or record it below." /></label>
                {canRecord && <button type="button" className="results-tab" disabled={phase !== 'ready' && phase !== 'recording'}
                    onClick={() => {
                        if (phase === 'recording' && recorder.current?.state === 'recording') { setPhase('stopping'); recorder.current.stop(); }
                        else void record();
                    }}>{phase === 'recording' ? 'Stop recording' : phase === 'requesting' ? 'Waiting for microphone…' : audio ? 'Record again' : 'Record response'}</button>}
                {audio && <Playback audio={audio} />}
            </div>
        </div>
        <p className="reflection-caption">Practice stays on this device and is separate from your submitted grade.</p>
        <button type="button" className="results-tab results-tab-active" disabled={phase !== 'ready' || (!text.trim() && !audio)} onClick={save}>Save practice</button>
        <p role="status">{notice}</p>
        {history.length > 0 && <details><summary>Saved practice ({history.length})</summary>
            {history.map(item => <article key={item.id}>
                <strong>{new Date(item.createdAt).toLocaleString()}</strong><p>{item.prompt}</p>
                <div className="reflection-comparison"><div><strong>Original</strong><blockquote>{item.original}</blockquote></div>
                    <div><strong>Practice</strong>{item.text && <p>{item.text}</p>}{item.audio && <Playback audio={item.audio} />}</div></div>
                <button type="button" className="results-tab" disabled={phase !== 'ready'} onClick={async () => {
                    try { setHistory(await removePractice(item)); setNotice('Practice removed from this device.'); }
                    catch { setNotice('Could not remove this practice.'); }
                }}>Remove practice</button>
            </article>)}</details>}
    </section>;
}
