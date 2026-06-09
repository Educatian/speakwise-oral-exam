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
    ): Promise<{ text: string | null; isBargeIn: boolean }> => {
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
            return { text: null, isBargeIn };
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

            return { text: userText, isBargeIn };
        }

        const failedTurn: RawTranscriptTurn = {
            ...rawTurnBase,
            status: 'failed',
            error: result.error || 'Transcription returned no usable text.'
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
        return { text: null, isBargeIn };
    }, [appendRawTurn, minTurnDurationMs, patchRawTurn, queueFailedTurn]);

    const startRecordingPhase = useCallback(() => {
        setTurnPhase('recording');
        recordingStartTimeRef.current = Date.now();
        setPendingUserText('');

        if (transcriptionServiceRef.current) {
            transcriptionServiceRef.current.startAccumulating();
        }
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
            .then(({ text, isBargeIn }) => {
                if (!text) {
                    startRecordingPhase();
                    return;
                }

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

                setTimeout(() => {
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

            // Get a short-lived ephemeral token from our server proxy; the
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
                    setStatus(InterviewStatus.LIVE);

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

                    transcriptionServiceRef.current = new TranscriptionService('');
                },
                onMessage: async (message: LiveServerMessage) => {
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
                            setTimeout(() => {
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

                        setTimeout(() => {
                            startRecordingPhase();
                        }, 500);
                    }
                },
                onClose: () => {
                    setStatus(InterviewStatus.ENDED);
                    setLatencyMetrics(updateLatencyMetrics());
                    if (onTranscriptionComplete) {
                        onTranscriptionComplete(transcriptionsRef.current);
                    }
                },
                onError: (connectionError: unknown) => {
                    console.error('Gemini Live error:', connectionError);
                    setError('Connection error occurred. Please try again.');
                    setStatus(InterviewStatus.ERROR);
                    cleanup();
                }
            });

            sessionRef.current = wsClient;
            await wsClient.connect();

            setTimeout(() => {
                if (sessionRef.current) {
                    setTurnPhase('ai_speaking');
                    sessionRef.current.sendText("Hello! I'm ready for the interview. Please introduce yourself and start with the first question.");
                }
            }, 1000);
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
        noteBargeInIfNeeded,
        onTranscriptionComplete,
        silenceThresholdMs,
        startRecordingPhase,
        stopRecording,
        syncFailedTurns,
        syncRawTurns,
        systemInstruction,
        updateLatencyMetrics,
        voiceName,
        appendTranscription
    ]);

    const endSession = useCallback(async () => {
        const now = Date.now();

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
        return () => {
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
