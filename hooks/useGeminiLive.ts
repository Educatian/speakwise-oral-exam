import { useState, useEffect, useRef, useCallback } from 'react';
import { LiveServerMessage } from '@google/genai';
import {
    InterviewStatus,
    TranscriptionItem,
    UseGeminiLiveReturn,
    TurnPhase,
    LatencyMetrics,
    BargeInEvent,
    DialogueMetrics,
    ArgumentGraph,
    RawTranscriptTurn
} from '../types';
import { GeminiWebsocketClient } from '../lib/services/GeminiWebsocketClient';
import { AudioStreamService } from '../lib/services/AudioStreamService';
import { CapturedAudioTurn, TranscriptionService } from '../lib/services/TranscriptionService';
import {
    analyzeReasoningPatterns,
    calculateReasoningScores,
    detectRephrasing,
    detectTurnInitiative,
    ArgumentGraphBuilder
} from '../lib/reasoning';
import {
    DEFAULT_LATENCY_METRICS,
    DEFAULT_DIALOGUE_METRICS,
    calculateLatencyMetrics
} from '../lib/voice/analyticsUtils';

interface UseGeminiLiveOptions {
    systemInstruction: string;
    voiceName?: string;
    onTranscriptionComplete?: (transcriptions: TranscriptionItem[]) => void;
    silenceThresholdMs?: number;
    minTurnDurationMs?: number;
}

