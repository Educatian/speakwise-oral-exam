import React, { useEffect, useRef, useState } from 'react';
import type { CuePose, mountCue } from './cueStage';

type Stage = ReturnType<typeof mountCue>;

export function InterviewerAvatar({ pose, request = 0 }: { pose: CuePose; request?: number }) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const stage = useRef<Stage | null>(null);
    const currentPose = useRef(pose);
    const [ready, setReady] = useState(false);
    const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    useEffect(() => {
        const media = matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setReduced(media.matches);
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);
    useEffect(() => {
        currentPose.current = pose;
        stage.current?.play(pose, request > 0);
    }, [pose, request]);
    useEffect(() => {
        setReady(false);
        if (reduced) return;
        let cancelled = false;
        const fallback = () => {
            if (cancelled) return;
            setReady(false);
            stage.current?.dispose();
            stage.current = null;
        };
        import('./cueStage').then(({ mountCue }) => {
            if (cancelled || !canvas.current) return;
            stage.current = mountCue(canvas.current, () => setReady(true), fallback);
            stage.current.play(currentPose.current);
        }).catch(fallback);
        return () => {
            cancelled = true;
            stage.current?.dispose();
            stage.current = null;
        };
    }, [reduced]);

    return <div aria-hidden="true" className="cue-stage">
        {!ready && <img src="/interviewer/cue.png" alt="" />}
        <canvas ref={canvas} style={{ opacity: ready ? 1 : 0 }} />
    </div>;
}

export function StudentAvatar({ courseId, defaultVisible, speaking, recording, studentSpeaking, completedAnswers, preparing, finished = false }: {
    courseId: string; defaultVisible: boolean; speaking: boolean; recording: boolean; studentSpeaking: boolean; completedAnswers: number; preparing: boolean; finished?: boolean;
}) {
    const key = 'speakwise:avatar:' + courseId;
    const [visible, setVisible] = useState(() => {
        try {
            const pref = localStorage.getItem(key);
            return pref === null ? defaultVisible : pref === 'show';
        } catch { return defaultVisible; }
    });
    const [inviting, setInviting] = useState(false);
    const listenedThisTurn = useRef(false);
    const [listeningPose, setListeningPose] = useState<CuePose>('listen');
    useEffect(() => {
        setInviting(recording);
        listenedThisTurn.current = false;
        if (!recording) return;
        const timeout = window.setTimeout(() => setInviting(false), 2450);
        return () => window.clearTimeout(timeout);
    }, [recording]);
    useEffect(() => {
        if (studentSpeaking) setInviting(false);
    }, [studentSpeaking, recording]);
    useEffect(() => {
        if (preparing && visible) {
            setListeningPose('listen');
            const timers = [
                window.setTimeout(() => setListeningPose('consider'), 4800),
                window.setTimeout(() => setListeningPose('stretch'), 12000),
                window.setTimeout(() => setListeningPose('yawn'), 26000)
            ];
            return () => timers.forEach(window.clearTimeout);
        }
        if (!recording || speaking) {
            setListeningPose('listen');
            return;
        }
        if (studentSpeaking) {
            setListeningPose(completedAnswers % 2 === 0 ? 'lean' : 'focus');
            if (listenedThisTurn.current) return;
            const attention = window.setTimeout(() => {
                listenedThisTurn.current = true;
                setListeningPose('attend');
            }, 1900);
            return () => window.clearTimeout(attention);
        }
        // Keep listening through brief gaps between words.
        const settle = window.setTimeout(() => setListeningPose('listen'), 850);
        const wait = window.setTimeout(() => setListeningPose(completedAnswers % 2 === 0 ? 'consider' : 'fold'), 3500);
        return () => { window.clearTimeout(settle); window.clearTimeout(wait); };
    }, [recording, speaking, studentSpeaking, completedAnswers, preparing, visible]);
    const askingPose = (['speak','pinpoint','explain'] as const)[completedAnswers % 3];
    const invitation = completedAnswers % 2 === 0 ? 'offer' : 'invite';
    // Applause thanks the student for finishing. It plays once and says nothing about the score.
    const pose = finished ? 'applaud' : speaking ? askingPose : recording && inviting && !studentSpeaking ? invitation : listeningPose;
    return <div className="cue-controls">
        <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300">AI interviewer</span>
            <button type="button" aria-expanded={visible} className="text-xs text-emerald-300 underline"
                onClick={() => {
                    const next = !visible;
                    setVisible(next);
                    try { localStorage.setItem(key, next ? 'show' : 'hide'); } catch { /* Session choice still applies. */ }
                }}>{visible ? 'Hide avatar' : 'Show avatar'}</button>
        </div>
        {visible && <InterviewerAvatar pose={pose} />}
    </div>;
}

export function TeacherAvatarPreview() {
    const [preview, setPreview] = useState<'closed' | CuePose>('closed');
    const [manualRequest, setManualRequest] = useState(0);
    useEffect(() => {
        const sequence: Partial<Record<typeof preview, readonly [CuePose, number]>> = {
            speak: ['offer', 3500], offer: ['consider', 2450], consider: ['lean', 2800],
            lean: ['attend', 1900], attend: ['pinpoint', 4000], pinpoint: ['focus', 4000]
        };
        const step = sequence[preview];
        if (manualRequest || !step) return;
        const timer = window.setTimeout(() => setPreview(step[0]), step[1]);
        return () => window.clearTimeout(timer);
    }, [preview, manualRequest]);
    return <div>
        <button type="button" className="text-xs text-emerald-300 underline" onClick={() => {
            setManualRequest(0);
            setPreview(preview === 'closed' ? 'speak' : 'closed');
        }}>
            {preview === 'closed' ? 'Preview turn-taking' : 'Close preview'}
        </button>
        {preview !== 'closed' && <>
            <InterviewerAvatar pose={preview} request={manualRequest} />
            <div className="flex flex-wrap justify-center gap-3">
                {([['offer','Invite an answer'],['attend','Listen closely'],['pinpoint','Emphasize a detail'],
                    ['consider','Think it over'],['yawn','Cover a yawn'],['stretch','Stretch'],['applaud','Applaud at the end']] as const).map(([pose,label]) =>
                    <button key={pose} type="button" className="text-xs text-emerald-300 underline"
                        onClick={() => { setPreview(pose); setManualRequest(value => value+1); }}>{label}</button>)}
            </div>
            <p className="text-sm text-center" role="status">{['speak','explain','pinpoint'].includes(preview) ? 'Asking a question' : ['invite','offer'].includes(preview) ? 'Your turn' : preview === 'fold' || preview === 'consider' ? 'Waiting for a response' : preview === 'stretch' || preview === 'yawn' ? 'Before the interview' : preview === 'applaud' ? 'Interview completed' : 'Listening'}</p>
        </>}
    </div>;
}
