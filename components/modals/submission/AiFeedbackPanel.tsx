import React from 'react';
import { Submission } from '../../../types';

interface AiFeedbackPanelProps {
    submission: Submission;
}

/** AI feedback quote plus confidence score / rationale. */
export const AiFeedbackPanel: React.FC<AiFeedbackPanelProps> = ({ submission }) => (
    <div className="bg-indigo-500/5 border border-indigo-500/20 p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h4 className="text-indigo-400 font-bold text-sm uppercase">AI feedback</h4>
        </div>
        <p className="text-slate-300 text-sm leading-relaxed italic">
            "{submission.feedback}"
        </p>
        {typeof submission.confidenceScore === 'number' && (
            <div className="mt-3 pt-3 border-t border-indigo-500/20 flex items-center justify-between text-xs">
                <span className="text-slate-500 uppercase tracking-widest">AI Confidence</span>
                <span className="text-indigo-300 font-bold tabular-nums">
                    {(submission.confidenceScore * 100).toFixed(0)}%
                </span>
            </div>
        )}
        {submission.confidenceRationale && (
            <p className="text-slate-500 text-xs mt-2 italic">
                {submission.confidenceRationale}
            </p>
        )}
    </div>
);
