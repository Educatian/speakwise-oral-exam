import React from 'react';
import { Submission } from '../../types';
import { Button } from '../ui';

interface StudentHistoryViewProps {
    submissions: Submission[];
    onSelectSubmission: (submission: Submission) => void;
    onBack: () => void;
}

/**
 * Student History View
 * Displays student's past interview submissions and scores
 */
export const StudentHistoryView: React.FC<StudentHistoryViewProps> = ({
    submissions,
    onSelectSubmission,
    onBack
}) => {
    return (
        <div className="w-full max-w-4xl mx-auto space-y-8 animate-slide-in-up">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">My Interview History</h2>
                    <p className="text-slate-400 text-sm">Review your past performance and insights</p>
                </div>
                <Button variant="ghost" onClick={onBack}>
                    Back to Login
                </Button>
            </div>

            {/* History List */}
            <div className="glass-panel rounded-3xl overflow-hidden min-h-[400px]">
                <div className="p-6 md:p-8 space-y-4">
                    {submissions.length === 0 ? (
                        <div className="text-center py-20 text-slate-600 space-y-4">
                            <svg
                                className="w-16 h-16 mx-auto opacity-20"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1}
                                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <p>No completed interviews yet.</p>
                            <p className="text-sm">Complete an interview to see your results here.</p>
                        </div>
                    ) : (
                        <ul className="space-y-4" role="list" aria-label="Interview history">
                            {submissions.map((sub, index) => (
                                <li key={sub.id}>
                                    <button
                                        onClick={() => onSelectSubmission(sub)}
                                        className="w-full bg-slate-900/50 border border-slate-800 p-4 md:p-6 rounded-2xl hover:border-emerald-500/30 transition-all cursor-pointer flex justify-between items-center text-left group"
                                        aria-label={`View interview for ${sub.courseName || 'General Interview'}, scored ${sub.score}%`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <h4 className="text-white font-bold text-lg truncate group-hover:text-emerald-400 transition-colors">
                                                {sub.courseName || 'General Interview'}
                                            </h4>
                                            <p className="text-sm text-slate-400">
                                                <time dateTime={new Date(sub.timestamp).toISOString()}>
                                                    {new Date(sub.timestamp).toLocaleString()}
                                                </time>
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-4 md:gap-6 flex-shrink-0 ml-4">
                                            <div className="text-right">
                                                <span
                                                    className={`block text-2xl font-bold ${sub.score >= 80 ? 'text-emerald-400' :
                                                            sub.score >= 60 ? 'text-yellow-400' : 'text-red-400'
                                                        }`}
                                                >
                                                    {sub.score}%
                                                </span>
                                                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                                                    Grade
                                                </span>
                                            </div>
                                            <svg
                                                className="w-5 h-5 text-slate-700 group-hover:text-slate-400 transition-colors"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                                aria-hidden="true"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* Stats Summary */}
            {submissions.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="glass-panel p-4 rounded-2xl text-center">
                        <p className="text-2xl font-bold text-white">{submissions.length}</p>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Total</p>
                    </div>
                    <div className="glass-panel p-4 rounded-2xl text-center">
                        <p className="text-2xl font-bold text-emerald-400">
                            {Math.round(submissions.reduce((a, b) => a + b.score, 0) / submissions.length)}%
                        </p>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Avg Score</p>
                    </div>
                    <div className="glass-panel p-4 rounded-2xl text-center">
                        <p className="text-2xl font-bold text-indigo-400">
                            {Math.max(...submissions.map(s => s.score))}%
                        </p>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Best</p>
                    </div>
                    <div className="glass-panel p-4 rounded-2xl text-center">
                        <p className="text-2xl font-bold text-slate-400">
                            {submissions[0]?.courseName?.split(' ').slice(0, 2).join(' ') || 'N/A'}
                        </p>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Latest</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentHistoryView;
