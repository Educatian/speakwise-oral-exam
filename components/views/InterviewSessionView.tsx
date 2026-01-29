import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { Course, InterviewStatus, Submission, TranscriptionItem, RubricBreakdown } from '../../types';
import { useGeminiLive } from '../../hooks';
import { createInterviewerPrompt, createFeedbackPrompt } from '../../lib/prompts/interviewerSystem';
import { AudioVisualizer } from '../AudioVisualizer';
import { Button } from '../ui';
import { sanitizeTranscript } from '../../lib/security/sanitize';

interface InterviewSessionViewProps {
    course: Course;
    studentName: string;
    onComplete: (submission: Submission) => void;
    onBack: () => void;
}

/**
 * Interview Session View
 * Real-time AI-powered oral examination interface
 * Enhanced with Learning Analytics tracking
 */
export const InterviewSessionView: React.FC<InterviewSessionViewProps> = ({
    course,
    studentName,
    onComplete,
    onBack
}) => {
    const scrollAnchorRef = useRef<HTMLDivElement>(null);

    // Silence tracking for thinking prompts
    const [silenceSeconds, setSilenceSeconds] = useState(0);
    const [showThinkingPrompt, setShowThinkingPrompt] = useState(false);
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastActivityRef = useRef<number>(Date.now());

    // Create the system instruction
    const systemInstruction = useMemo(() =>
        createInterviewerPrompt(course),
        [course]
    );

    // Use the Gemini Live hook with LA tracking
    const {
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
    } = useGeminiLive({
        systemInstruction,
        voiceName: 'Kore'
    });

    // Auto-scroll to latest message
    useEffect(() => {
        scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcriptions, isInterviewerSpeaking, pendingUserText, pendingAIText]);

    // Silence detection for thinking prompts
    useEffect(() => {
        // Only track silence when session is live and AI is not speaking
        if (status !== InterviewStatus.LIVE || isInterviewerSpeaking || isUserSpeaking) {
            // Reset when not in silence state
            setSilenceSeconds(0);
            setShowThinkingPrompt(false);
            lastActivityRef.current = Date.now();
            return;
        }

        // Start silence timer
        silenceTimerRef.current = setInterval(() => {
            const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
            setSilenceSeconds(elapsed);

            // Show thinking prompt at 5 seconds
            if (elapsed >= 5 && elapsed < 10) {
                setShowThinkingPrompt(true);
            }
        }, 1000);

        return () => {
            if (silenceTimerRef.current) {
                clearInterval(silenceTimerRef.current);
            }
        };
    }, [status, isInterviewerSpeaking, isUserSpeaking]);

    // Reset silence timer when user speaks or AI responds
    useEffect(() => {
        if (isUserSpeaking || isInterviewerSpeaking || pendingUserText || pendingAIText) {
            lastActivityRef.current = Date.now();
            setSilenceSeconds(0);
            setShowThinkingPrompt(false);
        }
    }, [isUserSpeaking, isInterviewerSpeaking, pendingUserText, pendingAIText]);

    // Generate feedback and submit when session ends
    const handleEndAndSubmit = async () => {
        endSession();

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const transcriptStr = transcriptions
                .map(t => `${t.speaker}: ${sanitizeTranscript(t.text)}`)
                .join('\n');

            const feedbackPrompt = createFeedbackPrompt(course.name, transcriptStr);

            const res = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: feedbackPrompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            score: { type: Type.NUMBER },
                            feedback: { type: Type.STRING },
                            confidenceScore: { type: Type.NUMBER },
                            confidenceRationale: { type: Type.STRING },
                            rubricBreakdown: {
                                type: Type.OBJECT,
                                properties: {
                                    conceptualUnderstanding: {
                                        type: Type.OBJECT,
                                        properties: {
                                            score: { type: Type.NUMBER },
                                            evidence: { type: Type.ARRAY, items: { type: Type.STRING } }
                                        }
                                    },
                                    communicationClarity: {
                                        type: Type.OBJECT,
                                        properties: {
                                            score: { type: Type.NUMBER },
                                            evidence: { type: Type.ARRAY, items: { type: Type.STRING } }
                                        }
                                    },
                                    criticalThinking: {
                                        type: Type.OBJECT,
                                        properties: {
                                            score: { type: Type.NUMBER },
                                            evidence: { type: Type.ARRAY, items: { type: Type.STRING } }
                                        }
                                    },
                                    engagement: {
                                        type: Type.OBJECT,
                                        properties: {
                                            score: { type: Type.NUMBER },
                                            evidence: { type: Type.ARRAY, items: { type: Type.STRING } }
                                        }
                                    }
                                }
                            }
                        },
                        required: ['score', 'feedback']
                    }
                }
            });

            const analysis = JSON.parse(res.text || '{}');

            // Build extended submission with LA data
            const submission: Submission = {
                id: Math.random().toString(36).substr(2, 9),
                studentName,
                courseName: course.name,
                timestamp: Date.now(),
                transcript: transcriptions,
                score: Math.min(100, Math.max(0, Math.round(analysis.score || 0))),
                feedback: analysis.feedback || 'No feedback generated.',

                // Learning Analytics
                latencyMetrics: latencyMetrics,
                bargeInEvents: bargeInEvents,

                // AI Confidence & Rubric
                confidenceScore: analysis.confidenceScore,
                confidenceRationale: analysis.confidenceRationale,
                rubricBreakdown: analysis.rubricBreakdown as RubricBreakdown
            };

            onComplete(submission);
        } catch (e) {
            console.error('Failed to generate feedback:', e);

            // Still submit with default values if feedback generation fails
            const submission: Submission = {
                id: Math.random().toString(36).substr(2, 9),
                studentName,
                courseName: course.name,
                timestamp: Date.now(),
                transcript: transcriptions,
                score: 0,
                feedback: 'Feedback generation failed. Please contact your instructor.',
                latencyMetrics: latencyMetrics,
                bargeInEvents: bargeInEvents
            };

            onComplete(submission);
        }
    };

    const getStatusLabel = () => {
        switch (status) {
            case InterviewStatus.CONNECTING:
                return 'Connecting to interviewer...';
            case InterviewStatus.LIVE:
                return isInterviewerSpeaking ? 'AI is speaking...' : 'Listening to you...';
            case InterviewStatus.ENDED:
                return 'Interview completed';
            case InterviewStatus.ERROR:
                return 'Connection error';
            default:
                return 'Ready to start';
        }
    };

    // Format latency for display
    const formatLatency = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    return (
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 animate-fade-in">
            {/* Left Panel - Controls & Visualizer */}
            <div className="lg:col-span-4 space-y-6">
                {/* Student Info Card */}
                <div className="glass-panel p-6 rounded-3xl text-center space-y-4">
                    <div
                        className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20"
                        aria-hidden="true"
                    >
                        <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-white">{studentName}</h2>
                        <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
                            Course: {course.name}
                        </p>
                    </div>

                    {status === InterviewStatus.IDLE ? (
                        <Button
                            onClick={startSession}
                            variant="primary"
                            size="lg"
                            className="w-full"
                        >
                            Start Interview Session
                        </Button>
                    ) : status === InterviewStatus.ENDED ? (
                        <Button
                            onClick={onBack}
                            variant="ghost"
                            size="lg"
                            className="w-full"
                        >
                            Return to Login
                        </Button>
                    ) : (
                        <Button
                            onClick={handleEndAndSubmit}
                            variant="danger"
                            size="lg"
                            className="w-full"
                        >
                            End & Submit Session
                        </Button>
                    )}
                </div>

                {/* Audio Visualizer Card */}
                <div className="glass-panel p-6 rounded-3xl flex flex-col items-center justify-center min-h-[160px]">
                    <AudioVisualizer
                        isLive={status === InterviewStatus.LIVE}
                        isActive={status === InterviewStatus.LIVE && !isInterviewerSpeaking}
                        color={isInterviewerSpeaking ? 'accent' : 'primary'}
                    />
                    <p
                        className="text-[10px] text-slate-600 mt-4 uppercase font-bold tracking-[0.2em] text-center"
                        role="status"
                        aria-live="polite"
                    >
                        {getStatusLabel()}
                    </p>
                </div>

                {/* Voice Activity Indicator - Shows when user is speaking */}
                {status === InterviewStatus.LIVE && (
                    <div className="glass-panel p-4 rounded-2xl">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                                🎤 Your Voice
                            </span>
                            <span className={`text-[10px] font-bold uppercase ${isUserSpeaking ? 'text-emerald-400' : 'text-slate-600'}`}>
                                {isUserSpeaking ? '● Speaking' : '○ Silent'}
                            </span>
                        </div>
                        {/* Audio Level Bar */}
                        <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all duration-75 rounded-full ${isUserSpeaking
                                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                                    : 'bg-slate-700'
                                    }`}
                                style={{ width: `${Math.min(100, audioLevel)}%` }}
                            />
                        </div>
                        {/* Audio Level Dots */}
                        <div className="flex justify-between mt-2">
                            {[...Array(10)].map((_, i) => (
                                <div
                                    key={i}
                                    className={`w-2 h-2 rounded-full transition-all duration-75 ${audioLevel > i * 10
                                        ? (i < 7 ? 'bg-emerald-400' : 'bg-amber-400')
                                        : 'bg-slate-700'
                                        }`}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Learning Analytics Panel (visible during live session) */}
                {status === InterviewStatus.LIVE && latencyMetrics.turnCount > 0 && (
                    <div className="glass-panel p-4 rounded-2xl space-y-3">
                        <h4 className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                            📊 Session Analytics
                        </h4>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                                <p className="text-slate-400">Avg Response</p>
                                <p className="text-emerald-400 font-bold">
                                    {formatLatency(latencyMetrics.avgInitialLatency)}
                                </p>
                            </div>
                            <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                                <p className="text-slate-400">Turns</p>
                                <p className="text-emerald-400 font-bold">
                                    {latencyMetrics.turnCount}
                                </p>
                            </div>
                            {bargeInEvents.length > 0 && (
                                <div className="col-span-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 text-center">
                                    <p className="text-amber-400 text-xs">
                                        ⚡ {bargeInEvents.length} Barge-in{bargeInEvents.length > 1 ? 's' : ''} detected
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Error Display */}
                {error && (
                    <div
                        className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm"
                        role="alert"
                    >
                        <p className="font-semibold">Connection Error</p>
                        <p className="text-xs mt-1">{error}</p>
                    </div>
                )}
            </div>

            {/* Right Panel - Transcript */}
            <div className="lg:col-span-8 h-[500px] lg:h-[600px] flex flex-col">
                <div className="glass-panel rounded-3xl flex-1 flex flex-col overflow-hidden">
                    {/* Transcript Header */}
                    <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                            Live Transcript
                        </h3>
                        {status === InterviewStatus.LIVE && (
                            <div
                                className="live-indicator live-indicator-ring"
                                aria-label="Live session active"
                            />
                        )}
                    </div>

                    {/* Transcript Content */}
                    <div
                        className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-4 custom-scrollbar"
                        role="log"
                        aria-label="Interview transcript"
                        aria-live="polite"
                    >
                        {transcriptions.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-20 text-center space-y-4">
                                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                </svg>
                                <p>Real-time analysis will begin once the interview starts.</p>
                            </div>
                        ) : (
                            transcriptions.map((item, idx) => (
                                <div
                                    key={idx}
                                    className={`flex flex-col ${item.speaker === 'user' ? 'items-end' : 'items-start'} animate-slide-in-up`}
                                >
                                    <div
                                        className={`chat-bubble ${item.speaker === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'} ${item.isBargeIn ? 'ring-2 ring-amber-500/50' : ''}`}
                                    >
                                        <p>{item.text}</p>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[9px] text-slate-600 font-bold uppercase tracking-tight">
                                            {item.speaker === 'user' ? studentName : 'AI Interviewer'}
                                        </span>
                                        {item.latency && item.speaker === 'user' && (
                                            <span className="text-[8px] text-slate-700 bg-slate-800/50 px-1.5 py-0.5 rounded">
                                                ⏱ {formatLatency(item.latency)}
                                            </span>
                                        )}
                                        {item.isBargeIn && (
                                            <span className="text-[8px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                                ⚡ Barge-in
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}

                        {/* Real-time Pending Transcriptions */}
                        {status === InterviewStatus.LIVE && pendingAIText && (
                            <div className="flex flex-col items-start animate-pulse">
                                <div className="chat-bubble chat-bubble-ai opacity-80 border border-dashed border-purple-500/50">
                                    <p className="italic">{pendingAIText}</p>
                                </div>
                                <span className="text-[9px] text-purple-400 font-bold uppercase tracking-tight mt-1">
                                    🎙️ AI Speaking...
                                </span>
                            </div>
                        )}

                        {status === InterviewStatus.LIVE && pendingUserText && (
                            <div className="flex flex-col items-end animate-pulse">
                                <div className="chat-bubble chat-bubble-user opacity-80 border border-dashed border-emerald-500/50">
                                    <p className="italic">{pendingUserText}</p>
                                </div>
                                <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-tight mt-1">
                                    🎤 You're Speaking...
                                </span>
                            </div>
                        )}

                        {/* Thinking Prompt - Appears after 5 seconds of silence */}
                        {status === InterviewStatus.LIVE && showThinkingPrompt && !pendingUserText && !pendingAIText && !isInterviewerSpeaking && (
                            <div className="flex flex-col items-center py-4 animate-fade-in">
                                <div className="glass-panel rounded-2xl px-6 py-4 border border-amber-500/30 bg-amber-500/5">
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">🤔</span>
                                        <div>
                                            <p className="text-amber-400 font-medium">
                                                {silenceSeconds >= 10
                                                    ? "Take your time! I'll move to the next question when you're ready."
                                                    : "Are you thinking? Take your time..."}
                                            </p>
                                            <p className="text-xs text-slate-400 mt-1">
                                                {silenceSeconds >= 10
                                                    ? `Waiting for ${silenceSeconds}s - Say anything to continue`
                                                    : `${10 - silenceSeconds}s until next question...`}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={scrollAnchorRef} />
                    </div>

                    {/* Completion Message */}
                    {status === InterviewStatus.ENDED && (
                        <div className="p-6 lg:p-8 bg-slate-900/50 border-t border-slate-800 text-center space-y-4">
                            <div className="flex items-center justify-center gap-2 text-emerald-400">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <h4 className="font-bold">Interview Completed!</h4>
                            </div>
                            <p className="text-slate-400 text-xs">
                                Your transcript, analytics, and AI analysis have been saved successfully.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InterviewSessionView;
