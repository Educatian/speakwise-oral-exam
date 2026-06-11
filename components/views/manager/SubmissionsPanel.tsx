import React from 'react';
import { Submission } from '../../../types';
import { getMasteryLevel } from '../../../lib/utils/scoreDisplay';
import { DashboardSubmission } from '../../../lib/utils/managerDashboard';

interface SubmissionsPanelProps {
    isAdmin: boolean;
    visibleCourseCount: number;
    allSubmissions: DashboardSubmission[];
    totalSubmissions: number;
    onSelectSubmission: (submission: Submission) => void;
    onDeleteSubmission: (courseId: string, submissionId: string) => void;
}

/**
 * Right-column "Student Submissions" feed. Selecting a row hands the
 * submission to the parent (which opens SubmissionDetailModal upstream).
 */
export const SubmissionsPanel: React.FC<SubmissionsPanelProps> = ({
    isAdmin,
    visibleCourseCount,
    allSubmissions,
    totalSubmissions,
    onSelectSubmission,
    onDeleteSubmission
}) => (
    <div className="glass-panel rounded-3xl overflow-hidden flex flex-col min-h-[500px]">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/30">
            <h3 className="text-lg font-semibold text-white">Student Submissions</h3>
            <span className="text-xs text-slate-500">
                {totalSubmissions} Total Interview{totalSubmissions !== 1 ? 's' : ''}
            </span>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-4 custom-scrollbar">
            {/* Check: Admin or course owner can see submissions */}
            {!isAdmin && visibleCourseCount === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 py-20">
                    <svg className="w-16 h-16 mb-4 text-red-500/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <p className="text-slate-500 font-medium mb-2">No Courses Found</p>
                    <p className="text-slate-600 text-sm text-center max-w-xs">
                        Create a course to view student submissions.
                    </p>
                </div>
            ) : totalSubmissions === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 py-20">
                    <svg className="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p>Awaiting student submissions...</p>
                </div>
            ) : (
                allSubmissions.map(sub => {
                    const finalScore = sub.instructorReview?.overrideScore ?? sub.score;
                    const mastery = getMasteryLevel(finalScore);

                    return (
                    <div
                        key={sub.id}
                        className="w-full bg-slate-900/50 border border-slate-800 p-4 rounded-2xl hover:border-indigo-500/30 transition-all group"
                    >
                        <div className="flex justify-between items-center">
                            <button
                                className="flex-1 text-left cursor-pointer"
                                onClick={() => onSelectSubmission(sub)}
                                aria-label={`View submission from ${sub.studentName}`}
                            >
                                <div>
                                    <p className="text-white font-bold">{sub.studentName}</p>
                                    <p className="text-xs text-slate-400">
                                        {sub.courseName} • {new Date(sub.timestamp).toLocaleDateString()}
                                    </p>
                                </div>
                            </button>
                            <div className="flex items-center gap-3">
                                <button
                                    className="flex-1 text-left cursor-pointer"
                                    onClick={() => onSelectSubmission(sub)}
                                >
                                    <div className="text-right">
                                        <div className={`text-xl font-bold ${mastery.color}`}>
                                            {mastery.emoji} {finalScore}%
                                        </div>
                                        <p className={`text-[10px] uppercase ${mastery.color}`}>
                                            {mastery.label}
                                        </p>
                                    </div>
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`Delete ${sub.studentName}'s submission?`)) {
                                            onDeleteSubmission(sub._courseId, sub.id);
                                        }
                                    }}
                                    className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    title="Delete submission"
                                    aria-label={`Delete submission from ${sub.studentName}`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                    );
                })
            )}
        </div>
    </div>
);
