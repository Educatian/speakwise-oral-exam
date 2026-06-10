import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Course, InterviewStatus, Submission } from '../../types';
import { useGeminiLive } from '../../hooks';
import { createInterviewerPrompt } from '../../lib/prompts/interviewerSystem';
import { AudioVisualizer } from '../AudioVisualizer';
import { Button, MicTest } from '../ui';
import { EvaluationService } from '../../lib/services/EvaluationService';
import { usePresence } from '../../hooks/usePresence';

interface InterviewSessionViewProps {
    course: Course;
    studentName: string;
    onComplete: (submission: Submission) => void;
    onBack: () => void;
}

const statusCopy = (status: InterviewStatus, turnPhase: string) => {
    if (status === InterviewStatus.CONNECTING) return 'Connecting to interviewer...';
    if (status === InterviewStatus.ENDED) return 'Interview completed';
    if (status === InterviewStatus.ERROR) return 'Connection error';
    if (status !== InterviewStatus.LIVE) return 'Ready to start';
    if (turnPhase === 'ai_speaking') return 'Listen to the prompt';
    if (turnPhase === 'recording') return 'Respond when you are ready';
    if (turnPhase === 'transcribing') return 'Saving your spoken response';
    return 'Preparing the next step';
};

export const InterviewSessionView: React.FC<InterviewSessionViewProps> = ({ course, studentName, onComplete, onBack }) => {
    const scrollAnchorRef = useRef<HTMLDivElement>(null);
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastActivityRef = useRef<number>(Date.now());
    const hasSubmittedRef = useRef(false);

    const [silenceSeconds, setSilenceSeconds] = useState(0);
    const [showThinkingPrompt, setShowThinkingPrompt] = useState(false);
    const [showAnalytics, setShowAnalytics] = useState(false);

    const systemInstruction = useMemo(() => createInterviewerPrompt(course), [course]);
    const {
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
    } = useGeminiLive({
        systemInstruction,
        voiceName: 'Kore',
        silenceThresholdMs: course.interviewSettings?.silenceThresholdMs,
        minTurnDurationMs: course.interviewSettings?.minTurnDurationMs
    });

    const { peerCount } = usePresence(course.id, studentName, status === InterviewStatus.LIVE);

    useEffect(() => {
        scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcriptions, pendingAIText, pendingUserText, isInterviewerSpeaking]);

    useEffect(() => {
        if (status !== InterviewStatus.LIVE || isInterviewerSpeaking || isUserSpeaking) {
            setSilenceSeconds(0);
            setShowThinkingPrompt(false);
            lastActivityRef.current = Date.now();
            return;
        }

        silenceTimerRef.current = setInterval(() => {
            const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
            setSilenceSeconds(elapsed);
            if (elapsed >= 5 && elapsed < 10) setShowThinkingPrompt(true);
        }, 1000);

        return () => {
            if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
        };
    }, [status, isInterviewerSpeaking, isUserSpeaking]);

    useEffect(() => {
        if (isUserSpeaking || isInterviewerSpeaking || pendingUserText || pendingAIText) {
            lastActivityRef.current = Date.now();
            setSilenceSeconds(0);
            setShowThinkingPrompt(false);
        }
    }, [isUserSpeaking, isInterviewerSpeaking, pendingUserText, pendingAIText]);

    const handleEndAndSubmit = async () => {
        if (hasSubmittedRef.current) return;
        hasSubmittedRef.current = true;
        const finalTranscripts = await endSession();

        try {
            const submission = await EvaluationService.evaluateTranscripts({
                courseName: course.name,
                studentName,
                transcriptions: finalTranscripts,
                latencyMetrics,
                bargeInEvents,
                rawTranscriptTurns,
                failedTranscriptions,
                dialogueMetrics,
                argumentGraph,
                reasoningRubric: getReasoningRubric()
            });
            onComplete(submission);
        } catch (submitError) {
            console.error('Failed to generate feedback:', submitError);
            onComplete({
                id: Math.random().toString(36).substr(2, 9),
                studentName,
                courseName: course.name,
                timestamp: Date.now(),
                transcript: finalTranscripts,
                score: 0,
                feedback: 'Feedback generation failed. Please contact your instructor.',
                latencyMetrics,
                bargeInEvents,
                rawTranscriptTurns,
                failedTranscriptions,
                dialogueMetrics,
                argumentGraph,
                reasoningRubric: getReasoningRubric()
            });
        }
    };

    useEffect(() => {
        if (status === InterviewStatus.ENDED && !hasSubmittedRef.current) {
            handleEndAndSubmit();
        }
    }, [status]);

    const supportCards = [
        'Listen fully before answering.',
        'A brief pause is fine before you start.',
        'Use examples when you can explain them clearly.'
    ];

    const analyticsVisible = status === InterviewStatus.LIVE && showAnalytics;
    const phaseCards = [
        { label: 'Connect', active: status === InterviewStatus.CONNECTING || status === InterviewStatus.LIVE || status === InterviewStatus.ENDED, hint: 'Audio link and session setup' },
        { label: 'Listen', active: turnPhase === 'ai_speaking', hint: 'Hear the full prompt first' },
        { label: 'Respond', active: turnPhase === 'recording' || !!pendingUserText, hint: 'Speak at your own pace' },
        { label: 'Review', active: turnPhase === 'transcribing' || status === InterviewStatus.ENDED, hint: 'Transcript and scoring prep' }
    ];

    return (
        <div className="w-full max-w-6xl grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-8 animate-fade-in">
            <div className="xl:col-span-4 space-y-4 lg:space-y-6">
                <div className="glass-panel p-5 sm:p-6 rounded-3xl space-y-5">
                    <div className="text-center">
                        <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20 mb-4">
                            <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-white">{studentName}</h2>
                        <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Course: {course.name}</p>
                        {peerCount > 0 && (
                            <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                <span className="text-xs text-emerald-300">{peerCount} other active participant{peerCount > 1 ? 's' : ''}</span>
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Current state</p>
                        <p className="text-base font-semibold text-white">{isReconnecting ? 'Reconnecting…' : statusCopy(status, turnPhase)}</p>
                        <p className="text-xs text-slate-500 mt-2">
                            {status === InterviewStatus.IDLE
                                ? 'Prepare your microphone, then begin when you feel ready.'
                                : status === InterviewStatus.LIVE
                                    ? 'The transcript updates automatically while the system listens and responds.'
                                    : 'Your work is being prepared for review.'}
                        </p>
                    </div>

                    {isReconnecting && (
                        <div className="flex items-center gap-3 p-3 bg-indigo-500/10 border border-indigo-500/25 rounded-xl" role="status" aria-live="polite">
                            <span className="spinner w-4 h-4 flex-shrink-0" />
                            <p className="text-indigo-200 text-sm">
                                Connection dropped — restoring your session. Your progress is safe; please hold on.
                            </p>
                        </div>
                    )}

                    {recognitionNotice && !isReconnecting && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl" role="status" aria-live="polite">
                            <p className="text-amber-200 text-sm font-medium">{recognitionNotice}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        {phaseCards.map((phase) => (
                            <div
                                key={phase.label}
                                className={`rounded-2xl border px-3 py-3 ${phase.active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-slate-800 bg-slate-900/40 text-slate-500'}`}
                            >
                                <p className="text-[10px] uppercase tracking-[0.18em] font-bold">{phase.label}</p>
                                <p className="text-[11px] mt-1">{phase.hint}</p>
                            </div>
                        ))}
                    </div>

                    {status === InterviewStatus.IDLE ? (
                        <div className="space-y-4">
                            <MicTest className="mb-4" />
                            <Button onClick={startSession} variant="primary" size="lg" className="w-full">
                                Start Interview Session
                            </Button>
                            <p className="text-xs text-slate-500 text-center">Run the microphone check above before starting.</p>
                        </div>
                    ) : status === InterviewStatus.ENDED ? (
                        <Button onClick={onBack} variant="ghost" size="lg" className="w-full">
                            Return to Login
                        </Button>
                    ) : (
                        <div className="space-y-3">
                            <Button onClick={handleEndAndSubmit} variant="danger" size="lg" className="w-full">
                                End and Submit Session
                            </Button>
                            {status === InterviewStatus.LIVE && turnPhase === 'recording' && (
                                <Button onClick={stopRecording} variant="primary" size="md" className="w-full">
                                    Done Speaking
                                </Button>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                            <p className="text-red-400 text-sm font-medium">{error}</p>
                            <ul className="list-disc list-inside text-xs text-slate-500 space-y-1 mt-3">
                                <li>Check microphone permissions in your browser.</li>
                                <li>Close other apps that may be using the microphone.</li>
                                <li>Refresh the page and try again if the connection stalls.</li>
                            </ul>
                            <div className="mt-3 rounded-xl border border-red-500/20 bg-slate-950/30 px-3 py-3 text-xs text-slate-400">
                                If recovery does not work, end this attempt and re-enter with the same student name so the retry remains easy for your instructor to track.
                            </div>
                        </div>
                    )}
                </div>

                <div className="glass-panel p-5 sm:p-6 rounded-3xl flex flex-col items-center justify-center min-h-[150px]">
                    <AudioVisualizer isLive={status === InterviewStatus.LIVE} isActive={turnPhase === 'recording'} color={turnPhase === 'ai_speaking' ? 'accent' : 'primary'} audioLevel={turnPhase === 'recording' ? audioLevel : 0} />
                    <p className={`text-[10px] mt-4 uppercase font-bold tracking-[0.2em] text-center ${turnPhase === 'recording' ? 'text-red-400' : turnPhase === 'ai_speaking' ? 'text-cyan-300' : turnPhase === 'transcribing' ? 'text-amber-400' : 'text-slate-600'}`} aria-hidden="true">
                        {statusCopy(status, turnPhase)}
                    </p>
                    {/* Assertive announcement so screen-reader users track the calm
                        turn flow in real time (the visible caption above is decorative). */}
                    <span className="sr-only" role="status" aria-live="assertive">
                        {status === InterviewStatus.LIVE
                            ? turnPhase === 'ai_speaking'
                                ? 'Listening to the interviewer.'
                                : turnPhase === 'recording'
                                  ? 'Your turn. Respond when you are ready.'
                                  : turnPhase === 'transcribing'
                                    ? 'Saving your response.'
                                    : 'Please wait.'
                            : ''}
                    </span>
                </div>

                <div className="glass-panel p-4 rounded-2xl">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Your voice</span>
                        <span className={`text-[10px] font-bold uppercase ${isUserSpeaking ? 'text-emerald-400' : 'text-slate-600'}`}>{isUserSpeaking ? 'Speaking' : 'Silent'}</span>
                    </div>
                    <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-75 rounded-full ${isUserSpeaking ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-slate-700'}`} style={{ width: `${Math.min(100, audioLevel)}%` }} />
                    </div>
                </div>

                <div className="glass-panel p-4 rounded-2xl">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold">Student support</p>
                            <p className="text-sm text-white mt-1">Keep the session calm and deliberate.</p>
                        </div>
                        <button type="button" onClick={() => setShowAnalytics((current) => !current)} className="results-tab">
                            {showAnalytics ? 'Hide analytics' : 'Show analytics'}
                        </button>
                    </div>
                    <div className="space-y-2 mt-4">
                        {supportCards.map((card) => (
                            <div key={card} className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-300">
                                {card}
                            </div>
                        ))}
                    </div>
                </div>

                {analyticsVisible && status === InterviewStatus.LIVE && (
                    <div className="glass-panel p-4 rounded-2xl space-y-3">
                        <h4 className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Session analytics</h4>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                                <p className="text-slate-400">Avg response</p>
                                <p className="text-emerald-400 font-bold">{latencyMetrics.avgInitialLatency < 1000 ? `${latencyMetrics.avgInitialLatency}ms` : `${(latencyMetrics.avgInitialLatency / 1000).toFixed(1)}s`}</p>
                            </div>
                            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                                <p className="text-slate-400">Turns</p>
                                <p className="text-emerald-400 font-bold">{latencyMetrics.turnCount}</p>
                            </div>
                            <div className="col-span-2 bg-slate-800/50 rounded-lg p-3">
                                <p className="text-slate-400">Reasoning score</p>
                                <p className="text-white font-semibold mt-1">{getReasoningRubric().overallReasoningScore}/100</p>
                                <p className="text-slate-500 mt-1">Barge-in events: {bargeInEvents.length}</p>
                                <p className="text-slate-500 mt-1">Failed turns retained: {failedTranscriptions.length}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="xl:col-span-8 h-[52vh] min-h-[360px] sm:h-[500px] lg:h-[600px] flex flex-col">
                <div className="glass-panel rounded-3xl flex-1 flex flex-col overflow-hidden">
                    <div className="px-4 sm:px-6 py-4 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center gap-3">
                        <div className="flex items-center gap-3">
                            <img src="/examiner-mark.png" alt="" aria-hidden="true" className="w-9 h-9 rounded-xl object-contain ring-1 ring-white/10 flex-shrink-0" />
                            <div>
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Live transcript</h3>
                                <p className="text-xs text-slate-600 mt-1">Dr. SpeakWise — this transcript becomes the basis for evaluation.</p>
                            </div>
                        </div>
                        {status === InterviewStatus.LIVE && <div className="live-indicator live-indicator-ring" aria-label="Live session active" />}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-4 custom-scrollbar" role="log" aria-label="Interview transcript" aria-live="polite">
                        {transcriptions.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-30 text-center space-y-4">
                                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                </svg>
                                <p className="text-slate-400">Your transcript will appear here once the interview begins.</p>
                            </div>
                        ) : (
                            transcriptions.map((item, idx) => (
                                <div key={idx} className={`flex flex-col ${item.speaker === 'user' ? 'items-end' : 'items-start'} animate-slide-in-up`}>
                                    <div className={`chat-bubble ${item.speaker === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'} ${item.isBargeIn ? 'ring-2 ring-amber-500/50' : ''}`}>
                                        <p>{item.text}</p>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[9px] text-slate-600 font-bold uppercase tracking-tight">{item.speaker === 'user' ? studentName : 'AI interviewer'}</span>
                                        {item.latency && item.speaker === 'user' && <span className="text-[8px] text-slate-700 bg-slate-800/50 px-1.5 py-0.5 rounded">{item.latency < 1000 ? `${item.latency} ms` : `${(item.latency / 1000).toFixed(1)} s`}</span>}
                                        {item.isBargeIn && <span className="text-[8px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">Barge-in</span>}
                                    </div>
                                </div>
                            ))
                        )}

                        {status === InterviewStatus.LIVE && pendingAIText && (
                            <div className="flex flex-col items-start animate-pulse">
                                <div className="chat-bubble chat-bubble-ai opacity-80 border border-dashed border-cyan-500/50">
                                    <p className="italic">{pendingAIText}</p>
                                </div>
                                <span className="text-[9px] text-cyan-300 font-bold uppercase tracking-tight mt-1">AI speaking...</span>
                            </div>
                        )}

                        {status === InterviewStatus.LIVE && pendingUserText && (
                            <div className="flex flex-col items-end animate-pulse">
                                <div className="chat-bubble chat-bubble-user opacity-80 border border-dashed border-emerald-500/50">
                                    <p className="italic">{pendingUserText}</p>
                                </div>
                                <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-tight mt-1">You are speaking...</span>
                            </div>
                        )}

                        {status === InterviewStatus.LIVE && turnPhase === 'transcribing' && (
                            <div className="flex flex-col items-center py-4 animate-fade-in">
                                <div className="glass-panel rounded-2xl px-6 py-4 border border-amber-500/30 bg-amber-500/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                                        <span className="text-amber-400 font-medium">Transcribing your answer...</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {status === InterviewStatus.LIVE && showThinkingPrompt && !pendingUserText && !pendingAIText && !isInterviewerSpeaking && (
                            <div className="flex flex-col items-center py-4 animate-fade-in">
                                <div className="glass-panel rounded-2xl px-6 py-4 border border-amber-500/30 bg-amber-500/5">
                                    <p className="text-amber-300 font-medium">
                                        {silenceSeconds >= 10 ? 'Take your time. The interview will continue when you are ready.' : 'A short pause is fine. Gather your response before speaking.'}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">
                                        {silenceSeconds >= 10 ? `Waiting for ${silenceSeconds}s. Say anything to continue.` : `${10 - silenceSeconds}s until the system checks in again.`}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div ref={scrollAnchorRef} />
                    </div>

                    {status === InterviewStatus.ENDED && (
                        <div className="p-6 lg:p-8 bg-slate-900/50 border-t border-slate-800 text-center space-y-4">
                            <div className="flex items-center justify-center gap-2 text-emerald-400">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <h4 className="font-bold">Interview completed</h4>
                            </div>
                            <p className="text-slate-400 text-xs">Your transcript and analysis have been saved successfully.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InterviewSessionView;
