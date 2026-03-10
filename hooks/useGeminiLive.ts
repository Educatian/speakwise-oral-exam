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
    ArgumentGraph
} from '../types';
import { GeminiWebsocketClient } from '../lib/services/GeminiWebsocketClient';
import { AudioStreamService } from '../lib/services/AudioStreamService';
import { TranscriptionService } from '../lib/services/TranscriptionService';
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
}

/**
 * Turn-Based Gemini Live Interview Hook
 * 
 * Flow:
 * 1. AI speaks (TTS audio from Gemini Live)
 * 2. turnComplete → start recording student audio
 * 3. VAD detects 3s silence → auto-stop OR student clicks "Done"
 * 4. Post-hoc transcription via Gemini Flash
 * 5. Transcribed text displayed + sent to Gemini via sendText()
 * 6. AI responds with next question → repeat
 */
export function useGeminiLive(options: UseGeminiLiveOptions): UseGeminiLiveReturn {
    const { systemInstruction, voiceName = 'Kore', onTranscriptionComplete } = options;

    // Session State
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

    // Learning Analytics State
    const [latencyMetrics, setLatencyMetrics] = useState<LatencyMetrics>(DEFAULT_LATENCY_METRICS);
    const [bargeInEvents] = useState<BargeInEvent[]>([]);
    const [dialogueMetrics, setDialogueMetrics] = useState<DialogueMetrics>(DEFAULT_DIALOGUE_METRICS);
    const [argumentGraph, setArgumentGraph] = useState<ArgumentGraph>({ nodes: [], edges: [], coherenceScore: 0, complexity: 0 });

    // Services
    const audioServiceRef = useRef<AudioStreamService | null>(null);
    const sessionRef = useRef<GeminiWebsocketClient | null>(null);
    const transcriptionServiceRef = useRef<TranscriptionService | null>(null);

    // Analytics Refs
    const lastTurnEndTimeRef = useRef<number>(0);
    const userSpeakingTimeRef = useRef<number>(0);
    const interviewerSpeakingTimeRef = useRef<number>(0);
    const latencyListRef = useRef<number[]>([]);
    const argumentGraphBuilderRef = useRef<ArgumentGraphBuilder>(new ArgumentGraphBuilder());
    const lastQuestionIdRef = useRef<string>('');
    const previousUserTextRef = useRef<string>('');

    // Turn management refs
    const aiTextBufferRef = useRef<string>('');
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const recordingStartTimeRef = useRef<number>(0);
    const audioEndTimerRef = useRef<NodeJS.Timeout | null>(null);
    const turnPhaseRef = useRef<TurnPhase>('idle');

    // Keep ref in sync with state
    useEffect(() => {
        turnPhaseRef.current = turnPhase;
    }, [turnPhase]);

    // Cleanup function
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
            try { sessionRef.current.disconnect(); } catch (e) { /* */ }
            sessionRef.current = null;
        }
        transcriptionsRef.current = [];
    }, []);

    // Helper to add transcription
    const addTranscription = useCallback((item: TranscriptionItem) => {
        transcriptionsRef.current = [...transcriptionsRef.current, item];
        setTranscriptions(transcriptionsRef.current);
    }, []);

    // Calculate latency metrics
    const updateLatencyMetrics = useCallback(() => {
        return calculateLatencyMetrics(
            latencyListRef.current,
            userSpeakingTimeRef.current,
            interviewerSpeakingTimeRef.current
        );
    }, []);

    // ─── Stop Recording & Transcribe ───────────────────────────────────────
    const stopRecording = useCallback(() => {
        // Only stop if we're actually recording
        if (turnPhaseRef.current !== 'recording') return;

        console.log('[TurnBased] Stopping recording, starting transcription...');
        setTurnPhase('transcribing');

        // Clear silence timer
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }

        // Stop audio accumulation
        if (transcriptionServiceRef.current) {
            transcriptionServiceRef.current.stopAccumulating();
        }

        // Calculate speaking duration
        const speakingDuration = Date.now() - recordingStartTimeRef.current;
        userSpeakingTimeRef.current += speakingDuration;

        // Transcribe accumulated audio
        if (transcriptionServiceRef.current && transcriptionServiceRef.current.hasAudio()) {
            transcriptionServiceRef.current.transcribe().then((text) => {
                if (text && text.trim()) {
                    const now = Date.now();
                    const userText = text.trim();

                    console.log('[TurnBased] Transcription result:', userText.substring(0, 60));

                    // Show the transcribed text
                    setPendingUserText(userText);

                    // Calculate latency
                    const latency = lastTurnEndTimeRef.current > 0
                        ? recordingStartTimeRef.current - lastTurnEndTimeRef.current : 0;
                    if (latency > 0 && latency < 60000) {
                        latencyListRef.current.push(latency);
                    }

                    // Add to transcript
                    addTranscription({
                        speaker: 'user',
                        text: userText,
                        timestamp: now,
                        latency: latency > 0 ? latency : undefined,
                        duration: speakingDuration
                    });

                    // Process for argument graph
                    try {
                        argumentGraphBuilderRef.current.processUserUtterance(
                            userText, now, lastQuestionIdRef.current || undefined
                        );
                        setArgumentGraph(argumentGraphBuilderRef.current.getGraph());
                    } catch (e) {
                        console.error('Argument graph error:', e);
                    }

                    // Update dialogue metrics
                    const isRephrasing = detectRephrasing(userText, previousUserTextRef.current);
                    const isInitiative = detectTurnInitiative(userText, '');

                    setDialogueMetrics(prev => ({
                        ...prev,
                        turnInitiatives: prev.turnInitiatives + (isInitiative ? 1 : 0),
                        rephrasingEvents: prev.rephrasingEvents + (isRephrasing ? 1 : 0),
                        followUpDepth: [...prev.followUpDepth, userText.length],
                        avgFollowUpDepth: Math.round(
                            [...prev.followUpDepth, userText.length].reduce((a, b) => a + b, 0) /
                            (prev.followUpDepth.length + 1)
                        )
                    }));

                    previousUserTextRef.current = userText;
                    setLatencyMetrics(updateLatencyMetrics());

                    // Clear pending text after a brief display period, then send to Gemini
                    setTimeout(() => {
                        setPendingUserText('');

                        // Send transcribed text to Gemini for next response
                        if (sessionRef.current) {
                            console.log('[TurnBased] Sending text to Gemini:', userText.substring(0, 60));
                            setTurnPhase('ai_speaking');
                            sessionRef.current.sendText(userText);
                        }
                    }, 1500); // Show transcription for 1.5s before AI responds

                } else {
                    // No speech detected — go back to recording
                    console.log('[TurnBased] No speech detected, returning to recording');
                    startRecordingPhase();
                }
            }).catch((err) => {
                console.error('[TurnBased] Transcription failed:', err);
                // Retry recording
                startRecordingPhase();
            });
        } else {
            // No audio accumulated — go back to recording
            console.log('[TurnBased] No audio accumulated, returning to recording');
            startRecordingPhase();
        }
    }, [addTranscription, updateLatencyMetrics]);

    // ─── Start Recording Phase ─────────────────────────────────────────────
    const startRecordingPhase = useCallback(() => {
        console.log('[TurnBased] Starting recording phase...');
        setTurnPhase('recording');
        recordingStartTimeRef.current = Date.now();
        setPendingUserText('');

        // Start audio accumulation for post-hoc transcription
        if (transcriptionServiceRef.current) {
            transcriptionServiceRef.current.startAccumulating();
        }

        // Set up silence detection timer (reset on each voice activity)
        // The actual silence detection happens in the VAD callback below
    }, []);

    // ─── Start Session ─────────────────────────────────────────────────────
    const startSession = useCallback(async () => {
        try {
            setStatus(InterviewStatus.CONNECTING);
            setError(null);
            setTranscriptions([]);
            setTurnPhase('idle');
            setLatencyMetrics(DEFAULT_LATENCY_METRICS);

            // Reset analytics refs
            lastTurnEndTimeRef.current = Date.now();
            userSpeakingTimeRef.current = 0;
            interviewerSpeakingTimeRef.current = 0;
            latencyListRef.current = [];
            argumentGraphBuilderRef.current = new ArgumentGraphBuilder();

            const wsClient = new GeminiWebsocketClient({
                apiKey: process.env.API_KEY as string,
                systemInstruction,
                voiceName,
                onOpen: async () => {
                    setStatus(InterviewStatus.LIVE);

                    // Initialize audio service (for VAD + level display only, NOT streaming to Gemini)
                    audioServiceRef.current = new AudioStreamService();
                    await audioServiceRef.current.initialize({
                        onAudioLevel: (level) => setAudioLevel(level),
                        onVoiceActivity: (isSpeaking) => {
                            setIsUserSpeaking(isSpeaking);

                            // Silence detection: when user stops speaking during recording phase
                            if (turnPhaseRef.current === 'recording') {
                                if (isSpeaking) {
                                    // User is speaking — clear silence timer
                                    if (silenceTimerRef.current) {
                                        clearTimeout(silenceTimerRef.current);
                                        silenceTimerRef.current = null;
                                    }
                                } else {
                                    // User stopped — start 3s silence timer to auto-stop
                                    if (!silenceTimerRef.current) {
                                        silenceTimerRef.current = setTimeout(() => {
                                            console.log('[TurnBased] 3s silence detected, auto-stopping recording');
                                            silenceTimerRef.current = null;
                                            stopRecording();
                                        }, 3000);
                                    }
                                }
                            }
                        },
                        onPCMData: (pcmBlob) => {
                            // DON'T send audio to Gemini — only accumulate for post-hoc transcription
                            if (transcriptionServiceRef.current && turnPhaseRef.current === 'recording') {
                                const binaryString = atob(pcmBlob.data);
                                const bytes = new Uint8Array(binaryString.length);
                                for (let i = 0; i < binaryString.length; i++) {
                                    bytes[i] = binaryString.charCodeAt(i);
                                }
                                transcriptionServiceRef.current.addChunk(bytes.buffer);
                            }
                        },
                        onCalibration: (noiseFloor, threshold) => {
                            console.log(`[Audio] Calibrated - Noise: ${noiseFloor.toFixed(4)}, Threshold: ${threshold.toFixed(4)}`);
                        }
                    });

                    // Initialize transcription service
                    transcriptionServiceRef.current = new TranscriptionService(process.env.API_KEY as string);
                },
                onMessage: async (message: LiveServerMessage) => {
                    const sc = message.serverContent;

                    // ── Handle AI audio output ──
                    const base64Audio = sc?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (base64Audio) {
                        setIsInterviewerSpeaking(true);
                        setTurnPhase('ai_speaking');
                        if (audioServiceRef.current) {
                            audioServiceRef.current.playAudioChunk(base64Audio);
                        }
                        // Debounced safety: 2s after last chunk → clear speaking state
                        if (audioEndTimerRef.current) clearTimeout(audioEndTimerRef.current);
                        audioEndTimerRef.current = setTimeout(() => {
                            setIsInterviewerSpeaking(false);
                        }, 2000);
                    }

                    // ── Handle AI text transcription ──
                    if (sc?.outputTranscription?.text) {
                        const aiText = sc.outputTranscription.text;
                        aiTextBufferRef.current += aiText;
                        const displayText = aiTextBufferRef.current.replace('[END_INTERVIEW]', '').trim();
                        setPendingAIText(displayText);

                        // Check for interview end
                        if (aiTextBufferRef.current.includes('[END_INTERVIEW]')) {
                            console.log('[TurnBased] AI signaled interview end');
                            setTimeout(() => {
                                setStatus(InterviewStatus.ENDED);
                                cleanup();
                            }, 5000);
                        }
                    }

                    // ── Handle turnComplete → start recording ──
                    if (sc?.turnComplete) {
                        const now = Date.now();
                        const aiText = aiTextBufferRef.current.trim();

                        console.log('[TurnBased] AI turn complete, switching to recording phase');

                        if (aiText) {
                            // Commit AI text to transcript
                            const cleanText = aiText.replace('[END_INTERVIEW]', '').trim();
                            if (cleanText) {
                                addTranscription({
                                    speaker: 'interviewer',
                                    text: cleanText,
                                    timestamp: now
                                });

                                // Add to argument graph if question
                                if (cleanText.includes('?')) {
                                    try {
                                        const qId = argumentGraphBuilderRef.current.addQuestion(cleanText, now);
                                        lastQuestionIdRef.current = qId;
                                    } catch (e) {
                                        console.error('Argument graph error:', e);
                                    }
                                }
                            }
                        }

                        // Reset AI buffer
                        aiTextBufferRef.current = '';
                        setPendingAIText('');
                        setIsInterviewerSpeaking(false);
                        if (audioEndTimerRef.current) clearTimeout(audioEndTimerRef.current);

                        // Track turn timing
                        lastTurnEndTimeRef.current = now;
                        setLatencyMetrics(updateLatencyMetrics());

                        // Start recording phase (student's turn)
                        // Small delay to let audio playback finish
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
                onError: (err: any) => {
                    console.error('Gemini Live error:', err);
                    setError('Connection error occurred. Please try again.');
                    setStatus(InterviewStatus.ERROR);
                    cleanup();
                }
            });

            sessionRef.current = wsClient;
            await wsClient.connect();

            // Auto-greet: make AI speak first
            setTimeout(() => {
                if (sessionRef.current) {
                    console.log('[TurnBased] Sending init ping to trigger AI greeting...');
                    setTurnPhase('ai_speaking');
                    sessionRef.current.sendText("Hello! I'm ready for the interview. Please introduce yourself and start with the first question.");
                }
            }, 1000);

        } catch (err: any) {
            console.error('Failed to start session:', err);
            if (err.name === 'NotAllowedError') {
                setError('Microphone access denied. Please allow microphone access and try again.');
            } else if (err.name === 'NotFoundError') {
                setError('No microphone found. Please connect a microphone and try again.');
            } else {
                setError('Failed to start interview session. Please check your connection and try again.');
            }
            setStatus(InterviewStatus.IDLE);
            cleanup();
        }
    }, [systemInstruction, voiceName, cleanup, onTranscriptionComplete, updateLatencyMetrics, addTranscription, startRecordingPhase, stopRecording]);

    // End session
    const endSession = useCallback(() => {
        // Flush pending AI text
        const now = Date.now();
        if (aiTextBufferRef.current.trim()) {
            addTranscription({
                speaker: 'interviewer',
                text: aiTextBufferRef.current.trim(),
                timestamp: now
            });
        }

        setLatencyMetrics(updateLatencyMetrics());
        setArgumentGraph(argumentGraphBuilderRef.current.getGraph());

        cleanup();
        setStatus(InterviewStatus.ENDED);
        setTurnPhase('idle');
        setIsInterviewerSpeaking(false);

        return transcriptionsRef.current;
    }, [cleanup, updateLatencyMetrics, addTranscription]);

    // Calculate reasoning rubric
    const getReasoningRubric = useCallback(() => {
        const userText = transcriptions
            .filter(t => t.speaker === 'user')
            .map(t => t.text)
            .join(' ');
        const patterns = analyzeReasoningPatterns(userText);
        return calculateReasoningScores(patterns, userText);
    }, [transcriptions]);

    // Cleanup on unmount
    useEffect(() => {
        return () => { cleanup(); };
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
        // Learning Analytics
        latencyMetrics,
        bargeInEvents,
        // Advanced Analytics
        dialogueMetrics,
        argumentGraph,
        getReasoningRubric,
        // Session control
        startSession,
        endSession,
        stopRecording
    };
}

export default useGeminiLive;
