import { useState, useEffect, useRef, useCallback } from 'react';
import {
    GoogleGenAI,
    Modality,
    LiveServerMessage,
    StartSensitivity,
    EndSensitivity,
    ActivityHandling
} from '@google/genai';
import {
    InterviewStatus,
    TranscriptionItem,
    AudioContexts,
    UseGeminiLiveReturn,
    LatencyMetrics,
    BargeInEvent,
    DialogueMetrics,
    ArgumentGraph
} from '../types';
import { decode, decodeAudioData } from '../utils/audioHelpers';
import { createAudioProcessor, fadeOutAudioSource, AudioProcessorResult } from '../utils/audioPipeline';
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
    // Available voices:
    // - Puck (Upbeat, 남성)     - Charon (Informative, 남성)  - Fenrir (Excitable, 남성)
    // - Kore (Firm, 여성)       - Aoede (Breezy, 여성)        - Leda (Youthful, 여성)
    // - Orus (Firm, 남성)       - Zephyr (Bright, 중성)
    const { systemInstruction, voiceName = 'Kore', onTranscriptionComplete } = options;

    // Session State
    const [status, setStatus] = useState<InterviewStatus>(InterviewStatus.IDLE);
    const [transcriptions, setTranscriptions] = useState<TranscriptionItem[]>([]);
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

    // Refs for audio management
    const audioContextRef = useRef<AudioContexts | null>(null);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const nextStartTimeRef = useRef<number>(0);
    const sessionRef = useRef<any>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const transcriptBufferRef = useRef({ user: '', interviewer: '' });
    const audioProcessorRef = useRef<AudioProcessorResult | null>(null);

    // Learning Analytics Refs
    const lastTurnEndTimeRef = useRef<number>(0);
    const userSpeakingTimeRef = useRef<number>(0);
    const interviewerSpeakingTimeRef = useRef<number>(0);
    const currentInterviewerTextRef = useRef<string>('');
    const turnStartTimeRef = useRef<number>(0);
    const latencyListRef = useRef<number[]>([]);
    const argumentGraphBuilderRef = useRef<ArgumentGraphBuilder>(new ArgumentGraphBuilder());
    const lastQuestionIdRef = useRef<string>('');
    const previousUserTextRef = useRef<string>('');
    const lastSpeakerRef = useRef<'user' | 'ai' | null>(null); // Track who was speaking last

    // Cleanup function
    const cleanup = useCallback(() => {
        // Stop all audio sources
        sourcesRef.current.forEach(source => {
            try {
                source.stop();
                source.disconnect();
            } catch (e) {
                // Source may already be stopped
            }
        });
        sourcesRef.current.clear();

        // Cleanup audio processor
        if (audioProcessorRef.current) {
            audioProcessorRef.current.cleanup();
            audioProcessorRef.current = null;
        }

        // Close audio contexts
        if (audioContextRef.current) {
            audioContextRef.current.input.close().catch(() => { });
            audioContextRef.current.output.close().catch(() => { });
            audioContextRef.current = null;
        }

        // Stop media stream
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        // Close session
        if (sessionRef.current) {
            try {
                sessionRef.current.close();
            } catch (e) {
                // Session may already be closed
            }
            sessionRef.current = null;
        }

        // Reset refs
        nextStartTimeRef.current = 0;
        transcriptBufferRef.current = { user: '', interviewer: '' };
        lastTurnEndTimeRef.current = 0;
        currentInterviewerTextRef.current = '';
    }, []);

    // Calculate latency metrics using external utilities
    const updateLatencyMetrics = useCallback(() => {
        const metrics = calculateLatencyMetrics(
            latencyListRef.current,
            userSpeakingTimeRef.current,
            interviewerSpeakingTimeRef.current
        );
        return metrics;
    }, []);

    // Detect and log barge-in events
    const processBargeIn = useCallback((userText: string) => {
        const event = detectBargeInEvent(
            isInterviewerSpeaking,
            currentInterviewerTextRef.current,
            userText
        );
        if (event) {
            setBargeInEvents(prev => [...prev, event]);
            return true;
        }
        return false;
    }, [isInterviewerSpeaking]);

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

            // Initialize Google GenAI
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

            // Initialize audio contexts
            // Note: Input context uses default sample rate to match system microphone
            // This avoids "Connecting AudioNodes with different sample-rate" error
            const inputCtx = new AudioContext();
            const outputCtx = new AudioContext({ sampleRate: 24000 });
            audioContextRef.current = { input: inputCtx, output: outputCtx };

            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName } }
                    },
                    // Enable transcription (auto-detect language)
                    outputAudioTranscription: {},
                    inputAudioTranscription: {},
                    systemInstruction: {
                        parts: [{ text: systemInstruction }]
                    },
                    realtimeInputConfig: {
                        automaticActivityDetection: {
                            disabled: false,
                            // HIGH sensitivity = detect speech start faster (avoid missing beginning)
                            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
                            // HIGH end sensitivity = trigger turn end even when speech goes quiet
                            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
                            // Capture more audio before speech is detected (800ms buffer to ensure no clipping)
                            prefixPaddingMs: 800,
                            // Wait 1.5s of silence before ending turn
                            silenceDurationMs: 1500
                        },
                        activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS
                    }
                },
                callbacks: {
                    onopen: async () => {
                        setStatus(InterviewStatus.LIVE);

                        // Get microphone access
                        const stream = await navigator.mediaDevices.getUserMedia({
                            audio: {
                                echoCancellation: true,
                                noiseSuppression: true,
                                autoGainControl: true
                            }
                        });
                        streamRef.current = stream;

                        // Set up audio processing with new pipeline
                        // Uses AudioWorklet if available, falls back to ScriptProcessor
                        // Includes linear interpolation resampling and adaptive noise threshold
                        audioProcessorRef.current = await createAudioProcessor(
                            inputCtx,
                            stream,
                            {
                                onAudioLevel: (level) => {
                                    setAudioLevel(level);
                                },
                                onVoiceActivity: (isSpeaking) => {
                                    setIsUserSpeaking(isSpeaking);
                                },
                                onPCMData: (pcmBlob) => {
                                    // Send audio to Gemini if session active
                                    sessionPromise.then(s => {
                                        if (sessionRef.current) {
                                            try {
                                                s.sendRealtimeInput({ media: pcmBlob });
                                            } catch {
                                                // Ignore errors if session closed
                                            }
                                        }
                                    });
                                },
                                onCalibration: (noiseFloor, threshold) => {
                                    console.log(`[Audio] Calibrated - Noise floor: ${noiseFloor.toFixed(4)}, Threshold: ${threshold.toFixed(4)}`);
                                }
                            }
                        );

                        // Force the AI to start speaking by acting as the initializing turn
                        sessionPromise.then(s => {
                            if (s) {
                                // Add a short delay to ensure the server is ready to receive input
                                setTimeout(() => {
                                    try {
                                        (s as any).send({
                                            clientContent: {
                                                turns: [{
                                                    role: 'user',
                                                    parts: [{ text: "Hello, I have joined the room. Please begin the interview and introduce yourself." }]
                                                }],
                                                turnComplete: true
                                            }
                                        });
                                        console.log('[GeminiLive] Sent init ping to trigger AI introduction');
                                    } catch (e) {
                                        console.error('Failed to send initial ping to AI', e);
                                    }
                                }, 500);
                            }
                        });
                    },

                    onmessage: async (message: LiveServerMessage) => {
                        const sc = message.serverContent;
                        const hasAudio = !!sc?.modelTurn?.parts?.[0]?.inlineData?.data;

                        // ── Diagnostics: trace every message type ──
                        const msgTypes: string[] = [];
                        if (hasAudio) msgTypes.push('AUDIO');
                        if (sc?.inputTranscription) msgTypes.push(`INPUT_TRANSCRIPT: "${sc.inputTranscription.text?.substring(0, 40)}"`);
                        if (sc?.outputTranscription) msgTypes.push(`OUTPUT_TRANSCRIPT: "${sc.outputTranscription.text?.substring(0, 40)}"`);
                        if (sc?.turnComplete) msgTypes.push('TURN_COMPLETE');
                        if (msgTypes.length > 0) {
                            console.log(`[GeminiLive] Message: ${msgTypes.join(' | ')}`);
                        }

                        // Handle audio output
                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio) {
                            setIsInterviewerSpeaking(true);
                            const outCtx = audioContextRef.current?.output;

                            if (outCtx) {
                                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);

                                try {
                                    const audioBuffer = await decodeAudioData(
                                        decode(base64Audio),
                                        outCtx,
                                        24000,
                                        1
                                    );
                                    const audioSource = outCtx.createBufferSource();
                                    audioSource.buffer = audioBuffer;
                                    audioSource.connect(outCtx.destination);

                                    audioSource.addEventListener('ended', () => {
                                        sourcesRef.current.delete(audioSource);
                                        if (sourcesRef.current.size === 0) {
                                            setIsInterviewerSpeaking(false);
                                            // Track interviewer speaking time
                                            interviewerSpeakingTimeRef.current += audioBuffer.duration * 1000;
                                        }
                                    });

                                    audioSource.start(nextStartTimeRef.current);
                                    nextStartTimeRef.current += audioBuffer.duration;
                                    sourcesRef.current.add(audioSource);
                                } catch (audioError) {
                                    console.error('Audio playback error:', audioError);
                                }
                            }
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

                                setTranscriptions(prev => [...prev, {
                                    speaker: 'interviewer',
                                    text: aiText,
                                    timestamp: now
                                }]);

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
                                argumentGraphBuilderRef.current.processUserUtterance(
                                    userText,
                                    now,
                                    lastQuestionIdRef.current || undefined
                                );

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

                                setTranscriptions(prev => [...prev, {
                                    speaker: 'user',
                                    text: userText,
                                    timestamp: now,
                                    latency: latency > 0 ? latency : undefined,
                                    duration: estimatedDuration,
                                    isBargeIn: isInterviewerSpeaking
                                }]);

                                setPendingUserText('');
                                setLatencyMetrics(updateLatencyMetrics());
                            }
                            lastSpeakerRef.current = 'ai';
                        }

                        // Process completed turn (fallback if turnComplete fires)
                        if (message.serverContent?.turnComplete) {

                            const { user, interviewer } = transcriptBufferRef.current;
                            const now = Date.now();

                            if (user.trim()) {
                                const latency = lastTurnEndTimeRef.current > 0
                                    ? now - lastTurnEndTimeRef.current
                                    : 0;

                                if (latency > 0 && latency < 60000) {
                                    latencyListRef.current.push(latency);
                                }

                                const estimatedDuration = user.trim().length * 50;
                                userSpeakingTimeRef.current += estimatedDuration;

                                setTranscriptions(prev => [...prev, {
                                    speaker: 'user',
                                    text: user.trim(),
                                    timestamp: now,
                                    latency: latency > 0 ? latency : undefined,
                                    duration: estimatedDuration,
                                    isBargeIn: isInterviewerSpeaking
                                }]);
                            }
                            if (interviewer.trim()) {
                                setTranscriptions(prev => [...prev, {
                                    speaker: 'interviewer',
                                    text: interviewer.trim(),
                                    timestamp: now
                                }]);
                            }

                            // Update last turn end time
                            lastTurnEndTimeRef.current = now;
                            transcriptBufferRef.current = { user: '', interviewer: '' };
                            currentInterviewerTextRef.current = '';

                            // Clear pending text displays
                            setPendingUserText('');
                            setPendingAIText('');

                            // Update latency metrics
                            setLatencyMetrics(updateLatencyMetrics());
                        }
                    },

                    onclose: () => {
                        setStatus(InterviewStatus.ENDED);
                        setLatencyMetrics(updateLatencyMetrics());
                        if (onTranscriptionComplete) {
                            onTranscriptionComplete(transcriptions);
                        }
                    },

                    onerror: (err) => {
                        console.error('Gemini Live error:', err);
                        setError('Connection error occurred. Please try again.');
                        setStatus(InterviewStatus.ERROR);
                        cleanup();
                    }
                }
            });

            sessionRef.current = await sessionPromise;

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
    }, [systemInstruction, voiceName, cleanup, onTranscriptionComplete, transcriptions, processBargeIn, updateLatencyMetrics, isInterviewerSpeaking]);

    // End the current session
    const endSession = useCallback(() => {
        // Flush any pending transcription buffers before cleanup
        const now = Date.now();

        // Save any pending user text
        if (transcriptBufferRef.current.user.trim()) {
            const userText = transcriptBufferRef.current.user.trim();
            setTranscriptions(prev => [...prev, {
                speaker: 'user',
                text: userText,
                timestamp: now
            }]);
            transcriptBufferRef.current.user = '';
        }

        // Save any pending interviewer text
        if (transcriptBufferRef.current.interviewer.trim()) {
            const aiText = transcriptBufferRef.current.interviewer.trim();
            setTranscriptions(prev => [...prev, {
                speaker: 'interviewer',
                text: aiText,
                timestamp: now
            }]);
            transcriptBufferRef.current.interviewer = '';
        }

        // Calculate final metrics before cleanup
        setLatencyMetrics(updateLatencyMetrics());

        // Get final argument graph
        setArgumentGraph(argumentGraphBuilderRef.current.getGraph());

        cleanup();
        setStatus(InterviewStatus.ENDED);
        setIsInterviewerSpeaking(false);
    }, [cleanup, updateLatencyMetrics]);

    // Calculate reasoning rubric from all transcriptions
    const getReasoningRubric = useCallback(() => {
        const userText = transcriptions
            .filter(t => t.speaker === 'user')
            .map(t => t.text)
            .join(' ');

        const patterns = analyzeReasoningPatterns(userText);
        return calculateReasoningScores(patterns);
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