export function useGeminiLive(options: UseGeminiLiveOptions): UseGeminiLiveReturn {
    const {
        systemInstruction,
        voiceName = 'Kore',
        onTranscriptionComplete,
        silenceThresholdMs = 3000,
        minTurnDurationMs = 700
    } = options;

    const [status, setStatus] = useState<InterviewStatus>(InterviewStatus.IDLE);
    const [transcriptions, setTranscriptions] = useState<TranscriptionItem[]>([]);
    const transcriptionsRef = useRef<TranscriptionItem[]>([]);
    const [isInterviewerSpeaking, setIsInterviewerSpeaking] = useState(false);
    const [isUserSpeaking, setIsUserSpeaking] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const [pendingUserText, setPendingUserText] = useState('');
    const [pendingAIText, setPendingAIText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [turnPhase, setTurnPhase] = useState<TurnPhase>('idle');
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [recognitionNotice, setRecognitionNotice] = useState<string | null>(null);

    const [latencyMetrics, setLatencyMetrics] = useState<LatencyMetrics>(DEFAULT_LATENCY_METRICS);
    const [bargeInEvents, setBargeInEvents] = useState<BargeInEvent[]>([]);
    const [rawTranscriptTurns, setRawTranscriptTurns] = useState<RawTranscriptTurn[]>([]);
    const [failedTranscriptions, setFailedTranscriptions] = useState<RawTranscriptTurn[]>([]);
    const [dialogueMetrics, setDialogueMetrics] = useState<DialogueMetrics>(DEFAULT_DIALOGUE_METRICS);
    const [argumentGraph, setArgumentGraph] = useState<ArgumentGraph>({ nodes: [], edges: [], coherenceScore: 0, complexity: 0 });

    const audioServiceRef = useRef<AudioStreamService | null>(null);
    const sessionRef = useRef<GeminiWebsocketClient | null>(null);
    const transcriptionServiceRef = useRef<TranscriptionService | null>(null);

    const lastTurnEndTimeRef = useRef<number>(0);
    const userSpeakingTimeRef = useRef<number>(0);
    const interviewerSpeakingTimeRef = useRef<number>(0);
    const latencyListRef = useRef<number[]>([]);
    const argumentGraphBuilderRef = useRef<ArgumentGraphBuilder>(new ArgumentGraphBuilder());
    const lastQuestionIdRef = useRef<string>('');
    const previousUserTextRef = useRef<string>('');
    const rawTranscriptTurnsRef = useRef<RawTranscriptTurn[]>([]);
    const failedTranscriptionsRef = useRef<RawTranscriptTurn[]>([]);
    const pendingBargeInRef = useRef<BargeInEvent | null>(null);

    const aiTextBufferRef = useRef<string>('');
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const recordingStartTimeRef = useRef<number>(0);
    const audioEndTimerRef = useRef<NodeJS.Timeout | null>(null);
    const turnPhaseRef = useRef<TurnPhase>('idle');

    // ── Connection resilience ────────────────────────────────────────────────
    // A transient WebSocket drop should auto-recover instead of ending the exam.
    const intentionalCloseRef = useRef(false);      // true => an expected close (end/cleanup/END_INTERVIEW)
    const reconnectingRef = useRef(false);          // a reconnect cycle is in flight
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
    const sessionGenRef = useRef(0);                // invalidates callbacks from superseded sockets
    const maxRecordingTimerRef = useRef<NodeJS.Timeout | null>(null);
    // Deferred timers that schedule setState/sendText — tracked so teardown can
    // cancel them (otherwise they fire post-unmount and can re-arm leaked timers).
    const nextTurnTimerRef = useRef<NodeJS.Timeout | null>(null);     // turnComplete → next recording phase
    const endedTimerRef = useRef<NodeJS.Timeout | null>(null);        // [END_INTERVIEW] → ENDED
    const postTranscriptTimerRef = useRef<NodeJS.Timeout | null>(null); // user text → send to examiner
    const mountedRef = useRef(true);
    // Indirection so functions defined earlier can call later-defined ones
    // without violating declaration order / creating useCallback cycles.
    const stopRecordingRef = useRef<() => void>(() => {});
    const attemptReconnectRef = useRef<() => void>(() => {});
    const establishConnectionRef = useRef<(isReconnect: boolean) => Promise<void>>(async () => {});

    const MAX_RECONNECT_ATTEMPTS = 4;
    const MAX_RECORDING_MS = 90000; // hard stop so a missed silence event can't strand the recorder

    useEffect(() => {
        turnPhaseRef.current = turnPhase;
    }, [turnPhase]);

    const syncRawTurns = useCallback((next: RawTranscriptTurn[]) => {
        rawTranscriptTurnsRef.current = next;
        setRawTranscriptTurns(next);
    }, []);

    const syncFailedTurns = useCallback((next: RawTranscriptTurn[]) => {
        failedTranscriptionsRef.current = next;
        setFailedTranscriptions(next);
    }, []);

    const appendTranscription = useCallback((item: TranscriptionItem) => {
        transcriptionsRef.current = [...transcriptionsRef.current, item];
        setTranscriptions(transcriptionsRef.current);
    }, []);

    const appendRawTurn = useCallback((turn: RawTranscriptTurn) => {
        syncRawTurns([...rawTranscriptTurnsRef.current, turn]);
    }, [syncRawTurns]);

    const patchRawTurn = useCallback((turnId: string, updates: Partial<RawTranscriptTurn>) => {
        syncRawTurns(
            rawTranscriptTurnsRef.current.map((turn) =>
                turn.id === turnId ? { ...turn, ...updates } : turn
            )
        );
    }, [syncRawTurns]);

    const queueFailedTurn = useCallback((turn: RawTranscriptTurn) => {
        syncFailedTurns([turn, ...failedTranscriptionsRef.current.filter((item) => item.id !== turn.id)]);
    }, [syncFailedTurns]);

    const updateLatencyMetrics = useCallback(() => {
        return calculateLatencyMetrics(
            latencyListRef.current,
            userSpeakingTimeRef.current,
            interviewerSpeakingTimeRef.current
        );
    }, []);

    const cleanup = useCallback(() => {
        // Any teardown is, by definition, an expected close — never reconnect.
        intentionalCloseRef.current = true;
        reconnectingRef.current = false;
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
        if (maxRecordingTimerRef.current) {
            clearTimeout(maxRecordingTimerRef.current);
            maxRecordingTimerRef.current = null;
        }
        if (nextTurnTimerRef.current) {
            clearTimeout(nextTurnTimerRef.current);
            nextTurnTimerRef.current = null;
        }
        if (endedTimerRef.current) {
            clearTimeout(endedTimerRef.current);
            endedTimerRef.current = null;
        }
        if (postTranscriptTimerRef.current) {
            clearTimeout(postTranscriptTimerRef.current);
            postTranscriptTimerRef.current = null;
        }
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }
        if (audioEndTimerRef.current) {
            clearTimeout(audioEndTimerRef.current);
            audioEndTimerRef.current = null;
        }
        if (audioServiceRef.current) {
            audioServiceRef.current.cleanup();
            audioServiceRef.current = null;
        }
        if (sessionRef.current) {
            try {
                sessionRef.current.disconnect();
            } catch {
                // no-op
            }
            sessionRef.current = null;
        }
        transcriptionsRef.current = [];
    }, []);

    const noteBargeInIfNeeded = useCallback(() => {
        if (pendingBargeInRef.current) return;

        const interruptedContent = (pendingAIText || aiTextBufferRef.current)
            .replace('[END_INTERVIEW]', '')
            .trim();

        pendingBargeInRef.current = {
            timestamp: Date.now(),
            interruptedContent: interruptedContent || 'AI response in progress',
            studentUtterance: '',
            interpretationType: 'unknown',
            recoveredFromTranscript: false
        };
    }, [pendingAIText]);

    const processCapturedTurn = useCallback(async (
        capturedTurn: CapturedAudioTurn,
        latency?: number
    ): Promise<{ text: string | null; isBargeIn: boolean; outcome: 'ok' | 'too_short' | 'failed' | 'empty' }> => {
        const isBargeIn = !!pendingBargeInRef.current;
        const rawTurnBase: RawTranscriptTurn = {
            id: capturedTurn.id,
            speaker: 'user',
            timestamp: capturedTurn.createdAt,
            durationMs: capturedTurn.durationMs,
            sampleCount: capturedTurn.sampleCount,
            audioBase64: capturedTurn.wavBase64,
            status: 'pending',
            latency,
            isBargeIn
        };

        appendRawTurn(rawTurnBase);

        if (capturedTurn.durationMs < minTurnDurationMs) {
            const tooShortTurn: RawTranscriptTurn = {
                ...rawTurnBase,
                status: 'too_short',
                error: `Captured audio was shorter than the ${minTurnDurationMs}ms minimum turn length.`
            };
            patchRawTurn(capturedTurn.id, tooShortTurn);
            queueFailedTurn(tooShortTurn);
            if (pendingBargeInRef.current) {
                setBargeInEvents((current) => [
                    ...current,
                    {
                        ...pendingBargeInRef.current,
                        studentUtterance: '[too short to transcribe]',
                        recoveredFromTranscript: false
                    }
                ]);
                pendingBargeInRef.current = null;
            }
            return { text: null, isBargeIn, outcome: 'too_short' };
        }

        const result = await transcriptionServiceRef.current!.transcribeCapturedTurn(capturedTurn);
        if (result.text && result.text.trim()) {
            const userText = result.text.trim();
            patchRawTurn(capturedTurn.id, {
                status: 'transcribed',
                transcriptText: userText
            });

            if (pendingBargeInRef.current) {
                const completedBargeIn: BargeInEvent = {
                    ...pendingBargeInRef.current,
                    studentUtterance: userText,
                    interpretationType: userText.endsWith('?') ? 'correction' : 'confidence',
                    recoveredFromTranscript: true
                };
                setBargeInEvents((current) => [...current, completedBargeIn]);
                pendingBargeInRef.current = null;
            }

            return { text: userText, isBargeIn, outcome: 'ok' };
        }

        // No usable text. A clean (non-throwing) empty result means the model
        // judged the audio to contain no intelligible speech — that's silence or
        // room noise, NOT a transcription failure. Don't queue it as a failed
        // turn (which would otherwise cap evaluation confidence and mislead the
        // instructor's analytics).
        if (!result.error) {
            patchRawTurn(capturedTurn.id, {
                status: 'empty',
                error: 'No intelligible speech detected.'
            });
            if (pendingBargeInRef.current) {
                setBargeInEvents((current) => [
                    ...current,
                    {
                        ...pendingBargeInRef.current,
                        studentUtterance: '[no speech detected]',
                        recoveredFromTranscript: false
                    }
                ]);
                pendingBargeInRef.current = null;
            }
            return { text: null, isBargeIn, outcome: 'empty' };
        }

        const failedTurn: RawTranscriptTurn = {
            ...rawTurnBase,
            status: 'failed',
            error: result.error
        };
        patchRawTurn(capturedTurn.id, failedTurn);
        queueFailedTurn(failedTurn);
        if (pendingBargeInRef.current) {
            setBargeInEvents((current) => [
                ...current,
                {
                    ...pendingBargeInRef.current,
                    studentUtterance: '[transcription failed]',
                    recoveredFromTranscript: false
                }
            ]);
            pendingBargeInRef.current = null;
        }
        return { text: null, isBargeIn, outcome: 'failed' };
    }, [appendRawTurn, minTurnDurationMs, patchRawTurn, queueFailedTurn]);

    const startRecordingPhase = useCallback(() => {
        // A deferred turn-boundary timer can fire after the session ended or the
        // component unmounted; don't re-arm recording (and a 90s max-record timer)
        // on a torn-down session.
        if (intentionalCloseRef.current || !mountedRef.current) return;
        setTurnPhase('recording');
        recordingStartTimeRef.current = Date.now();
        setPendingUserText('');

        if (transcriptionServiceRef.current) {
            transcriptionServiceRef.current.startAccumulating();
        }

        // Safety net: if VAD never fires a silence event (very soft speaker,
        // sustained background noise), force the turn closed so the session
        // can't get stuck in 'recording' forever.
        if (maxRecordingTimerRef.current) {
            clearTimeout(maxRecordingTimerRef.current);
        }
        maxRecordingTimerRef.current = setTimeout(() => {
            maxRecordingTimerRef.current = null;
            if (turnPhaseRef.current === 'recording') {
                stopRecordingRef.current();
            }
        }, MAX_RECORDING_MS);
    }, []);

    const stopRecording = useCallback(() => {
        if (turnPhaseRef.current !== 'recording' && turnPhaseRef.current !== 'idle') {
            return;
        }

        setTurnPhase('transcribing');

        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }
        if (maxRecordingTimerRef.current) {
            clearTimeout(maxRecordingTimerRef.current);
            maxRecordingTimerRef.current = null;
        }

        if (transcriptionServiceRef.current) {
            transcriptionServiceRef.current.stopAccumulating();
        }

        const speakingDuration = Date.now() - recordingStartTimeRef.current;
        userSpeakingTimeRef.current += speakingDuration;

        if (!transcriptionServiceRef.current || !transcriptionServiceRef.current.hasAudio()) {
            startRecordingPhase();
            return;
        }

        const latency = lastTurnEndTimeRef.current > 0
            ? recordingStartTimeRef.current - lastTurnEndTimeRef.current
            : 0;
        const normalizedLatency = latency > 0 && latency < 60000 ? latency : undefined;
        const capturedTurn = transcriptionServiceRef.current.consumeCurrentTurn();

        if (!capturedTurn) {
            startRecordingPhase();
            return;
        }

        processCapturedTurn(capturedTurn, normalizedLatency)
            .then(({ text, isBargeIn, outcome }) => {
                if (!text) {
                    // Tell the student why nothing happened, then let them retry.
                    if (outcome === 'failed') {
                        setRecognitionNotice("I didn't catch that clearly. Please repeat your answer.");
                    } else if (outcome === 'too_short') {
                        setRecognitionNotice('That was very brief — please say a bit more.');
                    } else if (outcome === 'empty') {
                        setRecognitionNotice("I didn't hear an answer — go ahead whenever you're ready.");
                    }
                    startRecordingPhase();
                    return;
                }

                setRecognitionNotice(null);
                const now = Date.now();
                setPendingUserText(text);

                if (normalizedLatency) {
                    latencyListRef.current.push(normalizedLatency);
                }

                appendTranscription({
                    speaker: 'user',
                    text,
                    timestamp: now,
                    latency: normalizedLatency,
                    duration: speakingDuration,
                    isBargeIn
                });

                try {
                    argumentGraphBuilderRef.current.processUserUtterance(
                        text,
                        now,
                        lastQuestionIdRef.current || undefined
                    );
                    setArgumentGraph(argumentGraphBuilderRef.current.getGraph());
                } catch (graphError) {
                    console.error('Argument graph error:', graphError);
                }

                const isRephrasing = detectRephrasing(text, previousUserTextRef.current);
                const isInitiative = detectTurnInitiative(text, '');

                setDialogueMetrics((current) => {
                    const nextFollowUpDepth = [...current.followUpDepth, text.length];
                    return {
                        ...current,
                        turnInitiatives: current.turnInitiatives + (isInitiative ? 1 : 0),
                        rephrasingEvents: current.rephrasingEvents + (isRephrasing ? 1 : 0),
                        followUpDepth: nextFollowUpDepth,
                        avgFollowUpDepth: Math.round(
                            nextFollowUpDepth.reduce((sum, value) => sum + value, 0) / nextFollowUpDepth.length
                        )
                    };
                });

                previousUserTextRef.current = text;
                setLatencyMetrics(updateLatencyMetrics());

                postTranscriptTimerRef.current = setTimeout(() => {
                    postTranscriptTimerRef.current = null;
                    setPendingUserText('');

                    if (sessionRef.current) {
                        setTurnPhase('ai_speaking');
                        sessionRef.current.sendText(text);
                    }
                }, 1500);
            })
            .catch((transcriptionError) => {
                console.error('[TurnBased] Transcription failed:', transcriptionError);
                startRecordingPhase();
            });
    }, [appendTranscription, processCapturedTurn, startRecordingPhase, updateLatencyMetrics]);

    // Initialize the microphone + audio pipeline. Extracted so the reconnect
    // path can reuse the already-running mic instead of re-prompting the user.
    const initAudio = useCallback(async () => {
        audioServiceRef.current = new AudioStreamService();
        await audioServiceRef.current.initialize({
            onAudioLevel: (level) => setAudioLevel(level),
            onVoiceActivity: (isSpeaking) => {
                setIsUserSpeaking(isSpeaking);

                if (turnPhaseRef.current === 'ai_speaking' && isSpeaking) {
                    noteBargeInIfNeeded();
                }

                if (turnPhaseRef.current !== 'recording') {
                    return;
                }

                if (isSpeaking) {
                    if (silenceTimerRef.current) {
                        clearTimeout(silenceTimerRef.current);
                        silenceTimerRef.current = null;
                    }
                } else if (!silenceTimerRef.current) {
                    silenceTimerRef.current = setTimeout(() => {
                        silenceTimerRef.current = null;
                        stopRecording();
                    }, silenceThresholdMs);
                }
            },
            onPCMData: (pcmBlob) => {
                if (!transcriptionServiceRef.current || turnPhaseRef.current !== 'recording') {
                    return;
                }

                const binaryString = atob(pcmBlob.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let index = 0; index < binaryString.length; index += 1) {
                    bytes[index] = binaryString.charCodeAt(index);
                }
                transcriptionServiceRef.current.addChunk(bytes.buffer);
            },
            onCalibration: (noiseFloor, threshold) => {
                console.log(`[Audio] Calibrated - Noise: ${noiseFloor.toFixed(4)}, Threshold: ${threshold.toFixed(4)}`);
            }
        });
    }, [noteBargeInIfNeeded, stopRecording, silenceThresholdMs]);

    // After an unexpected drop, schedule an exponential-backoff reconnect that
    // keeps the live mic + accumulated transcript and re-primes the examiner.
    const attemptReconnect = useCallback(() => {
        if (intentionalCloseRef.current || reconnectingRef.current) return;

        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            setError('The connection was lost and could not be restored. Your progress so far has been saved — please end this attempt and re-enter with the same name to continue.');
            setStatus(InterviewStatus.ERROR);
            cleanup();
            return;
        }

        reconnectingRef.current = true;
        setIsReconnecting(true);
        setStatus(InterviewStatus.CONNECTING);
        setRecognitionNotice(null);

        // The dead socket can't receive anything — pause the current turn.
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
        if (maxRecordingTimerRef.current) { clearTimeout(maxRecordingTimerRef.current); maxRecordingTimerRef.current = null; }
        if (nextTurnTimerRef.current) { clearTimeout(nextTurnTimerRef.current); nextTurnTimerRef.current = null; }
        if (postTranscriptTimerRef.current) { clearTimeout(postTranscriptTimerRef.current); postTranscriptTimerRef.current = null; }
        if (transcriptionServiceRef.current) {
            transcriptionServiceRef.current.stopAccumulating();
            transcriptionServiceRef.current.clear();
        }
        setTurnPhase('idle');

        const attempt = reconnectAttemptsRef.current + 1;
        reconnectAttemptsRef.current = attempt;
        const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);

        reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            // Teardown may have landed during the backoff delay.
            if (intentionalCloseRef.current || !mountedRef.current) {
                reconnectingRef.current = false;
                return;
            }
            const stale = sessionRef.current;
            sessionRef.current = null;
            // establishConnection bumps the session generation synchronously, so
            // the stale socket's late callbacks (including the close fired by the
            // disconnect below) are ignored and can't re-trigger a reconnect.
            establishConnectionRef.current(true).catch((err) => {
                console.error('[Reconnect] attempt failed:', err);
                reconnectingRef.current = false;
                attemptReconnectRef.current();
            });
            try { stale?.disconnect(); } catch { /* no-op */ }
        }, delay);
    }, [cleanup]);

    useEffect(() => { stopRecordingRef.current = stopRecording; }, [stopRecording]);
    useEffect(() => { attemptReconnectRef.current = attemptReconnect; }, [attemptReconnect]);

    const startSession = useCallback(async () => {
        try {
            setStatus(InterviewStatus.CONNECTING);
            setError(null);
            setTranscriptions([]);
            setTurnPhase('idle');
            setLatencyMetrics(DEFAULT_LATENCY_METRICS);
            setBargeInEvents([]);
            setDialogueMetrics(DEFAULT_DIALOGUE_METRICS);
            setArgumentGraph({ nodes: [], edges: [], coherenceScore: 0, complexity: 0 });
            syncRawTurns([]);
            syncFailedTurns([]);

            lastTurnEndTimeRef.current = Date.now();
            userSpeakingTimeRef.current = 0;
            interviewerSpeakingTimeRef.current = 0;
            latencyListRef.current = [];
            argumentGraphBuilderRef.current = new ArgumentGraphBuilder();
            pendingBargeInRef.current = null;
            previousUserTextRef.current = '';
            aiTextBufferRef.current = '';

            // Fresh start: clear any prior reconnect bookkeeping.
            intentionalCloseRef.current = false;
            reconnectingRef.current = false;
            reconnectAttemptsRef.current = 0;
            setIsReconnecting(false);
            setRecognitionNotice(null);

            // Builds (or, on reconnect, rebuilds) the live socket. Stored in a ref
            // so the reconnect path can re-invoke it with the latest closure.
            const connect = async (isReconnect: boolean): Promise<void> => {
                const myGen = ++sessionGenRef.current;
                const isStale = () => sessionGenRef.current !== myGen;

                // Short-lived ephemeral token from our server proxy; the
                // long-lived Gemini key stays server-side.
                const tokenResp = await fetch('/api/gemini-token', { method: 'POST' });
                if (!tokenResp.ok) {
                    throw new Error('Could not start the voice session (token unavailable).');
                }
                const { token: ephemeralToken } = await tokenResp.json();

                const wsClient = new GeminiWebsocketClient({
                    apiKey: ephemeralToken as string,
                    systemInstruction,
                    voiceName,
                    onOpen: async () => {
                        if (isStale()) return;
                        // Teardown (endSession/unmount) may have landed while this
                        // socket was still opening — don't revive an ended or
                        // unmounted session; disconnect the freshly-opened socket.
                        if (intentionalCloseRef.current || !mountedRef.current) {
                            try { wsClient.disconnect(); } catch { /* no-op */ }
                            if (sessionRef.current === wsClient) sessionRef.current = null;
                            return;
                        }
                        reconnectingRef.current = false;
                        setIsReconnecting(false);
                        setStatus(InterviewStatus.LIVE);

                        if (!audioServiceRef.current) {
                            try {
                                await initAudio();
                            } catch (micErr: any) {
                                setError(micErr?.name === 'NotAllowedError'
                                    ? 'Microphone access denied. Please allow microphone access and try again.'
                                    : 'Could not access the microphone. Please check your device and try again.');
                                setStatus(InterviewStatus.ERROR);
                                cleanup();
                                return;
                            }
                        }
                        if (!transcriptionServiceRef.current) {
                            transcriptionServiceRef.current = new TranscriptionService('');
                        }

                        if (isReconnect) {
                            // The new socket has no memory of the dialogue — re-prime
                            // the examiner with the transcript so far and ask it to
                            // continue rather than restart.
                            setRecognitionNotice(null);
                            const history = transcriptionsRef.current
                                .map((t) => `${t.speaker === 'user' ? 'Student' : 'Examiner'}: ${t.text}`)
                                .join('\n');
                            const primer = `[SYSTEM: The voice connection dropped briefly and has been restored. Do NOT restart the interview or re-introduce yourself. Here is the conversation so far:\n${history || '(no exchanges yet)'}\n\nAcknowledge the reconnection in one short sentence, then continue from where you left off with the next appropriate question.]`;
                            setTurnPhase('ai_speaking');
                            wsClient.sendText(primer);
                        } else {
                            setTurnPhase('ai_speaking');
                            wsClient.sendText("Hello! I'm ready for the interview. Please introduce yourself and start with the first question.");
                        }
                    },
                    onMessage: async (message: LiveServerMessage) => {
                        if (isStale()) return;
                        const serverContent = message.serverContent;

                        const base64Audio = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (base64Audio) {
                            setIsInterviewerSpeaking(true);
                            setTurnPhase('ai_speaking');
                            if (audioServiceRef.current) {
                                audioServiceRef.current.playAudioChunk(base64Audio);
                            }
                            if (audioEndTimerRef.current) {
                                clearTimeout(audioEndTimerRef.current);
                            }
                            audioEndTimerRef.current = setTimeout(() => {
                                setIsInterviewerSpeaking(false);
                            }, 2000);
                        }

                        if (serverContent?.outputTranscription?.text) {
                            aiTextBufferRef.current += serverContent.outputTranscription.text;
                            const displayText = aiTextBufferRef.current.replace('[END_INTERVIEW]', '').trim();
                            setPendingAIText(displayText);

                            if (aiTextBufferRef.current.includes('[END_INTERVIEW]')) {
                                // Interview is wrapping up — any subsequent socket
                                // close is expected, so suppress the reconnect path.
                                intentionalCloseRef.current = true;
                                if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
                                endedTimerRef.current = setTimeout(() => {
                                    endedTimerRef.current = null;
                                    setStatus(InterviewStatus.ENDED);
                                }, 5000);
                            }
                        }

                        if (serverContent?.turnComplete) {
                            const now = Date.now();
                            const aiText = aiTextBufferRef.current.trim();

                            if (aiText) {
                                const cleanText = aiText.replace('[END_INTERVIEW]', '').trim();
                                if (cleanText) {
                                    appendTranscription({
                                        speaker: 'interviewer',
                                        text: cleanText,
                                        timestamp: now
                                    });

                                    if (cleanText.includes('?')) {
                                        try {
                                            const questionId = argumentGraphBuilderRef.current.addQuestion(cleanText, now);
                                            lastQuestionIdRef.current = questionId;
                                        } catch (graphError) {
                                            console.error('Argument graph error:', graphError);
                                        }
                                    }
                                }
                            }

                            aiTextBufferRef.current = '';
                            setPendingAIText('');
                            setIsInterviewerSpeaking(false);
                            if (audioEndTimerRef.current) {
                                clearTimeout(audioEndTimerRef.current);
                            }

                            lastTurnEndTimeRef.current = now;
                            setLatencyMetrics(updateLatencyMetrics());

                            // A fully completed turn proves the (re)connection is
                            // healthy — reset the backoff counter so a later,
                            // unrelated drop gets a fresh budget. Without this, a
                            // socket that opens then flaps would reset its counter
                            // every cycle and never exhaust the give-up limit.
                            reconnectAttemptsRef.current = 0;

                            if (nextTurnTimerRef.current) clearTimeout(nextTurnTimerRef.current);
                            nextTurnTimerRef.current = setTimeout(() => {
                                nextTurnTimerRef.current = null;
                                startRecordingPhase();
                            }, 500);
                        }
                    },
                    onClose: () => {
                        if (isStale()) return;
                        if (intentionalCloseRef.current) {
                            setStatus(InterviewStatus.ENDED);
                            setLatencyMetrics(updateLatencyMetrics());
                            if (onTranscriptionComplete) {
                                onTranscriptionComplete(transcriptionsRef.current);
                            }
                            return;
                        }
                        // Unexpected drop — recover instead of ending the exam.
                        attemptReconnectRef.current();
                    },
                    onError: (connectionError: unknown) => {
                        if (isStale()) return;
                        console.error('Gemini Live error:', connectionError);
                        if (intentionalCloseRef.current) return;
                        attemptReconnectRef.current();
                    }
                });

                // Teardown could have happened while we awaited the token —
                // don't open a socket that the (already-run) cleanup won't clear.
                if (intentionalCloseRef.current || isStale() || !mountedRef.current) {
                    return;
                }
                sessionRef.current = wsClient;
                await wsClient.connect();
            };

            establishConnectionRef.current = connect;
            await connect(false);
        } catch (sessionError: any) {
            console.error('Failed to start session:', sessionError);
            if (sessionError?.name === 'NotAllowedError') {
                setError('Microphone access denied. Please allow microphone access and try again.');
            } else if (sessionError?.name === 'NotFoundError') {
                setError('No microphone found. Please connect a microphone and try again.');
            } else {
                setError('Failed to start interview session. Please check your connection and try again.');
            }
            setStatus(InterviewStatus.IDLE);
            cleanup();
        }
    }, [
        cleanup,
        initAudio,
        onTranscriptionComplete,
        startRecordingPhase,
        syncFailedTurns,
        syncRawTurns,
        systemInstruction,
        updateLatencyMetrics,
        voiceName,
        appendTranscription
    ]);

    const endSession = useCallback(async () => {
        const now = Date.now();
        // Ending is intentional: don't let the teardown's socket close trigger
        // a reconnect, and cancel any reconnect already in flight.
        intentionalCloseRef.current = true;
        reconnectingRef.current = false;
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
        setIsReconnecting(false);

        if (turnPhaseRef.current === 'recording' || turnPhaseRef.current === 'idle') {
            if (transcriptionServiceRef.current) {
                transcriptionServiceRef.current.stopAccumulating();
                if (transcriptionServiceRef.current.hasAudio()) {
                    setTurnPhase('transcribing');
                    try {
                        const capturedTurn = transcriptionServiceRef.current.consumeCurrentTurn();
                        const latency = lastTurnEndTimeRef.current > 0
                            ? recordingStartTimeRef.current - lastTurnEndTimeRef.current
                            : undefined;

                        if (capturedTurn) {
                            const { text, isBargeIn } = await processCapturedTurn(capturedTurn, latency);
                            if (text) {
                                appendTranscription({
                                    speaker: 'user',
                                    text,
                                    timestamp: now,
                                    latency,
                                    duration: capturedTurn.durationMs,
                                    isBargeIn
                                });
                            }
                        }
                    } catch (transcriptionError) {
                        console.error('[TurnBased] Failed to transcribe pending audio:', transcriptionError);
                    }
                }
            }
        }

        if (aiTextBufferRef.current.trim()) {
            appendTranscription({
                speaker: 'interviewer',
                text: aiTextBufferRef.current.trim(),
                timestamp: now
            });
        }

        setLatencyMetrics(updateLatencyMetrics());
        setArgumentGraph(argumentGraphBuilderRef.current.getGraph());

        const finalTranscripts = [...transcriptionsRef.current];

        cleanup();
        setStatus(InterviewStatus.ENDED);
        setTurnPhase('idle');
        setIsInterviewerSpeaking(false);

        return finalTranscripts;
    }, [appendTranscription, cleanup, processCapturedTurn, updateLatencyMetrics]);

    const getReasoningRubric = useCallback(() => {
        const userText = transcriptions
            .filter((item) => item.speaker === 'user')
            .map((item) => item.text)
            .join(' ');
        const patterns = analyzeReasoningPatterns(userText);
        return calculateReasoningScores(patterns, userText);
    }, [transcriptions]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            cleanup();
        };
    }, [cleanup]);

    return {
        status,
        transcriptions,
        isInterviewerSpeaking,
        isUserSpeaking,
        audioLevel,
        pendingUserText,
        pendingAIText,
        error,
        turnPhase,
        isReconnecting,
        recognitionNotice,
        latencyMetrics,
        bargeInEvents,
        rawTranscriptTurns,
        failedTranscriptions,
        dialogueMetrics,
        argumentGraph,
        getReasoningRubric,
        startSession,
        endSession,
        stopRecording
    };
}

export default useGeminiLive;
