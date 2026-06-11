import React from 'react';
import { Submission } from '../../../types';

interface SpeechCapturePanelProps {
    submission: Submission;
}

/** Speech capture archive: raw turn captures + queued transcription failures. */
export const SpeechCapturePanel: React.FC<SpeechCapturePanelProps> = ({ submission }) => (
    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
                <h4 className="text-slate-200 font-semibold">Speech capture archive</h4>
                <p className="text-sm text-slate-500 mt-1">Raw turn captures are stored separately from the final transcript so failed or very short turns can still be audited.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                <span>{submission.rawTranscriptTurns?.length || 0} raw turn{(submission.rawTranscriptTurns?.length || 0) !== 1 ? 's' : ''}</span>
                <span>{submission.failedTranscriptions?.length || 0} queued failure{(submission.failedTranscriptions?.length || 0) !== 1 ? 's' : ''}</span>
            </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-3 max-h-[280px] overflow-y-auto custom-scrollbar">
                {(submission.rawTranscriptTurns?.length || 0) === 0 ? (
                    <p className="text-sm text-slate-500">No raw capture turns were preserved for this submission.</p>
                ) : (
                    submission.rawTranscriptTurns!.map((turn, index) => (
                        <div key={turn.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-500">Raw turn {index + 1}</span>
                                <span className={`text-[10px] uppercase tracking-[0.18em] font-bold ${
                                    turn.status === 'transcribed'
                                        ? 'text-emerald-300'
                                        : turn.status === 'failed'
                                            ? 'text-rose-300'
                                            : 'text-amber-300'
                                }`}>
                                    {turn.status.replace('_', ' ')}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 mt-2">
                                <span>{turn.durationMs}ms</span>
                                <span>{turn.sampleCount} samples</span>
                                {turn.latency != null && <span>Latency {turn.latency}ms</span>}
                            </div>
                            <p className="text-xs text-slate-400 mt-2 break-all">
                                {turn.transcriptText || turn.error || 'Awaiting review'}
                            </p>
                        </div>
                    ))
                )}
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-3 max-h-[280px] overflow-y-auto custom-scrollbar">
                {(submission.failedTranscriptions?.length || 0) === 0 ? (
                    <p className="text-sm text-slate-500">No failed or short transcription turns were queued.</p>
                ) : (
                    submission.failedTranscriptions!.map((turn) => (
                        <div key={`failed-${turn.id}`} className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-rose-200">
                                    {turn.status === 'too_short' ? 'Too short' : 'Failed transcription'}
                                </span>
                                <span className="text-[10px] text-rose-200">{turn.durationMs}ms</span>
                            </div>
                            <p className="text-sm text-rose-100 mt-2 leading-relaxed">
                                {turn.error || 'No error detail was stored.'}
                            </p>
                        </div>
                    ))
                )}
            </div>
        </div>
    </div>
);
