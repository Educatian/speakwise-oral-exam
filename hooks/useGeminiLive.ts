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
import { decode, decodeAudioData, createBlob } from '../utils/audioHelpers';
import {
    analyzeReasoningPatterns,
    calculateReasoningScores,
    detectRephrasing,
    detectTurnInitiative,
    ArgumentGraphBuilder
} from '../lib/reasoning';

interface UseGeminiLiveOptions {
    systemInstruction: string;
    voiceName?: string;
    onTranscriptionComplete?: (transcriptions: TranscriptionItem[]) => void;
}

// Default latency metrics
const DEFAULT_LATENCY_METRICS: LatencyMetrics = {
    avgInitialLatency: 0,
    maxLatency: 0,
    minLatency: Infinity,
    totalThinkingTime: 0,
    turnCount: 0,
    turnTakingRatio: 0
};

// Default dialogue metrics
const DEFAULT_DIALOGUE_METRICS: DialogueMetrics = {
    turnInitiatives: 0,
    rephrasingEvents: 0,
    followUpDepth: [],
    avgFollowUpDepth: 0,
    latencyVariation: 0,
    questionResponseRatio: 0
};

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

    // Calculate latency metrics
    const calculateLatencyMetrics = useCallback((): LatencyMetrics => {
        const latencies = latencyListRef.current;
        if (latencies.length === 0) {
            return DEFAULT_LATENCY_METRICS;
        }

        const sum = latencies.reduce((a, b) => a + b, 0);
        const avg = sum / latencies.length;
        const max = Math.max(...latencies);
        const min = Math.min(...latencies);

        const userTime = userSpeakingTimeRef.current;
        const interviewerTime = interviewerSpeakingTimeRef.current;
        const ratio = interviewerTime > 0 ? userTime / interviewerTime : 0;

        return {
            avgInitialLatency: Math.round(avg),
            maxLatency: max,
            minLatency: min === Infinity ? 0 : min,
            totalThinkingTime: sum,
            turnCount: latencies.length,
            turnTakingRatio: Math.round(ratio * 100) / 100
        };
    }, []);

    // Detect and log barge-in events
    const detectBargeIn = useCallback((userText: string) => {
        if (isInterviewerSpeaking && currentInterviewerTextRef.current) {
            const event: BargeInEvent = {
                timestamp: Date.now(),
                interruptedContent: currentInterviewerTextRef.current,
                studentUtterance: userText,
                interpretationType: 'unknown' // Could be enhanced with NLP
            };
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
            const inputCtx = new AudioContext({ sampleRate: 48000 });
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
                            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
                            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
                            prefixPaddingMs: 300,
                            silenceDurationMs: 1200
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

                        // Set up audio capture
                        const source = inputCtx.createMediaStreamSource(stream);
                        const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);

                        // Calculate resampling ratio
                        const inputSampleRate = inputCtx.sampleRate;
                        const outputSampleRate = 16000;
                        const ratio = inputSampleRate / outputSampleRate;

                        scriptProcessor.onaudioprocess = (e) => {
                            const inputData = e.inputBuffer.getChannelData(0);

                            // Calculate audio level for voice activity indicator
                            let sum = 0;
                            for (let i = 0; i < inputData.length; i++) {
                                sum += inputData[i] * inputData[i];
                            }
                            const rms = Math.sqrt(sum / inputData.length);
                            const normalizedLevel = Math.min(100, Math.round(rms * 500)); // Normalize to 0-100
                            setAudioLevel(normalizedLevel);

                            // Detect if user is speaking (threshold-based)
                            const isSpeaking = normalizedLevel > 8;
                            setIsUserSpeaking(isSpeaking);

                            // Resample to 16kHz if needed
                            let pcmData: Float32Array;
                            if (ratio !== 1) {
                                const outputLength = Math.floor(inputData.length / ratio);
                                pcmData = new Float32Array(outputLength);
                                for (let i = 0; i < outputLength; i++) {
                                    pcmData[i] = inputData[Math.floor(i * ratio)];
                                }
                            } else {
                                // Create a copy to avoid mutated data
                                pcmData = new Float32Array(inputData);
                            }

                            const pcmBlob = createBlob(pcmData);



                            // Only send if session is still active
                            sessionPromise.then(s => {
                                if (sessionRef.current) {
                                    try {
                                        s.sendRealtimeInput({ media: pcmBlob });
                                    } catch {
                                        // Ignore errors if session closed
                                    }
                                }
                            });
                        };

                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputCtx.destination);
                    },

                    onmessage: async (message: LiveServerMessage) => {
                        const sc = message.serverContent;
                        const hasAudio = !!sc?.modelTurn?.parts?.[0]?.inlineData?.data;

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
                                detectBargeIn(userText);
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


                                setTranscriptions(prev => [...prev, {
                                    speaker: 'user',
                                    text: userText,
                                    timestamp: now,
                                    latency: latency > 0 ? latency : undefined,
                                    duration: estimatedDuration,
                                    isBargeIn: isInterviewerSpeaking
                                }]);

                                transcriptBufferRef.current.user = '';
                                setPendingUserText('');
                                setLatencyMetrics(calculateLatencyMetrics());
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
                            setLatencyMetrics(calculateLatencyMetrics());
                        }
                    },

                    onclose: () => {
                        setStatus(InterviewStatus.ENDED);
                        setLatencyMetrics(calculateLatencyMetrics());
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
    }, [systemInstruction, voiceName, cleanup, onTranscriptionComplete, transcriptions, detectBargeIn, calculateLatencyMetrics, isInterviewerSpeaking]);

    // End the current session
    const endSession = useCallback(() => {
        // Calculate final metrics before cleanup
        setLatencyMetrics(calculateLatencyMetrics());
        cleanup();
        setStatus(InterviewStatus.ENDED);
        setIsInterviewerSpeaking(false);
    }, [cleanup, calculateLatencyMetrics]);

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
        latencyMetrics,
        bargeInEvents,
        startSession,
        endSession
    };
}

export default useGeminiLive;
