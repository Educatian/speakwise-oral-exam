import { useState, useEffect, useRef, useCallback } from 'react';
import { LiveServerMessage } from '@google/genai';
import {
    InterviewStatus,
    TranscriptionItem,
    UseGeminiLiveReturn,
    LatencyMetrics,
    BargeInEvent,
    DialogueMetrics,
    ArgumentGraph
} from '../types';
import { GeminiWebsocketClient } from '../lib/services/GeminiWebsocketClient';
import { AudioStreamService } from '../lib/services/AudioStreamService';
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
    calculateLatencyMetrics,
    detectBargeInEvent
} from '../lib/voice/analyticsUtils';

interface UseGeminiLiveOptions {
    systemInstruction: string;
    voiceName?: string;
    onTranscriptionComplete?: (transcriptions: TranscriptionItem[]) => void;
}

/**
 * Custom hook for managing Gemini Live audio sessions
 * Handles audio capture, playback, transcription, and session lifecycle
 * Enhanced with Learning Analytics tracking
 */
export function useGeminiLive(options: UseGeminiLiveOptions): UseGeminiLiveReturn {
    const { systemInstruction, voiceName = 'Kore', onTranscriptionComplete } = options;

    // Session State
    const [status, setStatus] = useState<InterviewStatus>(InterviewStatus.IDLE);
    const [transcriptions, setTranscriptions] = useState<TranscriptionItem[]>([]);
    const transcriptionsRef = useRef<TranscriptionItem[]>([]);
    const [isInterviewerSpeaking, setIsInterviewerSpeaking] = useState(false);
    const [isUserSpeaking, setIsUserSpeaking] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0); // 0-100 normalized level
    const [pendingUserText, setPendingUserText] = useState(''); // Real-time user transcription
    const [pendingAIText, setPendingAIText] = useState(''); // Real-time AI transcription
    const [error, setError] = useState<string | null>(null);

    // Learning Analytics State
    const [latencyMetrics, setLatencyMetrics] = useState<LatencyMetrics>(DEFAULT_LATENCY_METRICS);
    const [bargeInEvents, setBargeInEvents] = useState<BargeInEvent[]>([]);
    const [dialogueMetrics, setDialogueMetrics] = useState<DialogueMetrics>(DEFAULT_DIALOGUE_METRICS);
    const [argumentGraph, setArgumentGraph] = useState<ArgumentGraph>({ nodes: [], edges: [], coherenceScore: 0, complexity: 0 });

    // Audio and GenAI Services
    const audioServiceRef = useRef<AudioStreamService | null>(null);
    const sessionRef = useRef<GeminiWebsocketClient | null>(null);

    // Core Refs
    const transcriptBufferRef = useRef({ user: '', interviewer: '' });

    // Learning Analytics Refs
    const lastTurnEndTimeRef = useRef<number>(0);
    const userSpeakingTimeRef = useRef<number>(0);
    const interviewerSpeakingTimeRef = useRef<number>(0);
    const currentInterviewerTextRef = useRef<string>('');
    const latencyListRef = useRef<number[]>([]);
    const argumentGraphBuilderRef = useRef<ArgumentGraphBuilder>(new ArgumentGraphBuilder());
    const lastQuestionIdRef = useRef<string>('');
    const previousUserTextRef = useRef<string>('');
    const lastSpeakerRef = useRef<'user' | 'ai' | null>(null); // Track who was speaking last
    const audioEndTimerRef = useRef<NodeJS.Timeout | null>(null); // Debounced safety for AI speaking state
    const isInterviewerSpeakingRef = useRef(false); // Ref mirror for stale-closure-safe access

    // Cleanup function
    const cleanup = useCallback(() => {
        if (audioServiceRef.current) {
            audioServiceRef.current.cleanup();
            audioServiceRef.current = null;
        }

        // Close session
        if (sessionRef.current) {
            try {
                sessionRef.current.disconnect();
            } catch (e) {
                // Session may already be closed
            }
            sessionRef.current = null;
        }

        // Reset refs
        transcriptBufferRef.current = { user: '', interviewer: '' };
        lastTurnEndTimeRef.current = 0;
        currentInterviewerTextRef.current = '';
        transcriptionsRef.current = [];
    }, []);

    // Helper to add transcription and sync ref
    const addTranscription = useCallback((item: TranscriptionItem) => {
        transcriptionsRef.current = [...transcriptionsRef.current, item];
        setTranscriptions(transcriptionsRef.current);
    }, []);

    // Calculate latency metrics using external utilities
    const updateLatencyMetrics = useCallback(() => {
        return calculateLatencyMetrics(
            latencyListRef.current,
            userSpeakingTimeRef.current,
            interviewerSpeakingTimeRef.current
        );
    }, []);

    // Sync ref mirror whenever state changes
    useEffect(() => {
        isInterviewerSpeakingRef.current = isInterviewerSpeaking;
    }, [isInterviewerSpeaking]);

    // Detect and log barge-in events (uses ref to avoid stale closure)
    const processBargeIn = useCallback((userText: string) => {
        const event = detectBargeInEvent(
            isInterviewerSpeakingRef.current,
            currentInterviewerTextRef.current,
            userText
        );
        if (event) {
            setBargeInEvents(prev => [...prev, event]);
            return true;
        }
        return false;
    }, []);

    // Start a new session
    const startSession = useCallback(async () => {
        try {
            setStatus(InterviewStatus.CONNECTING);
            setError(null);
            setTranscriptions([]);
            setIsInterviewerSpeaking(false);
            setLatencyMetrics(DEFAULT_LATENCY_METRICS);
            setBargeInEvents([]);

            // Reset LA refs
            lastTurnEndTimeRef.current = Date.now();
            userSpeakingTimeRef.current = 0;
            interviewerSpeakingTimeRef.current = 0;
            latencyListRef.current = [];

            // Wrap and initialize logic in GeminiWebsocketClient
            const wsClient = new GeminiWebsocketClient({
                apiKey: process.env.API_KEY as string,
                systemInstruction,
                voiceName,
                onOpen: async () => {
                    setStatus(InterviewStatus.LIVE);

                    // Track VAD state with hangover for audio gating
                    const isUserSpeakingRef = { current: false };
                    let vadHangoverTimer: NodeJS.Timeout | null = null;
                    const VAD_HANGOVER_MS = 500; // Keep sending 500ms after speech ends

                    audioServiceRef.current = new AudioStreamService();
                    await audioServiceRef.current.initialize({
                        onAudioLevel: (level) => setAudioLevel(level),
                        onVoiceActivity: (isSpeaking) => {
                            setIsUserSpeaking(isSpeaking);
                            if (isSpeaking) {
                                isUserSpeakingRef.current = true;
                                if (vadHangoverTimer) clearTimeout(vadHangoverTimer);
                            } else {
                                // Keep sending for VAD_HANGOVER_MS after speech ends
                                vadHangoverTimer = setTimeout(() => {
                                    isUserSpeakingRef.current = false;
                                }, VAD_HANGOVER_MS);
                            }
                        },
                        onPCMData: (pcmBlob) => {
                            // Only send audio when user is speaking (VAD-gated)
                            // This prevents WebSocket congestion from continuous silent audio
                            if (sessionRef.current && isUserSpeakingRef.current) {
                                sessionRef.current.sendAudio(pcmBlob.mimeType, pcmBlob.data);
                            }
                        },
                        onCalibration: (noiseFloor, threshold) => {
                            console.log(`[Audio] Calibrated - Noise floor: ${noiseFloor.toFixed(4)}, Threshold: ${threshold.toFixed(4)}`);
                        }
                    });
                },
                onMessage: async (message: LiveServerMessage) => {
                    const sc = message.serverContent;
                    const hasAudio = !!sc?.modelTurn?.parts?.[0]?.inlineData?.data;

                    // ── VERBOSE DEBUG: dump every message we get ──
                    const allKeys = Object.keys(message).filter(k => (message as any)[k] != null);
                    if (allKeys.length > 0 && !hasAudio) {
                        console.log(`[GeminiLive] RAW keys: ${allKeys.join(', ')}`,
                            sc ? `| serverContent keys: ${Object.keys(sc).filter(k => (sc as any)[k] != null).join(', ')}` : '');
                    }

                    // ── Diagnostics: trace every message type ──
                    const msgTypes: string[] = [];
                    if (hasAudio) msgTypes.push('AUDIO');
                    if (sc?.inputTranscription) msgTypes.push(`INPUT_TRANSCRIPT: "${sc.inputTranscription.text?.substring(0, 40)}"`);
                    if (sc?.outputTranscription) msgTypes.push(`OUTPUT_TRANSCRIPT: "${sc.outputTranscription.text?.substring(0, 40)}"`);
                    if (sc?.turnComplete) msgTypes.push('TURN_COMPLETE');
                    if (message.setupComplete) msgTypes.push('SETUP_COMPLETE');
                    if ((message as any).voiceActivity) msgTypes.push(`VOICE_ACTIVITY: ${JSON.stringify((message as any).voiceActivity)}`);
                    if (msgTypes.length > 0) {
                        console.log(`[GeminiLive] Message: ${msgTypes.join(' | ')}`);
                    }

                    // Handle audio output
                    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    if (base64Audio) {
                        setIsInterviewerSpeaking(true);
                        if (audioServiceRef.current) {
                            audioServiceRef.current.playAudioChunk(base64Audio);
                        }
                        // Debounced safety: if no new chunk arrives within 2s, clear speaking state
                        if (audioEndTimerRef.current) clearTimeout(audioEndTimerRef.current);
                        audioEndTimerRef.current = setTimeout(() => {
                            setIsInterviewerSpeaking(false);
                        }, 2000);
                    }

                    // Handle transcriptions - with detailed tracking
                    if (message.serverContent?.inputTranscription) {
                        const userText = message.serverContent.inputTranscription.text;

                        if (userText && userText.trim()) {
                            transcriptBufferRef.current.user += userText;
                            // Update real-time pending text display
                            setPendingUserText(transcriptBufferRef.current.user);
                            // Check for barge-in
                            processBargeIn(userText);
                        }
                    }

                    if (message.serverContent?.outputTranscription) {
                        const interviewerText = message.serverContent.outputTranscription.text;

                        if (interviewerText && interviewerText.trim()) {
                            transcriptBufferRef.current.interviewer += interviewerText;
                            currentInterviewerTextRef.current = interviewerText;
                            // Update real-time pending text display (without the marker)
                            const displayText = transcriptBufferRef.current.interviewer.replace('[END_INTERVIEW]', '').trim();
                            setPendingAIText(displayText);

                            // Check for interview end marker
                            if (transcriptBufferRef.current.interviewer.includes('[END_INTERVIEW]')) {
                                console.log('[Session] AI signaled interview end, will terminate after audio completes');
                                // Delay to let the farewell audio play
                                setTimeout(() => {
                                    console.log('[Session] Gracefully ending interview');
                                    setStatus(InterviewStatus.ENDED);
                                    cleanup();
                                }, 5000); // 5 second delay for farewell to complete
                            }
                        }
                    }

                    // Detect turn transitions using speaker tracking
                    const hasInputTranscription = !!message.serverContent?.inputTranscription?.text;
                    const hasOutputTranscription = !!message.serverContent?.outputTranscription?.text;

                    // User started speaking (transition from AI or null to user)
                    if (hasInputTranscription && lastSpeakerRef.current !== 'user') {

                        // Commit AI buffer if there was previous AI text
                        if (transcriptBufferRef.current.interviewer.trim()) {
                            const aiText = transcriptBufferRef.current.interviewer.trim();
                            const now = Date.now();

                            // Add AI question to argument graph
                            if (aiText.includes('?')) {
                                const questionId = argumentGraphBuilderRef.current.addQuestion(aiText, now);
                                lastQuestionIdRef.current = questionId;
                            }

                            addTranscription({
                                speaker: 'interviewer',
                                text: aiText,
                                timestamp: now
                            });

                            transcriptBufferRef.current.interviewer = '';
                            lastTurnEndTimeRef.current = now;
                            setPendingAIText('');
                            currentInterviewerTextRef.current = '';
                        }
                        lastSpeakerRef.current = 'user';
                    }

                    // AI started speaking (transition from user or null to AI)
                    if (hasOutputTranscription && lastSpeakerRef.current !== 'ai') {
                        // Commit user buffer if there was previous user text
                        if (transcriptBufferRef.current.user.trim()) {
                            const userText = transcriptBufferRef.current.user.trim();
                            const now = Date.now();

                            const latency = lastTurnEndTimeRef.current > 0
                                ? now - lastTurnEndTimeRef.current
                                : 0;

                            if (latency > 0 && latency < 60000) {
                                latencyListRef.current.push(latency);
                            }

                            const estimatedDuration = userText.length * 50;
                            userSpeakingTimeRef.current += estimatedDuration;

                            // Process user utterance for argument graph
                            try {
                                argumentGraphBuilderRef.current.processUserUtterance(
                                    userText,
                                    now,
                                    lastQuestionIdRef.current || undefined
                                );
                            } catch (e) {
                                console.error('Argument graph processing error:', e);
                            }

                            // Update dialogue metrics
                            const isRephrasing = detectRephrasing(userText, previousUserTextRef.current);
                            const isInitiative = detectTurnInitiative(userText, currentInterviewerTextRef.current);

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

                            // Update argument graph state
                            setArgumentGraph(argumentGraphBuilderRef.current.getGraph());

                            addTranscription({
                                speaker: 'user',
                                text: userText,
                                timestamp: now,
                                latency: latency > 0 ? latency : undefined,
                                duration: estimatedDuration,
                                isBargeIn: isInterviewerSpeaking
                            });

                            setPendingUserText('');
                            transcriptBufferRef.current.user = ''; // FIX: MUST CLEAR USER BUFFER HERE!
                            setLatencyMetrics(updateLatencyMetrics());
                        }
                        lastSpeakerRef.current = 'ai';
                    }

                    // Process completed turn from Server (AI finished speaking)
                    if (message.serverContent?.turnComplete) {
                        const { interviewer } = transcriptBufferRef.current;
                        const now = Date.now();

                        if (interviewer.trim()) {
                            addTranscription({
                                speaker: 'interviewer',
                                text: interviewer.trim(),
                                timestamp: now
                            });

                            // Add AI question to argument graph if it contains a question mark
                            if (interviewer.trim().includes('?')) {
                                try {
                                    const questionId = argumentGraphBuilderRef.current.addQuestion(interviewer.trim(), now);
                                    lastQuestionIdRef.current = questionId;
                                } catch (e) {
                                    console.error('Argument graph error:', e);
                                }
                            }
                        }

                        // Only reset the interviewer buffer. Leave user alone.
                        transcriptBufferRef.current.interviewer = '';
                        currentInterviewerTextRef.current = '';
                        setPendingAIText('');
                        // Clear debounced safety timer and set speaking state
                        if (audioEndTimerRef.current) clearTimeout(audioEndTimerRef.current);
                        setIsInterviewerSpeaking(false);

                        // It's technically the user's turn now
                        lastSpeakerRef.current = 'user';

                        // Update last turn end time
                        lastTurnEndTimeRef.current = now;

                        // Update latency metrics
                        setLatencyMetrics(updateLatencyMetrics());
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

            // ── Auto-greet: make the AI speak first ──
            setTimeout(() => {
                if (sessionRef.current) {
                    try {
                        console.log('[GeminiLive] Sending init ping to trigger AI greeting...');
                        sessionRef.current.sendText("Hello! I'm ready for the interview. Please introduce yourself and start.");
                        console.log('[GeminiLive] Init ping sent successfully');
                    } catch (e) {
                        console.error('[GeminiLive] Failed to send init ping:', e);
                    }
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
    }, [systemInstruction, voiceName, cleanup, onTranscriptionComplete, processBargeIn, updateLatencyMetrics]);

    // End the current session
    const endSession = useCallback(() => {
        // Flush any pending transcription buffers before cleanup
        const now = Date.now();

        // Save any pending user text
        if (transcriptBufferRef.current.user.trim()) {
            const userText = transcriptBufferRef.current.user.trim();
            addTranscription({
                speaker: 'user',
                text: userText,
                timestamp: now
            });
            transcriptBufferRef.current.user = '';
        }

        // Save any pending interviewer text
        if (transcriptBufferRef.current.interviewer.trim()) {
            const aiText = transcriptBufferRef.current.interviewer.trim();
            addTranscription({
                speaker: 'interviewer',
                text: aiText,
                timestamp: now
            });
            transcriptBufferRef.current.interviewer = '';
        }

        // Calculate final metrics before cleanup
        setLatencyMetrics(updateLatencyMetrics());

        // Get final argument graph
        setArgumentGraph(argumentGraphBuilderRef.current.getGraph());

        cleanup();
        setStatus(InterviewStatus.ENDED);
        setIsInterviewerSpeaking(false);

        return transcriptionsRef.current;
    }, [cleanup, updateLatencyMetrics, addTranscription]);

    // Calculate reasoning rubric from all transcriptions
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
        // Learning Analytics (Basic)
        latencyMetrics,
        bargeInEvents,
        // Advanced Analytics
        dialogueMetrics,
        argumentGraph,
        getReasoningRubric,
        // Session control
        startSession,
        endSession
    };
}

export default useGeminiLive;
